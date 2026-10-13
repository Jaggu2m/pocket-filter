import { pool } from '../config/database.js';
import { createHash } from 'node:crypto';
import { csvStatementParser } from './statement-parsers/csv.parser.js';
import { pdfStatementParser } from './statement-parsers/pdf.parser.js';
import { accountRepository } from '../repositories/account.repository.js';
import { BadRequestError, NotFoundError } from '../errors/app-error.js';

export interface PreviewTransactionItem {
  tempId: string;
  date: string;
  merchant: string | null;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  importHash: string;
  isDuplicate: boolean;
}

export interface StatementPreviewResult {
  fileName: string;
  fileType: 'csv' | 'pdf';
  accountId: string | null;
  accountName: string | null;
  totalParsed: number;
  duplicateCount: number;
  transactions: PreviewTransactionItem[];
}

export interface ConfirmTransactionItem {
  date: Date | string;
  merchant?: string | null;
  description?: string | null;
  amount: number;
  type: 'income' | 'expense';
  category?: string;
  importHash?: string;
}

export interface ConfirmImportInput {
  fileName: string;
  fileType: 'csv' | 'pdf';
  accountId?: string | null;
  transactions: ConfirmTransactionItem[];
}

export interface ImportBatchRecord {
  id: string;
  userId: string;
  accountId: string | null;
  fileName: string;
  fileType: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  status: string;
  createdAt: Date;
}

export class StatementService {
  async previewStatement(
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    accountId?: string | null,
  ): Promise<StatementPreviewResult> {
    const ext = originalName.split('.').pop()?.toLowerCase();
    const fileType: 'csv' | 'pdf' = ext === 'pdf' ? 'pdf' : 'csv';
    this.validateFileSignature(fileBuffer, fileType);

    let accountName: string | null = null;
    if (accountId) {
      const acc = await accountRepository.findById(accountId, userId);
      if (!acc) {
        throw new NotFoundError('Selected account not found');
      }
      accountName = acc.name;
    }

    const rawRecords =
      fileType === 'pdf'
        ? await pdfStatementParser.parse(fileBuffer)
        : csvStatementParser.parse(fileBuffer);

    if (rawRecords.length === 0) {
      throw new BadRequestError('No valid transactions found in statement');
    }

    // Check for duplicates against existing database records
    const previewList: PreviewTransactionItem[] = [];
    let duplicateCount = 0;

    for (let i = 0; i < rawRecords.length; i++) {
      const item = rawRecords[i];
      const importHash = this.createImportHash(item.date, item.amount, item.type, item.rawDescription);

      const dupCheck = await pool.query(
        `SELECT id FROM transactions
         WHERE user_id = $1 AND import_hash = $2
         LIMIT 1`,
        [userId, importHash],
      );

      const isDuplicate = dupCheck.rows.length > 0;
      if (isDuplicate) duplicateCount++;

      previewList.push({
        tempId: `tmp_${i + 1}`,
        date: item.date.toISOString(),
        merchant: item.merchant,
        description: item.rawDescription,
        amount: item.amount,
        type: item.type,
        category: item.category,
        importHash,
        isDuplicate,
      });
    }

    return {
      fileName: originalName,
      fileType,
      accountId: accountId || null,
      accountName,
      totalParsed: rawRecords.length,
      duplicateCount,
      transactions: previewList,
    };
  }

  async confirmImport(
    userId: string,
    input: ConfirmImportInput,
  ): Promise<{ batchId: string; importedCount: number; duplicateCount: number }> {
    if (!input.transactions || input.transactions.length === 0) {
      throw new BadRequestError('No transactions provided for confirmation');
    }

    if (input.accountId) {
      const acc = await accountRepository.findById(input.accountId, userId);
      if (!acc) {
        throw new NotFoundError('Selected account not found');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let balanceDelta = 0;
      let importedCount = 0;
      let duplicateCount = 0;

      for (const item of input.transactions) {
        const description = item.description || item.merchant || 'Imported statement transaction';
        const importHash = this.createImportHash(new Date(item.date), item.amount, item.type, description);
        const inserted = await client.query(
          `INSERT INTO transactions (
            user_id, account_id, type, amount, category, merchant, description, date, payment_rail, import_hash
          )
          VALUES ($1, $2, $3, $4, COALESCE($5, 'General'), $6, $7, $8, 'STATEMENT_IMPORT', $9)
          ON CONFLICT DO NOTHING
          RETURNING id`,
          [
            userId,
            input.accountId || null,
            item.type,
            item.amount,
            item.category || 'General',
            item.merchant || null,
            item.description || null,
            new Date(item.date),
            importHash,
          ],
        );

        if ((inserted.rowCount ?? 0) === 0) {
          duplicateCount++;
          continue;
        }

        if (input.accountId) {
          balanceDelta += item.type === 'income' ? item.amount : -item.amount;
        }
        importedCount++;
      }

      // If linked to an account, sync balance atomically
      if (input.accountId && balanceDelta !== 0) {
        await client.query(
          `UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [balanceDelta, input.accountId],
        );
      }

      // Record batch history
      const batchRes = await client.query(
        `INSERT INTO import_batches (
          user_id, account_id, file_name, file_type, total_rows, imported_rows, duplicate_rows, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
        RETURNING id`,
        [
          userId,
          input.accountId || null,
          input.fileName,
          input.fileType,
          input.transactions.length,
          importedCount,
          duplicateCount,
        ],
      );

      await client.query('COMMIT');

      return {
        batchId: batchRes.rows[0].id,
        importedCount,
        duplicateCount,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getImportHistory(userId: string): Promise<ImportBatchRecord[]> {
    const res = await pool.query(
      `SELECT * FROM import_batches WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      fileName: row.file_name,
      fileType: row.file_type,
      totalRows: row.total_rows,
      importedRows: row.imported_rows,
      duplicateRows: row.duplicate_rows,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  private validateFileSignature(buffer: Buffer, fileType: 'csv' | 'pdf'): void {
    if (buffer.length === 0) {
      throw new BadRequestError('Statement file is empty');
    }
    if (fileType === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestError('The uploaded file is not a valid PDF document');
    }
    if (fileType === 'csv' && buffer.subarray(0, 1024).includes(0)) {
      throw new BadRequestError('The uploaded CSV contains binary data');
    }
  }

  private createImportHash(
    date: Date,
    amount: number,
    type: 'income' | 'expense',
    description: string,
  ): string {
    const day = date.toISOString().slice(0, 10);
    const normalizedDescription = description.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256')
      .update(`${day}|${Number(amount).toFixed(2)}|${type}|${normalizedDescription}`)
      .digest('hex');
  }
}

export const statementService = new StatementService();
