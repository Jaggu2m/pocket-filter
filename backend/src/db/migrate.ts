import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  try {
    const sql = await fs.readFile(schemaPath, 'utf-8');
    await pool.query(sql);
    console.log('Database migrations applied successfully');
  } catch (error) {
    console.error('Failed to run database migrations:', error);
    throw error;
  }
}
