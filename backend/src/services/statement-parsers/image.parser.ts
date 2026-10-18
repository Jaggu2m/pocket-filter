import Tesseract from 'tesseract.js';
import {
  cleanNarration,
  parseStatementAmount,
  parseStatementDate,
  type ParsedRawTransaction,
} from '../../utils/statement-normalizer.js';
import { BadRequestError } from '../../errors/app-error.js';

export class ImageStatementParser {
  async parse(buffer: Buffer): Promise<ParsedRawTransaction[]> {
    let text = '';
    try {
      const { data } = await Tesseract.recognize(buffer, 'eng');
      text = data.text || '';
    } catch (err) {
      throw new BadRequestError(`Failed to process image OCR: ${(err as Error).message}`);
    }

    if (!text || text.trim().length < 5) {
      throw new BadRequestError('Could not detect readable text in the uploaded screenshot or receipt.');
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const fullText = lines.join(' ');

    // 1. Determine Income vs Expense
    let type: 'income' | 'expense' = 'expense';
    const isIncome =
      /received from|credited to|deposit|cashback|refund|money added|salary|received|credited/i.test(fullText);
    const isExpense =
      /paid to|sent to|debited from|payment to|transferred to|spent|order total|total amount|bill amount|paid/i.test(fullText);

    if (isIncome && !isExpense) {
      type = 'income';
    } else {
      type = 'expense';
    }

    // 2. Extract Amount candidates
    // Look for numbers following ₹, Rs, INR, or prominent amounts
    const amountRegex = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;
    const amountCandidates: { raw: string; value: number; priority: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;
      while ((match = amountRegex.exec(line)) !== null) {
        const val = parseStatementAmount(match[1]);
        if (val > 0) {
          let priority = 1;
          // Higher priority if preceded by ₹ or Rs or in a Total / Paid line
          if (/₹|rs|inr/i.test(line)) priority += 5;
          if (/paid|total|amount|debited|sent/i.test(line)) priority += 3;
          // Avoid 10-12 digit numbers that look like transaction IDs, account numbers, or dates
          if (match[1].length > 8 && !match[1].includes('.')) continue;

          amountCandidates.push({ raw: match[0], value: val, priority });
        }
      }
    }

    // Sort by priority then by value
    amountCandidates.sort((a, b) => b.priority - a.priority || b.value - a.value);

    if (amountCandidates.length === 0) {
      throw new BadRequestError(
        'Could not find a valid transaction amount in this image. Please ensure the screenshot or receipt clearly shows the amount.',
      );
    }

    const chosenAmount = amountCandidates[0].value;

    // 3. Extract Merchant / Payee
    let merchant = 'Payment';
    let rawDescription = 'Payment Screenshot';

    // Check GPay / PhonePe / Paytm / SMS patterns
    const paidToMatch = fullText.match(
      /(?:paid to|sent to|payment to|paid successfully to|to:)\s+([A-Za-z0-9\s&.'-]+?)(?:\s+(?:₹|rs|completed|successful|using|debited|on|\d|\.))/i,
    );
    const receivedFromMatch = fullText.match(
      /(?:received from|from:)\s+([A-Za-z0-9\s&.'-]+?)(?:\s+(?:₹|rs|completed|successful|using|credited|on|\d|\.))/i,
    );

    if (paidToMatch && paidToMatch[1]?.trim().length > 2) {
      merchant = paidToMatch[1].trim();
      rawDescription = `Paid to ${merchant}`;
    } else if (receivedFromMatch && receivedFromMatch[1]?.trim().length > 2) {
      merchant = receivedFromMatch[1].trim();
      rawDescription = `Received from ${merchant}`;
    } else {
      // Find prominent merchant name from known merchants or header lines
      for (const line of lines.slice(0, 5)) {
        if (!/completed|success|paid|transfer|transaction|upi|id|rupees|total/i.test(line) && line.length > 2 && line.length < 40) {
          merchant = line;
          rawDescription = line;
          break;
        }
      }
    }

    const { merchant: cleanedMerchant, category } = cleanNarration(merchant);

    // 4. Extract Date
    const dateMatch = fullText.match(
      /\b(\d{1,2}[/-](?:\d{1,2}|[a-zA-Z]{3})[/-]\d{2,4}|\d{1,2}\s+[a-zA-Z]{3}(?:\s+\d{2,4})?|[a-zA-Z]{3}\s+\d{1,2},?\s+\d{4})\b/i,
    );
    const date = dateMatch ? parseStatementDate(dateMatch[0]) : new Date();

    return [
      {
        date,
        rawDescription,
        merchant: cleanedMerchant || merchant,
        amount: chosenAmount,
        type,
        category,
      },
    ];
  }
}

export const imageStatementParser = new ImageStatementParser();
