import type { CopilotIntent } from './schemas/copilot.schema.js';

export interface ExplanationResult {
  message: string;
  decision: string;
  tradeoffs: string[];
  alternative?: {
    suggestion: string;
    reason: string;
  } | null;
}

export class ExplanationService {
  private getApiKey(): string | null {
    return process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  }

  private get model(): string {
    return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
  }

  /**
   * Deterministic Natural Language Generator: Formats clean trade-offs and decisions
   * directly from computed engine facts without hallucinating any values.
   */
  private generateDeterministicExplanation(
    intent: CopilotIntent,
    data: any,
    userQuery: string,
  ): ExplanationResult {
    switch (intent) {
      case 'PURCHASE_SIMULATION': {
        const sim = data?.simulation || data;
        const purchaseAmount = sim?.scenario?.amount || 0;
        const item = sim?.scenario?.description || sim?.scenario?.category || 'purchase';
        const isAffordable = sim?.decision?.status === 'AFFORDABLE' || sim?.decision?.status === 'AFFORDABLE_WITH_IMPACT';
        const liquidRemaining = sim?.after?.liquidBalance ?? sim?.after?.liquidMoney ?? 0;
        const emergencyReserve = sim?.after?.emergencyReserve ?? 0;
        const unallocated = sim?.after?.unallocatedLiquidity ?? (liquidRemaining - emergencyReserve);

        let decision: string = isAffordable
          ? unallocated < 15000
            ? 'AFFORDABLE_WITH_CAUTION'
            : 'AFFORDABLE'
          : 'NOT_RECOMMENDED';

        const tradeoffs: string[] = [
          `Reduces flexible liquid funds by ₹${purchaseAmount.toLocaleString('en-IN')}`,
          emergencyReserve > 0 ? `Emergency reserve of ₹${emergencyReserve.toLocaleString('en-IN')} remains safeguarded` : 'No dedicated emergency reserve currently earmarked',
          `Leaves ₹${Math.max(0, unallocated).toLocaleString('en-IN')} in unallocated cash for the rest of the period`,
        ];

        let alternative = null;
        if (decision === 'AFFORDABLE_WITH_CAUTION') {
          alternative = {
            suggestion: 'Buffer your savings with a partial delay of 30 days',
            reason: 'Expected upcoming income would replenish your flexible liquidity before taking on this expense',
          };
        } else if (decision !== 'AFFORDABLE') {
          alternative = {
            suggestion: 'Delay purchase by 1-2 months or split into a low-interest EMI',
            reason: 'Allows your liquid surplus to rebuild above the emergency threshold',
          };
        }

        const message = isAffordable
          ? `You can afford the ₹${purchaseAmount.toLocaleString('en-IN')} ${item} based on your projected cash position. After the purchase, you will have roughly ₹${liquidRemaining.toLocaleString('en-IN')} in total liquid funds, of which ₹${emergencyReserve.toLocaleString('en-IN')} represents protected reserves. This leaves ₹${Math.max(0, unallocated).toLocaleString('en-IN')} in flexible liquidity.`
          : `The ₹${purchaseAmount.toLocaleString('en-IN')} ${item} is not recommended right now as it would severely deplete your available liquidity or breach your emergency reserve. Post-purchase flexible cash would drop to ₹${Math.max(0, unallocated).toLocaleString('en-IN')}.`;

        return { message, decision, tradeoffs, alternative };
      }

      case 'SPENDING_DIAGNOSTIC': {
        const curr = data?.currentSpending || 0;
        const prev = data?.previousSpending || 0;
        const diff = data?.increase || curr - prev;
        const pct = data?.increasePercentage ?? (prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0');
        const drivers = data?.drivers || [];

        const isHigher = diff > 0;
        const decision = isHigher ? 'SPENDING_INCREASED' : 'SPENDING_DECREASED';

        const tradeoffs = drivers.slice(0, 3).map((d: any) =>
          `${d.category}: ${d.increase >= 0 ? '+' : ''}₹${Math.abs(d.increase).toLocaleString('en-IN')}`
        );

        let driverSummary = '';
        if (drivers.length > 0) {
          driverSummary = ' The main contributors were: ' + drivers.slice(0, 3).map((d: any) => `${d.category} (+₹${Math.abs(d.increase).toLocaleString('en-IN')})`).join(', ') + '.';
        }

        const message = isHigher
          ? `Your spending increased by ₹${Math.abs(diff).toLocaleString('en-IN')} (${pct}%) compared to last month (₹${curr.toLocaleString('en-IN')} vs ₹${prev.toLocaleString('en-IN')}).${driverSummary}`
          : `Your spending decreased by ₹${Math.abs(diff).toLocaleString('en-IN')} compared to last month. Total expenses stand at ₹${curr.toLocaleString('en-IN')} vs ₹${prev.toLocaleString('en-IN')} previously.`;

        return {
          message,
          decision,
          tradeoffs,
          alternative: isHigher ? { suggestion: 'Set a tighter category limit on top drivers', reason: 'Prevents month-end budget overflow' } : null,
        };
      }

      case 'BUDGET_QUERY': {
        const b = data?.budget;
        const limit = b?.overallLimit || 0;
        const spent = b?.spent || 0;
        const remaining = b?.remaining || limit - spent;
        const util = b?.utilization || (limit > 0 ? ((spent / limit) * 100).toFixed(1) : 0);

        let decision = 'HEALTHY';
        if (Number(util) > 100) decision = 'OVERSPENT';
        else if (Number(util) > 85) decision = 'NEEDS_ATTENTION';

        const tradeoffs = [
          `Total Budget: ₹${limit.toLocaleString('en-IN')}`,
          `Total Spent to date: ₹${spent.toLocaleString('en-IN')} (${util}%)`,
          `Remaining Balance: ₹${Math.max(0, remaining).toLocaleString('en-IN')}`,
        ];

        const message = limit > 0
          ? `You have ₹${Math.max(0, remaining).toLocaleString('en-IN')} remaining of your ₹${limit.toLocaleString('en-IN')} monthly budget (${util}% utilized). You have spent ₹${spent.toLocaleString('en-IN')} so far this month.`
          : `You have spent ₹${spent.toLocaleString('en-IN')} this month. No overall monthly budget limit has been configured yet.`;

        return {
          message,
          decision,
          tradeoffs,
          alternative: Number(util) > 85 ? { suggestion: 'Moderate discretionary spending for remaining days', reason: 'Avoid exceeding overall monthly limit' } : null,
        };
      }

      case 'GOAL_PROGRESS': {
        const goals = data?.goals || [];
        if (goals.length === 0) {
          return {
            message: 'You do not have any active savings goals set up yet. Create a goal to start tracking progress with dedicated reserve allocations.',
            decision: 'INFORMATIONAL',
            tradeoffs: [],
          };
        }

        const g = goals[0];
        const pct = g?.progressPercentage || 0;
        const target = g?.targetAmount || 0;
        const saved = g?.savedAmount || 0;
        const monthly = g?.requiredMonthlyContribution || 0;
        const decision = pct >= 80 ? 'ON_TRACK' : 'IN_PROGRESS';

        const tradeoffs = [
          `Target: ₹${target.toLocaleString('en-IN')} for ${g?.name || 'Goal'}`,
          `Saved so far: ₹${saved.toLocaleString('en-IN')} (${pct}%)`,
          `Required monthly contribution: ₹${monthly.toLocaleString('en-IN')}/month`,
        ];

        const message = `You are ${pct}% of the way toward your ₹${target.toLocaleString('en-IN')} ${g?.name || 'savings'} goal (₹${saved.toLocaleString('en-IN')} saved). To stay on trajectory for your target date, aim to contribute approximately ₹${monthly.toLocaleString('en-IN')} per month.`;

        return { message, decision, tradeoffs };
      }

      case 'ACCOUNT_BALANCE': {
        const total = data?.totalBalance || 0;
        const accounts = data?.accounts || [];
        const unspec = data?.unspecifiedBalance || 0;

        const tradeoffs = [
          `Overall Money Balance: ₹${total.toLocaleString('en-IN')}`,
          `Tracked Bank Accounts: ₹${(total - unspec).toLocaleString('en-IN')} (${accounts.length} account${accounts.length !== 1 ? 's' : ''})`,
          `Unspecified / General Balance: ₹${unspec.toLocaleString('en-IN')}`,
        ];

        const message = `Your total net balance across all sources is ₹${total.toLocaleString('en-IN')}. This includes ₹${(total - unspec).toLocaleString('en-IN')} in ${accounts.length} tracked account(s) and ₹${unspec.toLocaleString('en-IN')} in your general balance.`;

        return { message, decision: 'INFORMATIONAL', tradeoffs };
      }

      default: {
        const message = `Here is your current financial status: Total balance is ₹${(data?.totalBalance || 0).toLocaleString('en-IN')} with ₹${(data?.monthlyExpenses || 0).toLocaleString('en-IN')} in expenses recorded this month.`;
        return {
          message,
          decision: 'INFORMATIONAL',
          tradeoffs: [`Current Balance: ₹${(data?.totalBalance || 0).toLocaleString('en-IN')}`],
        };
      }
    }
  }

  /**
   * Generates natural language explanations using LLM (if configured),
   * strictly adhering to the deterministic facts.
   */
  async generateExplanation(
    intent: CopilotIntent,
    engineFacts: any,
    userQuery: string,
    conversationHistory: any[] = [],
  ): Promise<ExplanationResult> {
    const apiKey = this.getApiKey();
    const fallback = this.generateDeterministicExplanation(intent, engineFacts, userQuery);

    if (apiKey) {
      try {
        const systemPrompt = `You are Pocket Filter's AI Finance Copilot.
You explain deterministic financial facts to the user conversationally.
CRITICAL RULES:
1. NEVER invent, modify, or fabricate numbers. Use the exact numbers provided in "FACTS".
2. Be concise, professional, empathetic, and actionable.
3. Structure your response as JSON matching:
{
  "message": "Conversational text explaining the outcome clearly...",
  "decision": "AFFORDABLE" | "AFFORDABLE_WITH_CAUTION" | "NOT_RECOMMENDED" | "ON_TRACK" | "HEALTHY" | "NEEDS_ATTENTION" | "INFORMATIONAL",
  "tradeoffs": ["point 1", "point 2"],
  "alternative": {
    "suggestion": "string",
    "reason": "string"
  } | null
}
Return ONLY valid JSON.`;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-4).map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
          {
            role: 'user',
            content: `User Question: "${userQuery}"\nIntent: ${intent}\nDETERMINISTIC ENGINE FACTS: ${JSON.stringify(engineFacts)}`,
          },
        ];

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        });

        if (response.ok) {
          const resJson: any = await response.json();
          const rawContent = resJson.choices?.[0]?.message?.content?.trim();
          if (rawContent) {
            const parsed = JSON.parse(rawContent);
            if (parsed.message && parsed.decision) {
              return {
                message: parsed.message,
                decision: parsed.decision || fallback.decision,
                tradeoffs: Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : fallback.tradeoffs,
                alternative: parsed.alternative || fallback.alternative,
              };
            }
          }
        }
      } catch {
        // Fallback to deterministic generator
      }
    }

    return fallback;
  }
}

export const explanationService = new ExplanationService();
