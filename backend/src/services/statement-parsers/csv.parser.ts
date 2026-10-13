import { parse } from 'csv-parse/sync';
import {
  cleanNarration,
  parseStatementAmount,
  parseStatementDate,
  type ParsedRawTransaction,
} from '../../utils/statement-normalizer.js';
import { BadRequestError } from '../../errors/app-error.js';

interface ColumnMapping {
  dateCol: number;
  descCol: number;
  debitCol?: number;
  creditCol?: number;
  amountCol?: number;
  typeCol?: number;
}

export class CsvStatementParser {
  parse(buffer: Buffer): ParsedRawTransaction[] {
    const content = buffer.toString('utf-8');

    let records: string[][];
    try {
      records = parse(content, {
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err) {
      throw new BadRequestError(`Failed to parse CSV file: ${(err as Error).message}`);
    }

    if (!records || records.length < 2) {
      throw new BadRequestError('CSV file contains insufficient rows');
    }

    // Find the header row (scan first 10 rows for date and amount headers)
    let headerRowIndex = -1;
    let mapping: ColumnMapping | null = null;

    for (let i = 0; i < Math.min(records.length, 15); i++) {
      const detected = this.detectColumns(records[i]);
      if (detected) {
        headerRowIndex = i;
        mapping = detected;
        break;
      }
    }

    if (!mapping || headerRowIndex === -1) {
      throw new BadRequestError(
        'Could not identify statement headers. Ensure your CSV contains Date, Description/Narration, and Amount/Debit/Credit columns.',
      );
    }

    const parsed: ParsedRawTransaction[] = [];

    for (let r = headerRowIndex + 1; r < records.length; r++) {
      const row = records[r];
      if (row.length <= mapping.dateCol || row.length <= mapping.descCol) continue;

      const rawDate = row[mapping.dateCol];
      const rawDesc = row[mapping.descCol];

      if (!rawDate || !rawDesc) continue;

      let amount = 0;
      let type: 'income' | 'expense' = 'expense';

      if (mapping.debitCol !== undefined && mapping.creditCol !== undefined) {
        const debitVal = parseStatementAmount(row[mapping.debitCol]);
        const creditVal = parseStatementAmount(row[mapping.creditCol]);

        if (debitVal > 0) {
          amount = debitVal;
          type = 'expense';
        } else if (creditVal > 0) {
          amount = creditVal;
          type = 'income';
        }
      } else if (mapping.amountCol !== undefined) {
        const rawAmountStr = row[mapping.amountCol];
        const rawNum = parseFloat(rawAmountStr.replace(/[₹$,\s]/g, ''));
        amount = parseStatementAmount(rawAmountStr);

        if (mapping.typeCol !== undefined && row[mapping.typeCol]) {
          const typeStr = row[mapping.typeCol].toLowerCase();
          type = typeStr.includes('cr') || typeStr.includes('credit') || typeStr.includes('deposit') ? 'income' : 'expense';
        } else if (!isNaN(rawNum) && rawNum < 0) {
          type = 'expense';
        } else if (/cr/i.test(rawAmountStr)) {
          type = 'income';
        } else {
          type = 'expense';
        }
      }

      if (amount <= 0) continue;

      const date = parseStatementDate(rawDate);
      const { merchant, category } = cleanNarration(rawDesc);

      parsed.push({
        date,
        rawDescription: rawDesc.trim(),
        merchant,
        amount,
        type,
        category,
      });
    }

    return parsed;
  }

  private detectColumns(headers: string[]): ColumnMapping | null {
    const lower = headers.map((h) => (h || '').toLowerCase().trim());

    let dateCol = -1;
    let descCol = -1;
    let debitCol = -1;
    let creditCol = -1;
    let amountCol = -1;
    let typeCol = -1;

    for (let i = 0; i < lower.length; i++) {
      const h = lower[i];

      if (dateCol === -1 && /^(txn\s*date|transaction\s*date|date|value\s*date|posting\s*date)$/i.test(h)) {
        dateCol = i;
      } else if (descCol === -1 && /^(narration|description|particulars|remarks|details|transaction\s*details)$/i.test(h)) {
        descCol = i;
      } else if (debitCol === -1 && /^(debit|withdrawal|dr|dr\s*amount|withdrawal\s*amt)$/i.test(h)) {
        debitCol = i;
      } else if (creditCol === -1 && /^(credit|deposit|cr|cr\s*amount|deposit\s*amt)$/i.test(h)) {
        creditCol = i;
      } else if (amountCol === -1 && /^(amount|txn\s*amount|transaction\s*amount)$/i.test(h)) {
        amountCol = i;
      } else if (typeCol === -1 && /^(type|cr\/dr|transaction\s*type|dr\/cr)$/i.test(h)) {
        typeCol = i;
      }
    }

    if (dateCol !== -1 && descCol !== -1) {
      if (debitCol !== -1 || creditCol !== -1) {
        return {
          dateCol,
          descCol,
          debitCol: debitCol !== -1 ? debitCol : undefined,
          creditCol: creditCol !== -1 ? creditCol : undefined,
        };
      }
      if (amountCol !== -1) {
        return {
          dateCol,
          descCol,
          amountCol,
          typeCol: typeCol !== -1 ? typeCol : undefined,
        };
      }
    }

    return null;
  }
}

export const csvStatementParser = new CsvStatementParser();
