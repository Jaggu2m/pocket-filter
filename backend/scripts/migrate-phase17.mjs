import { runMigrations } from '../src/db/migrate.js';
import { pool } from '../src/config/database.js';

async function main() {
  await runMigrations();
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('notifications', 'financial_insights')");
  console.log('Migrated tables:', res.rows.map(r => r.table_name));
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
