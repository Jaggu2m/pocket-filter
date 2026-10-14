import { pool } from '../config/database.js';
import { BadRequestError, NotFoundError } from '../errors/app-error.js';
import { categoryClassifierService } from './category-classifier.service.js';

export interface CategoryAssignment {
  category: string;
  confidence: number;
  source: 'user_rule' | 'merchant_rule' | 'keyword' | 'ml' | 'fallback';
  normalizedMerchant: string | null;
}

const MERCHANT_RULES: Array<{ pattern: RegExp; merchant: string; category: string }> = [
  { pattern: /\b(swiggy|instamart)\b/i, merchant: 'swiggy', category: 'Food & Dining' },
  { pattern: /\b(zomato|blinkit)\b/i, merchant: 'zomato', category: 'Food & Dining' },
  { pattern: /\b(zepto|bigbasket|bbdaily)\b/i, merchant: 'groceries', category: 'Groceries' },
  { pattern: /\b(uber|ola|rapido|irctc|metro)\b/i, merchant: 'transport', category: 'Transportation' },
  { pattern: /\b(amazon|flipkart|myntra|meesho)\b/i, merchant: 'shopping', category: 'Shopping' },
  { pattern: /\b(netflix|spotify|hotstar|prime video|bookmyshow)\b/i, merchant: 'entertainment', category: 'Entertainment' },
  { pattern: /\b(airtel|jio|vodafone|vi|electricity|bescom|water bill)\b/i, merchant: 'utilities', category: 'Utilities' },
  { pattern: /\b(doctor|hospital|pharmacy|apollo|medplus)\b/i, merchant: 'health', category: 'Health' },
  { pattern: /\b(salary|payroll|sal cred)\b/i, merchant: 'salary', category: 'Salary' },
];

const KEYWORD_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(restaurant|cafe|coffee|food|dining)\b/i, category: 'Food & Dining' },
  { pattern: /\b(fuel|petrol|diesel|parking|cab)\b/i, category: 'Transportation' },
  { pattern: /\b(rent|landlord)\b/i, category: 'Housing' },
  { pattern: /\b(emi|loan|mutual fund|brokerage)\b/i, category: 'Financial Services' },
  { pattern: /\b(school|college|course|udemy)\b/i, category: 'Education' },
];

export class CategoryService {
  normalizeMerchant(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value
      .toLowerCase()
      .replace(/^(upi[/-][a-z0-9_-]+[/-]|upi-|pos\s*\d*\s*|neft[-/]|imps[-/]|rtgs[-/]|ach[-/])/i, '')
      .replace(/\b(ref|txn|order|upi|id|no)\b[\s:#-]*[a-z0-9-]+/gi, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length >= 2 ? normalized.slice(0, 150) : null;
  }

  async categorize(userId: string, merchant?: string | null, description?: string | null): Promise<CategoryAssignment> {
    const subject = `${merchant || ''} ${description || ''}`.trim();
    const normalizedMerchant = this.normalizeMerchant(merchant || description);

    if (normalizedMerchant) {
      const learned = await pool.query<{ category: string; confidence: string }>(
        `SELECT category, confidence FROM user_merchant_rules
         WHERE user_id = $1 AND normalized_merchant = $2 LIMIT 1`,
        [userId, normalizedMerchant],
      );
      if (learned.rows[0]) {
        return { category: learned.rows[0].category, confidence: Number(learned.rows[0].confidence), source: 'user_rule', normalizedMerchant };
      }
    }

    for (const rule of MERCHANT_RULES) {
      if (rule.pattern.test(subject)) {
        return { category: rule.category, confidence: 0.95, source: 'merchant_rule', normalizedMerchant: rule.merchant };
      }
    }
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(subject)) {
        return { category: rule.category, confidence: 0.7, source: 'keyword', normalizedMerchant };
      }
    }
    const labeled = await pool.query<{ category: string; merchant: string | null; description: string | null }>(
      `SELECT category, merchant, description FROM transactions
       WHERE user_id = $1 AND category <> 'General' AND category_source IN ('manual', 'user_rule')
       ORDER BY updated_at DESC LIMIT 1000`,
      [userId],
    );
    const machineResult = categoryClassifierService.classify(
      subject,
      labeled.rows.map((row) => ({ category: row.category, text: `${row.merchant || ''} ${row.description || ''}` })),
    );
    if (machineResult) {
      return { category: machineResult.category, confidence: machineResult.confidence, source: 'ml', normalizedMerchant };
    }
    return { category: 'General', confidence: 0, source: 'fallback', normalizedMerchant };
  }

  async listCategories(): Promise<Array<{ name: string; kind: string; icon: string | null; color: string | null }>> {
    const result = await pool.query('SELECT id, name, kind, icon, color FROM categories ORDER BY kind, name');
    return result.rows;
  }

  async listRules(userId: string): Promise<Array<{ id: string; merchant: string; category: string; confidence: number }>> {
    const result = await pool.query(`SELECT id, normalized_merchant, category, confidence FROM user_merchant_rules WHERE user_id = $1 ORDER BY normalized_merchant`, [userId]);
    return result.rows.map((row) => ({ id: row.id, merchant: row.normalized_merchant, category: row.category, confidence: Number(row.confidence) }));
  }

  async saveRule(userId: string, merchant: string, category: string): Promise<CategoryAssignment> {
    const normalizedMerchant = this.normalizeMerchant(merchant);
    if (!normalizedMerchant) throw new BadRequestError('A valid merchant name is required');
    const categoryExists = await pool.query('SELECT 1 FROM categories WHERE name = $1', [category]);
    if (!categoryExists.rowCount) throw new NotFoundError('Category not found');
    await pool.query(
      `INSERT INTO user_merchant_rules (user_id, normalized_merchant, category, confidence)
       VALUES ($1, $2, $3, 1.0)
       ON CONFLICT (user_id, normalized_merchant)
       DO UPDATE SET category = EXCLUDED.category, confidence = 1.0, updated_at = CURRENT_TIMESTAMP`,
      [userId, normalizedMerchant, category],
    );
    return { category, confidence: 1, source: 'user_rule', normalizedMerchant };
  }

  async correctTransaction(userId: string, transactionId: string, category: string, learn = true): Promise<CategoryAssignment> {
    const transaction = await pool.query<{ merchant: string | null; description: string | null }>(
      'SELECT merchant, description FROM transactions WHERE id = $1 AND user_id = $2', [transactionId, userId],
    );
    if (!transaction.rows[0]) throw new NotFoundError('Transaction not found');
    const categoryExists = await pool.query('SELECT 1 FROM categories WHERE name = $1', [category]);
    if (!categoryExists.rowCount) throw new NotFoundError('Category not found');
    await pool.query(`UPDATE transactions SET category = $1, category_confidence = 1.0, category_source = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`, [category, transactionId, userId]);
    const merchant = transaction.rows[0].merchant || transaction.rows[0].description;
    if (learn && merchant) return this.saveRule(userId, merchant, category);
    return { category, confidence: 1, source: 'user_rule', normalizedMerchant: this.normalizeMerchant(merchant) };
  }

  async recategorize(userId: string): Promise<{ updatedCount: number }> {
    const result = await pool.query<{ id: string; merchant: string | null; description: string | null }>(
      `SELECT id, merchant, description FROM transactions WHERE user_id = $1 AND (category = 'General' OR category_source <> 'manual')`, [userId],
    );
    let updatedCount = 0;
    for (const transaction of result.rows) {
      const assignment = await this.categorize(userId, transaction.merchant, transaction.description);
      await pool.query(`UPDATE transactions SET category = $1, category_confidence = $2, category_source = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND user_id = $5`, [assignment.category, assignment.confidence, assignment.source, transaction.id, userId]);
      updatedCount++;
    }
    return { updatedCount };
  }
}

export const categoryService = new CategoryService();
