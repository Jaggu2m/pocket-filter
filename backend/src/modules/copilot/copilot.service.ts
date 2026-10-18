import { pool } from '../../config/database.js';
import { CopilotIntent, type ChatRequest } from './schemas/copilot.schema.js';
import { intentService } from './intent.service.js';
import { explanationService } from './explanation.service.js';
import { guardrailService } from './guardrail.service.js';
import { simulationService } from '../../services/simulation.service.js';
import { budgetService } from '../../services/budget.service.js';
import { budgetPaceService } from '../../services/budget-pace.service.js';
import { goalService } from '../../services/goal.service.js';
import { accountService } from '../../services/account.service.js';
import { dashboardService } from '../../services/dashboard.service.js';
import { recurringPaymentService } from '../../services/recurring-payment.service.js';
import { transactionRepository } from '../../repositories/transaction.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { NotFoundError } from '../../errors/app-error.js';

export interface CopilotChatResponse {
  conversationId: string;
  message: string;
  intent: CopilotIntent;
  data: any;
  decision?: string;
  tradeoffs?: string[];
  alternative?: {
    suggestion: string;
    reason: string;
  } | null;
}

export class CopilotService {
  /**
   * Main Conversational Pipeline:
   * Input Guardrail -> Intent Extraction -> Deterministic Finance Engine -> Explanation Generation -> Output Guardrail -> Persistence
   */
  async chat(userId: string, request: ChatRequest): Promise<CopilotChatResponse> {
    // 1. Input Guardrail
    const inputCheck = guardrailService.validateInput(request.message);
    if (!inputCheck.passed) {
      return {
        conversationId: request.conversationId || 'new',
        message: inputCheck.flaggedReason || 'I cannot fulfill this request due to safety constraints.',
        intent: CopilotIntent.GENERAL_FINANCE,
        data: {},
      };
    }

    // 2. Load or Create Conversation
    let conversationId = request.conversationId;
    if (conversationId) {
      const convCheck = await pool.query(
        'SELECT id FROM copilot_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId],
      );
      if (convCheck.rows.length === 0) {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      const newConv = await pool.query<{ id: string }>(
        `INSERT INTO copilot_conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [userId, request.message.slice(0, 60)],
      );
      conversationId = newConv.rows[0].id;
    } else {
      await pool.query(
        'UPDATE copilot_conversations SET updated_at = NOW() WHERE id = $1',
        [conversationId],
      );
    }

    // Load recent conversation history (last 6 messages)
    const historyRes = await pool.query(
      `SELECT role, content, intent, parameters, created_at
       FROM copilot_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 6`,
      [conversationId],
    );
    const history = historyRes.rows.reverse();

    // 3. Intent & Entity Extraction
    const extracted = await intentService.detectIntent(request.message);
    const { intent, parameters } = extracted;

    // 4. Deterministic Engine Orchestration
    const engineFacts = await this.routeAndExecuteEngine(userId, intent, parameters);

    // 5. Natural Language Explanation Generation
    const explanation = await explanationService.generateExplanation(
      intent,
      engineFacts,
      request.message,
      history,
    );

    // 6. Output Guardrail
    const sanitizedMessage = guardrailService.validateAndEnforceOutput(
      explanation.message,
      engineFacts,
    );

    // 7. Persist Messages (User + Assistant)
    await pool.query(
      `INSERT INTO copilot_messages (conversation_id, user_id, role, content, intent, parameters)
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [conversationId, userId, request.message, intent, JSON.stringify(parameters)],
    );

    await pool.query(
      `INSERT INTO copilot_messages (conversation_id, user_id, role, content, intent, engine_result, decision, tradeoffs, alternative)
       VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8)`,
      [
        conversationId,
        userId,
        sanitizedMessage,
        intent,
        JSON.stringify(engineFacts),
        explanation.decision,
        explanation.tradeoffs || [],
        explanation.alternative ? JSON.stringify(explanation.alternative) : null,
      ],
    );

    return {
      conversationId,
      message: sanitizedMessage,
      intent,
      data: engineFacts,
      decision: explanation.decision,
      tradeoffs: explanation.tradeoffs,
      alternative: explanation.alternative,
    };
  }

  /**
   * Routes extracted intent to existing deterministic backend calculation services.
   */
  private async routeAndExecuteEngine(
    userId: string,
    intent: CopilotIntent,
    params: any,
  ): Promise<any> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const targetMonth = params.period || currentMonth;

    switch (intent) {
      // 1. Purchase Simulation ("Can I buy a ₹40,000 phone next month?")
      case CopilotIntent.PURCHASE_SIMULATION: {
        const scenario = {
          type: (params.actionType || 'ONE_TIME_EXPENSE') as any,
          amount: params.amount || 40000,
          description: params.item || 'Purchase Item',
          date: params.timeframe === 'next_month'
            ? new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString()
            : new Date().toISOString(),
        };

        const simResult = await simulationService.simulate(userId, scenario);

        return {
          simulation: simResult,
          purchaseAmount: scenario.amount,
          timeframe: params.timeframe || 'current_month',
          item: scenario.description,
          affordable: simResult.decision.status === 'AFFORDABLE' || simResult.decision.status === 'AFFORDABLE_WITH_IMPACT',
          remainingLiquidity: simResult.after.liquidBalance,
          emergencyReserve: simResult.after.emergencyReserve,
          unallocatedLiquidity: simResult.after.unallocatedLiquidity,
          riskLevel: simResult.decision.status === 'NOT_RECOMMENDED' ? 'HIGH' : simResult.decision.status === 'AFFORDABLE_WITH_IMPACT' ? 'MEDIUM' : 'LOW',
        };
      }

      // 2. Spending Diagnostic ("Why did my expenses increase this month?")
      case CopilotIntent.SPENDING_DIAGNOSTIC: {
        const curDate = new Date();
        const prevDate = new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth() - 1, 1));
        const prevMonth = prevDate.toISOString().slice(0, 7);

        const [currDashboard, prevDashboard] = await Promise.all([
          dashboardService.getDashboard(userId, { month: currentMonth }),
          dashboardService.getDashboard(userId, { month: prevMonth }),
        ]);

        const currentSpending = Number(currDashboard.totalExpenses || 0);
        const previousSpending = Number(prevDashboard.totalExpenses || 0);
        const increase = currentSpending - previousSpending;
        const increasePercentage = previousSpending > 0
          ? Number(((increase / previousSpending) * 100).toFixed(1))
          : 0;

        // Calculate Category Drivers from variance
        const drivers = (currDashboard.categoryVariance || [])
          .map((c: any) => ({
            category: c.category,
            currentAmount: Number(c.current || 0),
            previousAmount: Number(c.previous || 0),
            increase: Number(c.change || 0),
          }))
          .sort((a: any, b: any) => b.increase - a.increase);

        return {
          currentMonth,
          previousMonth: prevMonth,
          currentSpending,
          previousSpending,
          increase,
          increasePercentage,
          drivers,
        };
      }

      // 3. Budget Query ("How much of my budget is left?")
      case CopilotIntent.BUDGET_QUERY: {
        let budgetData: any = null;
        try {
          budgetData = await budgetService.getCurrentBudget(userId, targetMonth);
        } catch {
          // If no budget created yet
        }

        let paceData: any = null;
        try {
          paceData = await budgetPaceService.getPace(userId, targetMonth);
        } catch {
          // Non-blocking
        }

        const dashboard = await dashboardService.getDashboard(userId, { month: targetMonth });

        return {
          month: targetMonth,
          budget: budgetData ? {
            overallLimit: Number(budgetData.overallLimit || 0),
            spent: Number(dashboard.totalExpenses || 0),
            remaining: Math.max(0, Number(budgetData.overallLimit || 0) - Number(dashboard.totalExpenses || 0)),
            utilization: Number(budgetData.overallLimit || 0) > 0
              ? Number(((Number(dashboard.totalExpenses || 0) / Number(budgetData.overallLimit)) * 100).toFixed(1))
              : 0,
            categoryLimits: budgetData.categoryLimits || [],
          } : {
            overallLimit: 0,
            spent: Number(dashboard.totalExpenses || 0),
            remaining: 0,
            utilization: 0,
          },
          pace: paceData?.overall || null,
        };
      }

      // 4. Goal Progress ("Am I on track to reach my ₹1 lakh emergency fund?")
      case CopilotIntent.GOAL_PROGRESS: {
        const goals = await goalService.listGoals(userId);
        return {
          goals: goals.map((g: any) => ({
            id: g.id,
            name: g.name,
            targetAmount: Number(g.targetAmount || 0),
            savedAmount: Number(g.savedAmount || 0),
            remainingAmount: Math.max(0, Number(g.targetAmount || 0) - Number(g.savedAmount || 0)),
            progressPercentage: Number(g.progressPercentage || 0),
            targetDate: g.targetDate,
            requiredMonthlyContribution: Number(g.requiredMonthlyContribution || 0),
            status: g.status,
            goalType: g.goalType,
          })),
        };
      }

      // 5. Debt / EMI Query ("What are my active EMIs?", "How much debt do I owe?")
      case CopilotIntent.DEBT_QUERY: {
        const recurrings = await recurringPaymentService.list(userId);
        const emiPayments = recurrings.filter(
          (p: any) =>
            p.category?.toLowerCase().includes('emi') ||
            p.category?.toLowerCase().includes('loan') ||
            p.merchantName?.toLowerCase().includes('emi') ||
            p.merchantName?.toLowerCase().includes('loan'),
        );

        const totalEmiCommitment = emiPayments.reduce(
          (sum: number, p: any) => sum + Number(p.averageAmount || 0),
          0,
        );

        return {
          activeEmis: emiPayments.map((p: any) => ({
            id: p.id,
            merchantName: p.merchantName,
            averageAmount: Number(p.averageAmount || 0),
            frequency: p.frequency,
            nextExpectedDate: p.nextExpectedDate,
          })),
          totalEmiCommitment,
          totalRecurringCommitments: recurrings.reduce(
            (sum: number, p: any) => sum + Number(p.averageAmount || 0),
            0,
          ),
        };
      }

      // 6. Account Balance ("How much money do I have?")
      case CopilotIntent.ACCOUNT_BALANCE: {
        const [summary, accts] = await Promise.all([
          accountService.getAccountSummary(userId),
          accountRepository.findByUserId(userId),
        ]);
        return {
          totalBalance: Number(summary.totalLiquidBalance || 0),
          unspecifiedBalance: Number(summary.unspecifiedBalance || 0),
          totalCreditDebt: Number(summary.totalCreditDebt || 0),
          netWorth: Number(summary.netWorth || 0),
          accounts: accts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance, currency: a.currency })),
        };
      }

      // 7. Income Query ("How much did I earn this month?")
      case CopilotIntent.INCOME_QUERY: {
        const dashboard = await dashboardService.getDashboard(userId, { month: targetMonth });
        return {
          month: targetMonth,
          totalIncome: Number(dashboard.totalIncome || 0),
          netSavings: Number(dashboard.netSavings || 0),
        };
      }

      // 8. Transaction Query ("How much did I spend on food this month?")
      case CopilotIntent.TRANSACTION_QUERY: {
        const result = await transactionRepository.findTransactions(userId, {
          category: params.category || undefined,
          startDate: params.startDate ? new Date(params.startDate) : undefined,
          endDate: params.endDate ? new Date(params.endDate) : undefined,
          limit: 50,
        });

        const transactions = result.transactions;
        const totalSpent = transactions
          .filter((t: any) => t.type === 'expense')
          .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

        return {
          category: params.category || 'All',
          period: params.period || currentMonth,
          count: transactions.length,
          totalSpent,
          recentTransactions: transactions.slice(0, 5).map((t: any) => ({
            id: t.id,
            merchant: t.merchant || t.description,
            amount: Number(t.amount),
            date: t.date,
            category: t.category,
            type: t.type,
          })),
        };
      }

      // 9. General Finance / Overview
      default: {
        const [accountSummary, dashboard, accts] = await Promise.all([
          accountService.getAccountSummary(userId),
          dashboardService.getDashboard(userId, { month: currentMonth }),
          accountRepository.findByUserId(userId),
        ]);

        return {
          totalBalance: Number(accountSummary.totalLiquidBalance || 0),
          netWorth: Number(accountSummary.netWorth || 0),
          monthlyIncome: Number(dashboard.totalIncome || 0),
          monthlyExpenses: Number(dashboard.totalExpenses || 0),
          netSavings: Number(dashboard.netSavings || 0),
          accounts: accts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance, currency: a.currency })),
        };
      }
    }
  }

  /**
   * Conversation Management Endpoints
   */
  async listConversations(userId: string) {
    const res = await pool.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              COUNT(m.id)::int as message_count
       FROM copilot_conversations c
       LEFT JOIN copilot_messages m ON c.id = m.conversation_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async getConversation(userId: string, conversationId: string) {
    const convRes = await pool.query(
      'SELECT id, title, created_at, updated_at FROM copilot_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    if (convRes.rows.length === 0) {
      throw new NotFoundError('Conversation not found');
    }

    const messagesRes = await pool.query(
      `SELECT id, role, content, intent, parameters, engine_result, decision, tradeoffs, alternative, created_at
       FROM copilot_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    return {
      conversation: convRes.rows[0],
      messages: messagesRes.rows,
    };
  }

  async deleteConversation(userId: string, conversationId: string) {
    const res = await pool.query(
      'DELETE FROM copilot_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [conversationId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundError('Conversation not found');
    }
    return { deleted: true, id: conversationId };
  }
}

export const copilotService = new CopilotService();
