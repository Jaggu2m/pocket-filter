import { CopilotIntent, type ExtractedIntent, extractedIntentSchema } from './schemas/copilot.schema.js';
import { dateResolver } from './date-resolver.js';

export class IntentService {
  private getApiKey(): string | null {
    return process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  }

  private get model(): string {
    return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
  }

  /**
   * Deterministic pattern-based extractor (zero network dependency fallback)
   */
  private extractDeterministicIntent(message: string): ExtractedIntent {
    const text = message.toLowerCase();

    // 1. Purchase Simulation / Affordability ("Can I buy a ₹40,000 phone next month?", "What happens if I take a 20k EMI")
    const simMatch = text.match(/(?:can\s+i\s+(?:buy|afford|purchase)|what\s+if\s+i\s+(?:buy|spend|take)|simulate|what\s+happens\s+if)/i);
    const emiMatch = text.match(/(?:emi|loan)\s+(?:of\s+)?(?:₹|rs\.?|inr)?\s*([0-9,]+)/i);
    const amountMatch = text.match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:k|lakh|crore)?/i);

    let extractedAmount: number | null = null;
    if (amountMatch && amountMatch[1]) {
      let rawNum = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (text.includes('k') && rawNum < 1000) rawNum *= 1000;
      else if (text.includes('lakh')) rawNum *= 100000;
      else if (text.includes('crore')) rawNum *= 10000000;
      if (!Number.isNaN(rawNum) && rawNum > 0) extractedAmount = rawNum;
    }

    if (simMatch || emiMatch) {
      const isEmi = /emi|loan/i.test(text);
      const isNextMonth = /next\s+month/i.test(text);
      let item = 'Item';
      const itemMatch = text.match(/(?:buy|purchase|for)\s+(?:a|an)?\s*(?:₹[0-9,]+\s+)?([a-z0-9\s]+?)(?:\s+(?:next\s+month|this\s+month|in\s+[a-z]+|\?|$))/i);
      if (itemMatch && itemMatch[1]) {
        item = itemMatch[1].trim();
      }

      return {
        intent: CopilotIntent.PURCHASE_SIMULATION,
        confidence: 0.95,
        parameters: {
          amount: extractedAmount || (isEmi ? 20000 : 40000),
          item,
          timeframe: isNextMonth ? 'next_month' : 'current_month',
          actionType: isEmi ? 'NEW_EMI' : 'ONE_TIME_EXPENSE',
        },
      };
    }

    // 2. Spending Diagnostic ("Why did my expenses increase this month?", "Why did I spend more?")
    if (/(why\s+did\s+(?:my\s+)?(?:expenses?|spending)\s+(?:increase|go\s+up|rise|surge)|why\s+did\s+i\s+spend\s+(?:so\s+much|more))/i.test(text)) {
      return {
        intent: CopilotIntent.SPENDING_DIAGNOSTIC,
        confidence: 0.95,
        parameters: {
          period: 'current_month',
          comparisonPeriod: 'previous_month',
        },
      };
    }

    // 3. Goal Progress ("Am I on track with my ₹1 lakh emergency fund?", "Goal progress", "How much should I save")
    if (/(goal|emergency\s+fund|savings\s+target|on\s+track|reach\s+my)/i.test(text)) {
      let goalType = 'SAVINGS';
      if (/emergency/i.test(text)) goalType = 'EMERGENCY_FUND';

      return {
        intent: CopilotIntent.GOAL_PROGRESS,
        confidence: 0.92,
        parameters: {
          goalType,
          targetAmount: extractedAmount || 100000,
          period: 'current_month',
        },
      };
    }

    // 4. Budget Query ("How much of my food budget is left?", "Am I overspending this month?")
    if (/(budget|overspend|remaining\s+budget|how\s+much\s+(?:of\s+my\s+)?budget)/i.test(text)) {
      let category: string | null = null;
      if (/food|dining/i.test(text)) category = 'Food & Dining';
      else if (/grocer/i.test(text)) category = 'Groceries';
      else if (/travel|transport/i.test(text)) category = 'Transportation';
      else if (/shop/i.test(text)) category = 'Shopping';
      else if (/entertain/i.test(text)) category = 'Entertainment';

      return {
        intent: CopilotIntent.BUDGET_QUERY,
        confidence: 0.92,
        parameters: {
          category,
          period: 'current_month',
        },
      };
    }

    // 5. Debt / EMI Query ("What are my active EMIs?", "How much debt do I owe?")
    if (/(emi|debt|loan|repay|liability|liabilities)/i.test(text)) {
      return {
        intent: CopilotIntent.DEBT_QUERY,
        confidence: 0.9,
        parameters: {
          period: 'current_month',
        },
      };
    }

    // 6. Account Balance ("How much money do I have?", "Account balance", "Liquid balance")
    if (/(balance|how\s+much\s+(?:money\s+do\s+i\s+have|in\s+my\s+bank|cash)|liquid\s+balance)/i.test(text)) {
      return {
        intent: CopilotIntent.ACCOUNT_BALANCE,
        confidence: 0.95,
        parameters: {},
      };
    }

    // 7. Income Query ("How much did I earn?", "Salary", "Total income")
    if (/(income|salary|earned|how\s+much\s+did\s+i\s+earn)/i.test(text)) {
      return {
        intent: CopilotIntent.INCOME_QUERY,
        confidence: 0.92,
        parameters: {
          period: 'current_month',
        },
      };
    }

    // 8. Transaction Query ("How much did I spend on food this month?", "Show my swiggy orders")
    if (/(how\s+much\s+did\s+i\s+spend|transactions?|orders?|expense\s+on)/i.test(text)) {
      let category: string | null = null;
      if (/food|dining/i.test(text)) category = 'Food & Dining';
      else if (/grocer/i.test(text)) category = 'Groceries';
      else if (/transport|fuel|cab|uber|ola/i.test(text)) category = 'Transportation';
      else if (/shop/i.test(text)) category = 'Shopping';
      else if (/entertain|movie|netflix/i.test(text)) category = 'Entertainment';

      return {
        intent: CopilotIntent.TRANSACTION_QUERY,
        confidence: 0.9,
        parameters: {
          category,
          period: 'current_month',
        },
      };
    }

    // 9. Default to General Finance overview
    return {
      intent: CopilotIntent.GENERAL_FINANCE,
      confidence: 0.8,
      parameters: {
        period: 'current_month',
      },
    };
  }

  /**
   * Primary Intent Detector: Calls LLM with structured output, falls back cleanly to deterministic parser.
   */
  async detectIntent(message: string): Promise<ExtractedIntent> {
    const apiKey = this.getApiKey();

    if (apiKey) {
      try {
        const systemPrompt = `You are a financial intent classifier for a personal finance application.
Analyze the user message and extract intent and parameters into STRICT JSON matching this schema:
{
  "intent": "TRANSACTION_QUERY" | "SPENDING_DIAGNOSTIC" | "BUDGET_QUERY" | "GOAL_PROGRESS" | "PURCHASE_SIMULATION" | "DEBT_QUERY" | "ACCOUNT_BALANCE" | "INCOME_QUERY" | "GENERAL_FINANCE",
  "confidence": number between 0 and 1,
  "parameters": {
    "category": string | null,
    "amount": number | null,
    "item": string | null,
    "period": "current_month" | "last_month" | "next_month" | "today" | "yesterday" | "current_year" | string | null,
    "comparisonPeriod": string | null,
    "goalType": string | null,
    "goalName": string | null,
    "targetAmount": number | null,
    "timeframe": string | null,
    "accountName": string | null,
    "actionType": "ONE_TIME_EXPENSE" | "NEW_EMI" | "ONE_TIME_INCOME" | null
  }
}
Return ONLY valid JSON. No conversational text or markdown code fences.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message },
            ],
            temperature: 0.0,
            response_format: { type: 'json_object' },
          }),
        });

        if (response.ok) {
          const resJson: any = await response.json();
          const rawContent = resJson.choices?.[0]?.message?.content?.trim();
          if (rawContent) {
            const parsed = JSON.parse(rawContent);
            const validated = extractedIntentSchema.safeParse(parsed);
            if (validated.success) {
              return this.enrichWithDeterministicDates(validated.data);
            }
          }
        }
      } catch {
        // Non-blocking: fallback to deterministic regex classifier
      }
    }

    // High precision deterministic fallback
    const fallback = this.extractDeterministicIntent(message);
    return this.enrichWithDeterministicDates(fallback);
  }

  /**
   * Resolves dates deterministically using dateResolver.
   */
  private enrichWithDeterministicDates(extracted: ExtractedIntent): ExtractedIntent {
    const period = extracted.parameters.period || 'current_month';
    const resolved = dateResolver.resolve(period);

    return {
      ...extracted,
      parameters: {
        ...extracted.parameters,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        period: resolved.month,
      },
    };
  }
}

export const intentService = new IntentService();
