import { budgetPaceService } from './budget-pace.service.js';
import { recurringPaymentService } from './recurring-payment.service.js';

export interface BudgetPaceExplanationResult {
  aiAvailable: boolean;
  model: string | null;
  explanation: string;
  fallbackExplanation: string;
  error?: string;
}

export class AIExplanationService {
  private getApiKey(): string | null {
    return process.env.GROQ_API_KEY?.trim() || null;
  }

  private get model(): string {
    return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
  }

  private buildFallbackExplanation(pace: any, recurringPayments: any[]): string {
    const lines: string[] = [];
    if (pace?.overall) {
      const o = pace.overall;
      lines.push(
        `Your spending pace is ${o.status.replace(/_/g, ' ').toLowerCase()}. ` +
          `You have spent ${o.actualSpent} against an ideal ${o.idealSpentToDate} by this point in the month, ` +
          `with a daily difference of ${o.velocityDelta}.`,
      );
    }
    const aheadCategories = (pace?.categories || []).filter((c: any) => c.status === 'AHEAD_OF_PACE' || c.status === 'SLIGHTLY_AHEAD');
    if (aheadCategories.length > 0) {
      lines.push(`Categories ahead of pace: ${aheadCategories.map((c: any) => c.category).join(', ')}.`);
    }
    const upcoming = recurringPayments
      .filter((p: any) => p.nextExpectedDate)
      .slice(0, 5)
      .map((p: any) => `${p.merchantName} (${p.averageAmount}) expected around ${String(p.nextExpectedDate).slice(0, 10)}`);
    if (upcoming.length > 0) {
      lines.push(`Upcoming recurring payments: ${upcoming.join('; ')}.`);
    }
    return lines.join(' ');
  }

  async explainBudgetPace(userId: string, month?: string, currency?: string): Promise<{ pace: any; recurringPayments: any[]; ai: BudgetPaceExplanationResult }> {
    const pace = await budgetPaceService.getPace(userId, month, currency);
    const recurringPayments = await recurringPaymentService.list(userId);

    const fallbackExplanation = this.buildFallbackExplanation(pace, recurringPayments);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        pace,
        recurringPayments,
        ai: {
          aiAvailable: false,
          model: null,
          explanation: fallbackExplanation,
          fallbackExplanation,
        },
      };
    }

    try {
      const promptPayload = {
        pace,
        recurringPayments: recurringPayments.map((payment: any) => ({
          merchant: payment.merchantName,
          frequency: payment.frequency,
          amount: payment.averageAmount,
          nextExpectedDate: payment.nextExpectedDate,
          confidenceScore: payment.confidenceScore,
          status: payment.status,
        })),
      };

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content:
                'You are a personal finance copilot. Explain already-calculated financial insights in clear, concise natural language. Do not calculate, change, or invent any numbers. Only interpret the provided structured data. Mention the most important spending-pace issues and upcoming recurring payments.',
            },
            {
              role: 'user',
              content: JSON.stringify(promptPayload),
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          pace,
          recurringPayments,
          ai: {
            aiAvailable: false,
            model: this.model,
            explanation: fallbackExplanation,
            fallbackExplanation,
            error: `LLM request failed: ${response.status} ${errorText}`,
          },
        };
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const explanation = data.choices?.[0]?.message?.content?.trim() || fallbackExplanation;

      return {
        pace,
        recurringPayments,
        ai: {
          aiAvailable: true,
          model: this.model,
          explanation,
          fallbackExplanation,
        },
      };
    } catch (error) {
      return {
        pace,
        recurringPayments,
        ai: {
          aiAvailable: false,
          model: this.model,
          explanation: fallbackExplanation,
          fallbackExplanation,
          error: error instanceof Error ? error.message : 'Unknown LLM error',
        },
      };
    }
  }

  async explainForecast(userId: string, month?: string, currency?: string) {
    const { forecastService } = await import('./forecast.service.js');
    const forecast = await forecastService.getForecast(userId, month, currency);
    const fallbackExplanation = `Month-end projection is ${forecast.projectedExpenses} with projected savings of ${forecast.projectedSavings}. Confidence is ${forecast.confidence}.`;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { forecast, ai: { aiAvailable: false, model: null, explanation: fallbackExplanation, fallbackExplanation } };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            { role: 'system', content: 'Explain already-calculated forecast facts concisely. Do not calculate or invent numbers.' },
            { role: 'user', content: JSON.stringify(forecast) },
          ],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { forecast, ai: { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: `LLM request failed: ${response.status} ${errorText}` } };
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const explanation = data.choices?.[0]?.message?.content?.trim() || fallbackExplanation;
      return { forecast, ai: { aiAvailable: true, model: this.model, explanation, fallbackExplanation } };
    } catch (error) {
      return { forecast, ai: { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: error instanceof Error ? error.message : 'Unknown LLM error' } };
    }
  }

  async explainAnomalies(userId: string, month?: string) {
    const { anomalyService } = await import('./anomaly-detection.service.js');
    const anomalies = await anomalyService.detect(userId, month);
    const fallbackExplanation = anomalies.count === 0
      ? 'No significant spending anomalies were detected.'
      : `${anomalies.count} potential anomalies detected: ${anomalies.anomalies.map((a: any) => a.type).join(', ')}.`;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { anomalies, ai: { aiAvailable: false, model: null, explanation: fallbackExplanation, fallbackExplanation } };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            { role: 'system', content: 'Explain already-detected financial anomalies concisely. Do not calculate or invent numbers.' },
            { role: 'user', content: JSON.stringify(anomalies) },
          ],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { anomalies, ai: { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: `LLM request failed: ${response.status} ${errorText}` } };
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const explanation = data.choices?.[0]?.message?.content?.trim() || fallbackExplanation;
      return { anomalies, ai: { aiAvailable: true, model: this.model, explanation, fallbackExplanation } };
    } catch (error) {
      return { anomalies, ai: { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: error instanceof Error ? error.message : 'Unknown LLM error' } };
    }
  }
  async explainSimulation(userId: string, result: any) {
    const fallbackExplanation = `Decision: ${result.decision.status}. ${result.decision.reasons.map((reason: any) => reason.message).join(' ')}`.trim();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { aiAvailable: false, model: null, explanation: fallbackExplanation, fallbackExplanation };
    }
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            { role: 'system', content: 'Explain a deterministic financial simulation result. Do not calculate or invent numbers.' },
            { role: 'user', content: JSON.stringify(result) },
          ],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: `LLM request failed: ${response.status} ${errorText}` };
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const explanation = data.choices?.[0]?.message?.content?.trim() || fallbackExplanation;
      return { aiAvailable: true, model: this.model, explanation, fallbackExplanation };
    } catch (error) {
      return { aiAvailable: false, model: this.model, explanation: fallbackExplanation, fallbackExplanation, error: error instanceof Error ? error.message : 'Unknown LLM error' };
    }
  }
}

export const aiExplanationService = new AIExplanationService();