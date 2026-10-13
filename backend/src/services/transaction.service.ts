import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import {
  transactionRepository,
  type CreateTransactionInput,
  type PaginatedTransactions,
  type Transaction,
  type TransactionFilterOptions,
  type UpdateTransactionInput,
} from '../repositories/transaction.repository.js';
import { accountRepository } from '../repositories/account.repository.js';
import { BadRequestError, NotFoundError } from '../errors/app-error.js';

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

  async createTransaction(
    userId: string,
    data: Omit<CreateTransactionInput, 'userId'>,
  ): Promise<Transaction> {
    // 1. Verify account ownership if accounts are specified (accounts are optional)
    if (data.accountId) {
      await this.verifyAccountOwnership(data.accountId, userId);
    }
    if (data.toAccountId) {
      await this.verifyAccountOwnership(data.toAccountId, userId);
    }

    if (data.type === 'transfer' && (!data.accountId || !data.toAccountId)) {
      throw new BadRequestError(
        'Transfer transactions require both source and destination accounts',
      );
    }

    // 2. Perform atomic transaction creation + balance sync
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = await transactionRepository.createTransaction({ ...data, userId }, client);

      // Sync account balance if account is linked
      if (data.type === 'expense' && data.accountId) {
        await this.applyBalanceDelta(client, data.accountId, -data.amount);
      } else if (data.type === 'income' && data.accountId) {
        await this.applyBalanceDelta(client, data.accountId, data.amount);
      } else if (data.type === 'transfer' && data.accountId && data.toAccountId) {
        await this.applyBalanceDelta(client, data.accountId, -data.amount);
        await this.applyBalanceDelta(client, data.toAccountId, data.amount);
      }

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
    const nextAmount = updates.amount !== undefined ? updates.amount : existing.amount;

    if (nextAccountId) {
      await this.verifyAccountOwnership(nextAccountId, userId);
    }
    if (nextToAccountId) {
      await this.verifyAccountOwnership(nextToAccountId, userId);
    }

    if (nextType === 'transfer' && (!nextAccountId || !nextToAccountId)) {
      throw new BadRequestError(
        'Transfer transactions require both source and destination accounts',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Revert previous transaction impact on balances
      if (existing.type === 'expense' && existing.accountId) {
        await this.applyBalanceDelta(client, existing.accountId, existing.amount);
      } else if (existing.type === 'income' && existing.accountId) {
        await this.applyBalanceDelta(client, existing.accountId, -existing.amount);
      } else if (existing.type === 'transfer' && existing.accountId && existing.toAccountId) {
        await this.applyBalanceDelta(client, existing.accountId, existing.amount);
        await this.applyBalanceDelta(client, existing.toAccountId, -existing.amount);
      }

      // 2. Apply new transaction impact on balances
      if (nextType === 'expense' && nextAccountId) {
        await this.applyBalanceDelta(client, nextAccountId, -nextAmount);
      } else if (nextType === 'income' && nextAccountId) {
        await this.applyBalanceDelta(client, nextAccountId, nextAmount);
      } else if (nextType === 'transfer' && nextAccountId && nextToAccountId) {
        await this.applyBalanceDelta(client, nextAccountId, -nextAmount);
        await this.applyBalanceDelta(client, nextToAccountId, nextAmount);
      }

      // 3. Update transaction record
      const updated = await transactionRepository.updateTransaction(id, userId, updates, client);

      if (!updated) {
        throw new NotFoundError('Transaction not found');
      }

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

      // Revert previous transaction impact on account balances
      if (existing.type === 'expense' && existing.accountId) {
        await this.applyBalanceDelta(client, existing.accountId, existing.amount);
      } else if (existing.type === 'income' && existing.accountId) {
        await this.applyBalanceDelta(client, existing.accountId, -existing.amount);
      } else if (existing.type === 'transfer' && existing.accountId && existing.toAccountId) {
        await this.applyBalanceDelta(client, existing.accountId, existing.amount);
        await this.applyBalanceDelta(client, existing.toAccountId, -existing.amount);
      }

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
