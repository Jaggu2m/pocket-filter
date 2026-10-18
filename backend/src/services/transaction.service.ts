import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import {
  transactionRepository,
  type CreateTransactionInput,
  type MoneySourceType,
  type PaginatedTransactions,
  type Transaction,
  type TransactionFilterOptions,
  type UpdateTransactionInput,
} from '../repositories/transaction.repository.js';
import { accountRepository } from '../repositories/account.repository.js';
import { BadRequestError, NotFoundError } from '../errors/app-error.js';
import { categoryService } from './category.service.js';

export class TransactionService {
  private async verifyAccountOwnership(accountId: string, userId: string): Promise<void> {
    const account = await accountRepository.findById(accountId, userId);
    if (!account) {
      throw new NotFoundError(`Account with ID '${accountId}' not found`);
    }
  }

  private async applyBalanceDelta(
    client: PoolClient,
    accountId: string,
    delta: number,
  ): Promise<void> {
    await client.query(
      'UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [delta, accountId],
    );
  }

  private async applyUnspecifiedBalanceDelta(
    client: PoolClient,
    userId: string,
    delta: number,
  ): Promise<void> {
    await client.query(
      'UPDATE users SET unspecified_balance = unspecified_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [delta, userId],
    );
  }

  private async applyTransactionBalanceEffect(
    client: PoolClient,
    userId: string,
    tx: {
      type: string;
      amount: number;
      accountId?: string | null;
      toAccountId?: string | null;
      sourceType?: MoneySourceType;
      destinationType?: MoneySourceType;
    },
    direction: 1 | -1,
  ): Promise<void> {
    const amount = Number(tx.amount);
    if (!amount || isNaN(amount)) return;

    const effectiveSourceType: MoneySourceType =
      tx.sourceType || (tx.accountId ? 'ACCOUNT' : 'UNSPECIFIED');
    const targetAccountId = tx.toAccountId || tx.accountId;
    const effectiveDestType: MoneySourceType =
      tx.destinationType ||
      (tx.type === 'transfer'
        ? tx.toAccountId
          ? 'ACCOUNT'
          : 'UNSPECIFIED'
        : targetAccountId
          ? 'ACCOUNT'
          : 'UNSPECIFIED');

    if (tx.type === 'expense') {
      // Outflow from source
      if (effectiveSourceType === 'ACCOUNT' && tx.accountId) {
        await this.applyBalanceDelta(client, tx.accountId, -amount * direction);
      } else {
        await this.applyUnspecifiedBalanceDelta(client, userId, -amount * direction);
      }
    } else if (tx.type === 'income') {
      // Inflow into destination
      if (effectiveDestType === 'ACCOUNT' && targetAccountId) {
        await this.applyBalanceDelta(client, targetAccountId, amount * direction);
      } else {
        await this.applyUnspecifiedBalanceDelta(client, userId, amount * direction);
      }
    } else if (tx.type === 'transfer') {
      // Outflow from source
      if (effectiveSourceType === 'ACCOUNT' && tx.accountId) {
        await this.applyBalanceDelta(client, tx.accountId, -amount * direction);
      } else {
        await this.applyUnspecifiedBalanceDelta(client, userId, -amount * direction);
      }
      // Inflow into destination
      if (effectiveDestType === 'ACCOUNT' && tx.toAccountId) {
        await this.applyBalanceDelta(client, tx.toAccountId, amount * direction);
      } else {
        await this.applyUnspecifiedBalanceDelta(client, userId, amount * direction);
      }
    }
  }

  async createTransaction(
    userId: string,
    data: Omit<CreateTransactionInput, 'userId'>,
  ): Promise<Transaction> {
    const categorizedData = { ...data };
    if (data.type === 'transfer' && !data.category) {
      categorizedData.category = 'Transfer';
      categorizedData.categoryConfidence = 1;
      categorizedData.categorySource = 'manual';
    } else if (!data.category) {
      const assignment = await categoryService.categorize(userId, data.merchant, data.description);
      categorizedData.category = assignment.category;
      categorizedData.categoryConfidence = assignment.confidence;
      categorizedData.categorySource = assignment.source;
    }

    // 1. Verify account ownership if accounts are specified (accounts are optional)
    if (data.sourceType === 'ACCOUNT' && !data.accountId) {
      throw new BadRequestError('Source account ID is required when source type is ACCOUNT');
    }
    if (data.destinationType === 'ACCOUNT' && !data.toAccountId && data.type === 'transfer') {
      throw new BadRequestError('Destination account ID is required when destination type is ACCOUNT');
    }

    if (data.accountId) {
      await this.verifyAccountOwnership(data.accountId, userId);
    }
    if (data.toAccountId) {
      await this.verifyAccountOwnership(data.toAccountId, userId);
    }

    if (data.type === 'transfer') {
      const srcIsUnspecified = data.sourceType === 'UNSPECIFIED' || !data.accountId;
      const dstIsUnspecified = data.destinationType === 'UNSPECIFIED' || !data.toAccountId;
      if (srcIsUnspecified && dstIsUnspecified) {
        throw new BadRequestError('Cannot transfer from unspecified balance to unspecified balance');
      }
      if (data.accountId && data.toAccountId && data.accountId === data.toAccountId) {
        throw new BadRequestError('Source and destination accounts cannot be identical');
      }
    }

    // 2. Perform atomic transaction creation + balance sync
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = await transactionRepository.createTransaction(
        { ...categorizedData, userId },
        client,
      );

      // Symmetrically apply balance effect
      await this.applyTransactionBalanceEffect(client, userId, created, 1);

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listTransactions(
    userId: string,
    options: TransactionFilterOptions,
  ): Promise<PaginatedTransactions> {
    return transactionRepository.findTransactions(userId, options);
  }

  async getTransactionById(id: string, userId: string): Promise<Transaction> {
    const transaction = await transactionRepository.findById(id, userId);
    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }
    return transaction;
  }

  async updateTransaction(
    id: string,
    userId: string,
    updates: UpdateTransactionInput,
  ): Promise<Transaction> {
    const existing = await transactionRepository.findById(id, userId);
    if (!existing) {
      throw new NotFoundError('Transaction not found');
    }

    const nextAccountId = updates.accountId !== undefined ? updates.accountId : existing.accountId;
    const nextToAccountId =
      updates.toAccountId !== undefined ? updates.toAccountId : existing.toAccountId;
    const nextType = updates.type !== undefined ? updates.type : existing.type;
    const nextSourceType = updates.sourceType !== undefined ? updates.sourceType : existing.sourceType;
    const nextDestType = updates.destinationType !== undefined ? updates.destinationType : existing.destinationType;

    const categorizedUpdates = { ...updates };
    if (
      updates.category === undefined &&
      (updates.merchant !== undefined || updates.description !== undefined) &&
      nextType !== 'transfer'
    ) {
      const assignment = await categoryService.categorize(
        userId,
        updates.merchant !== undefined ? updates.merchant : existing.merchant,
        updates.description !== undefined ? updates.description : existing.description,
      );
      categorizedUpdates.category = assignment.category;
      categorizedUpdates.categoryConfidence = assignment.confidence;
      categorizedUpdates.categorySource = assignment.source;
    }

    if (nextAccountId) {
      await this.verifyAccountOwnership(nextAccountId, userId);
    }
    if (nextToAccountId) {
      await this.verifyAccountOwnership(nextToAccountId, userId);
    }

    if (nextType === 'transfer') {
      const srcIsUnspecified = nextSourceType === 'UNSPECIFIED' || !nextAccountId;
      const dstIsUnspecified = nextDestType === 'UNSPECIFIED' || !nextToAccountId;
      if (srcIsUnspecified && dstIsUnspecified) {
        throw new BadRequestError('Cannot transfer from unspecified balance to unspecified balance');
      }
      if (nextAccountId && nextToAccountId && nextAccountId === nextToAccountId) {
        throw new BadRequestError('Source and destination accounts cannot be identical');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Revert previous transaction impact on balances
      await this.applyTransactionBalanceEffect(client, userId, existing, -1);

      // 2. Update transaction record
      const updated = await transactionRepository.updateTransaction(
        id,
        userId,
        categorizedUpdates,
        client,
      );

      if (!updated) {
        throw new NotFoundError('Transaction not found');
      }

      // 3. Apply new transaction impact on balances
      await this.applyTransactionBalanceEffect(client, userId, updated, 1);

      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTransaction(id: string, userId: string): Promise<void> {
    const existing = await transactionRepository.findById(id, userId);
    if (!existing) {
      throw new NotFoundError('Transaction not found');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Revert previous transaction impact on balances
      await this.applyTransactionBalanceEffect(client, userId, existing, -1);

      await transactionRepository.deleteTransaction(id, userId, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const transactionService = new TransactionService();
