import {
  accountRepository,
  type Account,
  type AccountSummary,
  type AccountType,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '../repositories/account.repository.js';
import { NotFoundError } from '../errors/app-error.js';
import { pool } from '../config/database.js';

export class AccountService {
  async createAccount(userId: string, data: Omit<CreateAccountInput, 'userId'>): Promise<Account> {
    if (data.isDefault) {
      // Unset previous default account for this user
      await pool.query(
        'UPDATE accounts SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE',
        [userId],
      );
    }

    return accountRepository.createAccount({
      ...data,
      userId,
    });
  }

  async listAccounts(
    userId: string,
    options?: { type?: AccountType; includeArchived?: boolean },
  ): Promise<Account[]> {
    return accountRepository.findByUserId(userId, options);
  }

  async getAccountById(id: string, userId: string): Promise<Account> {
    const account = await accountRepository.findById(id, userId);
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    return account;
  }

  async updateAccount(id: string, userId: string, updates: UpdateAccountInput): Promise<Account> {
    const existing = await accountRepository.findById(id, userId);
    if (!existing) {
      throw new NotFoundError('Account not found');
    }

    if (updates.isDefault) {
      await pool.query(
        'UPDATE accounts SET is_default = FALSE WHERE user_id = $1 AND id != $2 AND is_default = TRUE',
        [userId, id],
      );
    }

    const updated = await accountRepository.updateAccount(id, userId, updates);
    if (!updated) {
      throw new NotFoundError('Account not found');
    }

    return updated;
  }

  async archiveAccount(id: string, userId: string): Promise<Account> {
    const existing = await accountRepository.findById(id, userId);
    if (!existing) {
      throw new NotFoundError('Account not found');
    }

    const archived = await accountRepository.updateAccount(id, userId, {
      isArchived: true,
      isDefault: false,
    });

    if (!archived) {
      throw new NotFoundError('Account not found');
    }

    return archived;
  }

  async deleteAccount(id: string, userId: string): Promise<void> {
    const existing = await accountRepository.findById(id, userId);
    if (!existing) {
      throw new NotFoundError('Account not found');
    }

    await accountRepository.deleteAccount(id, userId);
  }

  async getAccountSummary(userId: string): Promise<AccountSummary> {
    return accountRepository.getAccountSummary(userId);
  }

  async getUnspecifiedBalance(userId: string): Promise<number> {
    return accountRepository.getUnspecifiedBalance(userId);
  }

  async setUnspecifiedBalance(userId: string, balance: number): Promise<number> {
    return accountRepository.setUnspecifiedBalance(userId, balance);
  }
}

export const accountService = new AccountService();
