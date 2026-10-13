import { PDFParse } from 'pdf-parse';
import {
  cleanNarration,
  parseStatementAmount,
  parseStatementDate,
  type ParsedRawTransaction,
} from '../../utils/statement-normalizer.js';
import { BadRequestError } from '../../errors/app-error.js';
import { env } from '../../config/env.js';

export class PdfStatementParser {
  async parse(buffer: Buffer): Promise<ParsedRawTransaction[]> {
    const parser = new PDFParse({ data: buffer });
    let text: string;
    try {
      const data = await parser.getText();
      text = data.text || '';
    } catch (err) {
      throw new BadRequestError(`Failed to process PDF: ${(err as Error).message}`);
    } finally {
      await parser.destroy();
    }

    if ((!text || text.trim().length < 30) && env.OCR_ENDPOINT) {
      text = await this.extractWithOcr(buffer);
    }

    if (!text || text.trim().length < 30) {
      throw new BadRequestError(
        env.OCR_ENDPOINT
          ? 'OCR could not extract readable statement text from this PDF. Please upload a clearer statement or CSV.'
          : 'The uploaded PDF appears to be a scanned image or empty. Configure OCR_ENDPOINT or upload a native digital e-statement or CSV.',
      );
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const parsed: ParsedRawTransaction[] = [];

    // Regex to match a date at the start of a transaction row (DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD)
    const dateRegex = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
    // Regex to match monetary amounts with optional decimals and commas
    const amountRegex = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s*(Cr|Dr)?/gi;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateMatch = line.match(dateRegex);

      if (dateMatch) {
        const rawDate = dateMatch[0];
        const restOfLine = line.substring(rawDate.length).trim();

        // Extract all numerical amount candidates from the line
        const amounts: { raw: string; value: number; indicator?: string }[] = [];
        let match: RegExpExecArray | null;

        while ((match = amountRegex.exec(restOfLine)) !== null) {
          const val = parseStatementAmount(match[1]);
          if (val > 0) {
            amounts.push({
              raw: match[0],
              value: val,
              indicator: match[2]?.toUpperCase(),
            });
          }
        }

        if (amounts.length > 0) {
          // Take the primary transaction amount (usually the first or largest amount)
          const chosen = amounts[0];
          const rawDesc = restOfLine.replace(chosen.raw, '').trim();

          let type: 'income' | 'expense' = 'expense';
          if (chosen.indicator === 'CR' || /credit|salary|deposit/i.test(line)) {
            type = 'income';
          }

          const date = parseStatementDate(rawDate);
          const { merchant, category } = cleanNarration(rawDesc || 'Bank Transaction');

          parsed.push({
            date,
            rawDescription: rawDesc || line,
            merchant,
            amount: chosen.value,
            type,
            category,
          });
        }
      }
    }

    if (parsed.length === 0) {
      throw new BadRequestError(
        'Could not find structured tabular transactions in this PDF. Please ensure this is an official bank account statement or use CSV export.',
      );
    }

    return parsed;
  }

  private async extractWithOcr(buffer: Buffer): Promise<string> {
    try {
      const response = await fetch(env.OCR_ENDPOINT!, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`OCR service returned ${response.status}`);
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string') {
        throw new Error('OCR service returned an invalid response');
      }
      return body.text;
    } catch (error) {
      throw new BadRequestError(`Unable to process scanned PDF with OCR: ${(error as Error).message}`);
    }
  }
}

export const pdfStatementParser = new PdfStatementParser();
