export interface ParsedRawTransaction {
  date: Date;
  rawDescription: string;
  merchant: string | null;
  amount: number;
  type: 'income' | 'expense';
  balance?: number | null;
  category: string;
}

const COMMON_MERCHANTS: { name: string; pattern: RegExp; category: string }[] = [
  { name: 'Swiggy', pattern: /\b(swiggy|instamart)\b/i, category: 'Food & Dining' },
  { name: 'Zomato', pattern: /\b(zomato|blinkit)\b/i, category: 'Food & Dining' },
  { name: 'Amazon', pattern: /\b(amazon|amzn)\b/i, category: 'Shopping' },
  { name: 'Flipkart', pattern: /\b(flipkart)\b/i, category: 'Shopping' },
  { name: 'Uber', pattern: /\b(uber)\b/i, category: 'Transportation' },
  { name: 'Ola', pattern: /\b(ola\s*cabs|olacabs)\b/i, category: 'Transportation' },
  { name: 'Netflix', pattern: /\b(netflix)\b/i, category: 'Entertainment' },
  { name: 'Spotify', pattern: /\b(spotify)\b/i, category: 'Entertainment' },
  { name: 'Starbucks', pattern: /\b(starbucks|tata\s*starbucks)\b/i, category: 'Food & Dining' },
  { name: 'McDonalds', pattern: /\b(mcdonalds|mcd)\b/i, category: 'Food & Dining' },
  { name: 'Zepto', pattern: /\b(zepto)\b/i, category: 'Groceries' },
  { name: 'BigBasket', pattern: /\b(bigbasket|bbdaily)\b/i, category: 'Groceries' },
  { name: 'Airtel', pattern: /\b(airtel)\b/i, category: 'Utilities' },
  { name: 'Jio', pattern: /\b(jio|reliance\s*jio)\b/i, category: 'Utilities' },
  { name: 'Salary', pattern: /\b(salary|payroll|sal\s*cred)\b/i, category: 'Salary' },
];

export function cleanNarration(raw: string): { merchant: string | null; category: string } {
  if (!raw) return { merchant: null, category: 'General' };

  for (const item of COMMON_MERCHANTS) {
    if (item.pattern.test(raw)) {
      return { merchant: item.name, category: item.category };
    }
  }

  // Generic merchant cleanup (stripping common payment rail prefixes)
  let cleaned = raw
    .replace(/^(UPI\/[A-Z0-9_-]+\/|UPI-|POS\s*\d*\s*|NEFT[-/]|IMPS[-/]|RTGS[-/]|ACH[-/])/i, '')
    .replace(/(\s*-\s*[A-Z0-9]+|\s*ref\s*no\s*[:\d]+)/gi, '')
    .trim();

  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50);
  }

  return {
    merchant: cleaned || null,
    category: 'General',
  };
}

export function parseStatementAmount(raw: string | number): number {
  if (typeof raw === 'number') {
    return Math.abs(raw);
  }

  if (!raw) return 0;

  // Clean currency symbols, commas, and trailing Dr/Cr
  const cleaned = raw
    .toString()
    .replace(/[₹$,\s]/g, '')
    .replace(/(cr|dr)$/i, '')
    .trim();

  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.abs(val);
}

export function parseStatementDate(raw: string): Date {
  if (!raw) return new Date();

  const trimmed = raw.trim();

  // Try Standard ISO first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Check DD-MMM-YYYY or DD/MMM/YYYY (e.g. 02-Oct-2026, 15/Nov/2026)
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const dMmmMatch = trimmed.match(/^(\d{1,2})[/-]([a-zA-Z]{3})[/-](\d{2,4})/);
  if (dMmmMatch) {
    const day = parseInt(dMmmMatch[1], 10);
    const mStr = dMmmMatch[2].toLowerCase();
    const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
    let year = parseInt(dMmmMatch[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;

    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback to standard Date parsing
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}
