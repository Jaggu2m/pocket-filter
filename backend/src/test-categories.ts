import assert from 'node:assert/strict';
import { categoryClassifierService } from './services/category-classifier.service.js';

const result = categoryClassifierService.classify('corner cafe coffee breakfast', [
  { category: 'Food & Dining', text: 'swiggy food order dinner' },
  { category: 'Food & Dining', text: 'coffee cafe breakfast' },
  { category: 'Food & Dining', text: 'restaurant lunch meal' },
  { category: 'Shopping', text: 'amazon purchase electronics' },
  { category: 'Shopping', text: 'flipkart online shopping' },
  { category: 'Shopping', text: 'myntra clothes purchase' },
]);

assert.equal(result?.category, 'Food & Dining');
assert.ok((result?.confidence || 0) >= 0.35);
console.log('Category TF-IDF classifier checks passed');
