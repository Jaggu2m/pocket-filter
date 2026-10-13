import assert from 'node:assert/strict';
import { csvStatementParser } from './services/statement-parsers/csv.parser.js';
import { confirmStatementImportSchema } from './schemas/statement.schema.js';

const sample = Buffer.from(`Account statement\nDate,Description,Debit,Credit,Balance\n01/10/2026,UPI-SWIGGY-ORDER-123,250.00,,1000\n02/10/2026,SALARY CREDIT,,50000.00,51000\n`);
const transactions = csvStatementParser.parse(sample);

assert.equal(transactions.length, 2);
assert.equal(transactions[0].type, 'expense');
assert.equal(transactions[0].merchant, 'Swiggy');
assert.equal(transactions[1].type, 'income');
assert.equal(transactions[1].category, 'Salary');

const parsed = confirmStatementImportSchema.parse({
  fileName: 'statement.csv',
  fileType: 'csv',
  transactions: [{ date: '2026-10-01', description: 'Coffee', amount: 100, type: 'expense' }],
});
assert.ok(parsed.transactions[0].date instanceof Date);

console.log('Statement parser and import validation checks passed');
