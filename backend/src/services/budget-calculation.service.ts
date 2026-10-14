export interface CalculatedCategory {
  categoryId: string | null;
  categoryName: string;
  limitAmount: number | null;
  actualSpending: number;
  remaining: number | null;
  utilizationPercent: number | null;
  variance: number | null;
  exceeded: boolean;
  status: 'on_track' | 'warning' | 'exceeded' | 'unbudgeted';
}

export interface CalculatedBudgetSummary {
  month: string;
  currency: string;
  overallLimit: number;
  totalActualSpending: number;
  overallRemaining: number;
  overallUtilizationPercent: number;
  exceededOverall: boolean;
  unallocatedLimit: number;
  categories: CalculatedCategory[];
  exceededCategories: string[];
  unbudgetedSpending: number;
}

export class BudgetCalculationService {
  round(value: number): number {
    return Number((value || 0).toFixed(2));
  }

  calculateCategory(
    categoryId: string | null,
    categoryName: string,
    limitAmount: number | null,
    actualSpending: number,
  ): CalculatedCategory {
    const actual = this.round(actualSpending);
    const limit = limitAmount === null ? null : this.round(limitAmount);

    let remaining: number | null = null;
    let utilizationPercent: number | null = null;
    let variance: number | null = null;
    let exceeded = false;
    let status: CalculatedCategory['status'] = 'unbudgeted';

    if (limit !== null) {
      remaining = this.round(limit - actual);
      variance = remaining;
      utilizationPercent = limit > 0 ? this.round((actual / limit) * 100) : 0;
      exceeded = actual > limit;
      if (exceeded) status = 'exceeded';
      else if (utilizationPercent !== null && utilizationPercent >= 80) status = 'warning';
      else status = 'on_track';
    } else {
      status = 'unbudgeted';
    }

    return {
      categoryId,
      categoryName,
      limitAmount: limit,
      actualSpending: actual,
      remaining,
      utilizationPercent,
      variance,
      exceeded,
      status,
    };
  }

  calculateSummary(
    month: string,
    currency: string,
    overallLimit: number,
    categoryInputs: Array<{ categoryId: string | null; categoryName: string; limitAmount: number | null; actualSpending: number }>,
    allActualByCategory: Record<string, number>,
  ): CalculatedBudgetSummary {
    const totalActualSpending = Object.values(allActualByCategory).reduce((sum, value) => sum + value, 0);

    const categoryNames = new Set<string>();
    for (const input of categoryInputs) categoryNames.add(input.categoryName);
    for (const name of Object.keys(allActualByCategory)) categoryNames.add(name);

    const categoryMap = new Map(categoryInputs.map((input) => [input.categoryName, input]));

    const categories: CalculatedCategory[] = [...categoryNames].map((name) => {
      const input = categoryMap.get(name);
      const actual = allActualByCategory[name] || 0;
      return this.calculateCategory(
        input?.categoryId ?? null,
        name,
        input ? input.limitAmount : null,
        actual,
      );
    });

    // Keep deterministic ordering: exceeded first, then by actual spend desc.
    categories.sort((a, b) => Number(b.exceeded) - Number(a.exceeded) || b.actualSpending - a.actualSpending);

    const allocatedLimit = categoryInputs.reduce((sum, input) => sum + (input.limitAmount || 0), 0);
    const exceededCategories = categories.filter((c) => c.exceeded).map((c) => c.categoryName);

    return {
      month,
      currency,
      overallLimit: this.round(overallLimit),
      totalActualSpending: this.round(totalActualSpending),
      overallRemaining: this.round(overallLimit - totalActualSpending),
      overallUtilizationPercent: overallLimit > 0 ? this.round((totalActualSpending / overallLimit) * 100) : 0,
      exceededOverall: totalActualSpending > overallLimit,
      unallocatedLimit: this.round(overallLimit - allocatedLimit),
      categories,
      exceededCategories,
      unbudgetedSpending: this.round(
        Object.entries(allActualByCategory)
          .filter(([name]) => !categoryMap.has(name))
          .reduce((sum, [, value]) => sum + value, 0),
      ),
    };
  }
}

export const budgetCalculationService = new BudgetCalculationService();