import { pool } from '../../config/database.js';
import { causalDiagnosticService, SpendingDiagnosticResult } from './causal-diagnostic.service.js';
import { monthlyReviewService, MonthlyReviewResult } from './monthly-review.service.js';
import { financialEventDetectorService } from './financial-event-detector.service.js';
import { NotFoundError } from '../../errors/app-error.js';

export interface FinancialInsightRow {
  id: string;
  user_id: string;
  insight_type: string;
  period: string;
  title: string;
  summary: string;
  structured_data: any;
  ai_narrative: string | null;
  created_at: Date;
  updated_at: Date;
}

export class InsightService {
  /**
   * Evaluates spending diagnostics and persists the record into financial_insights.
   */
  async getSpendingDiagnostics(userId: string, targetMonth?: string): Promise<SpendingDiagnosticResult> {
    const month = targetMonth || new Date().toISOString().slice(0, 7);
    const result = await causalDiagnosticService.runDiagnostic(userId, month);

    // Save/update insight in database
    await pool.query(
      `INSERT INTO financial_insights (
        user_id, insight_type, period, title, summary, structured_data, ai_narrative, updated_at
      )
      VALUES ($1, 'CAUSAL_DIAGNOSTIC', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING;`,
      [
        userId,
        month,
        `Spending Diagnostics for ${month}`,
        result.explanation,
        JSON.stringify(result),
        result.explanation,
      ],
    );

    return result;
  }

  /**
   * Generates or retrieves the End-of-Month retrospective financial review.
   */
  async getMonthlyReview(userId: string, targetMonth?: string): Promise<MonthlyReviewResult> {
    const month = targetMonth || new Date().toISOString().slice(0, 7);
    const review = await monthlyReviewService.generateReview(userId, month);

    await pool.query(
      `INSERT INTO financial_insights (
        user_id, insight_type, period, title, summary, structured_data, ai_narrative, updated_at
      )
      VALUES ($1, 'MONTHLY_REVIEW', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING;`,
      [
        userId,
        month,
        `${review.monthName} Financial Review`,
        review.aiNarrative,
        JSON.stringify(review),
        review.aiNarrative,
      ],
    );

    return review;
  }

  /**
   * Evaluates the full financial intelligence layer and generates events/notifications.
   */
  async evaluateAndNotify(userId: string, targetMonth?: string) {
    const evaluation = await financialEventDetectorService.evaluateAndDispatchAll(userId, targetMonth);
    return evaluation;
  }

  /**
   * Lists historical insights persisted for the user.
   */
  async listInsights(userId: string, period?: string) {
    let query = `
      SELECT id, insight_type, period, title, summary, structured_data, ai_narrative, created_at
      FROM financial_insights
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (period) {
      query += ' AND period = $2';
      params.push(period);
    }

    query += ' ORDER BY created_at DESC LIMIT 50;';

    const res = await pool.query<FinancialInsightRow>(query, params);
    return res.rows.map(r => ({
      id: r.id,
      insightType: r.insight_type,
      period: r.period,
      title: r.title,
      summary: r.summary,
      structuredData: r.structured_data,
      aiNarrative: r.ai_narrative,
      createdAt: r.created_at,
    }));
  }

  async getInsightById(id: string, userId: string) {
    const res = await pool.query<FinancialInsightRow>(
      `SELECT * FROM financial_insights WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundError('Insight not found');
    }
    const r = res.rows[0];
    return {
      id: r.id,
      insightType: r.insight_type,
      period: r.period,
      title: r.title,
      summary: r.summary,
      structuredData: r.structured_data,
      aiNarrative: r.ai_narrative,
      createdAt: r.created_at,
    };
  }
}

export const insightService = new InsightService();
