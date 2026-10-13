import { pool } from '../config/database.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string | null;
  baseCurrency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string | null;
  baseCurrency?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string | null;
  baseCurrency?: string;
  first_name?: string;
  last_name?: string | null;
  base_currency?: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string | null;
  base_currency: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    baseCurrency: row.base_currency,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserRepository {
  async createUser(input: CreateUserInput): Promise<User> {
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, base_currency)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'INR'))
      RETURNING *;
    `;
    const values = [
      input.email.toLowerCase().trim(),
      input.passwordHash,
      input.firstName.trim(),
      input.lastName ? input.lastName.trim() : null,
      input.baseCurrency || 'INR',
    ];

    const result = await pool.query<UserRow>(query, values);
    return mapRowToUser(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT * FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const result = await pool.query<UserRow>(query, [email.trim()]);
    return result.rows[0] ? mapRowToUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const query = `
      SELECT * FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await pool.query<UserRow>(query, [id]);
    return result.rows[0] ? mapRowToUser(result.rows[0]) : null;
  }

  async updateUser(id: string, updates: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const firstName = updates.firstName ?? updates.first_name;
    if (firstName !== undefined) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(firstName.trim());
    }

    const lastName = updates.lastName ?? updates.last_name;
    if (lastName !== undefined) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(lastName ? lastName.trim() : null);
    }

    const baseCurrency = updates.baseCurrency ?? updates.base_currency;
    if (baseCurrency !== undefined) {
      fields.push(`base_currency = $${paramIndex++}`);
      values.push(baseCurrency.trim().toUpperCase());
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    const result = await pool.query<UserRow>(query, values);
    return result.rows[0] ? mapRowToUser(result.rows[0]) : null;
  }
}

export const userRepository = new UserRepository();
