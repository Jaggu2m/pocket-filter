export interface ResolvedDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  month: string;     // YYYY-MM
  label: string;
}

export class DeterministicDateResolver {
  /**
   * Resolves natural language time references into exact date ranges.
   * Uses referenceDate (defaults to now) to ensure reproducible calculations.
   */
  resolve(periodStr?: string | null, referenceDate: Date = new Date()): ResolvedDateRange {
    const ref = new Date(referenceDate);
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth(); // 0-indexed
    const day = ref.getUTCDate();

    const normalized = (periodStr || 'current_month').toLowerCase().trim();

    // 1. "today"
    if (normalized === 'today') {
      const dStr = ref.toISOString().slice(0, 10);
      return {
        startDate: dStr,
        endDate: dStr,
        month: ref.toISOString().slice(0, 7),
        label: 'Today',
      };
    }

    // 2. "yesterday"
    if (normalized === 'yesterday') {
      const yDate = new Date(ref);
      yDate.setUTCDate(day - 1);
      const dStr = yDate.toISOString().slice(0, 10);
      return {
        startDate: dStr,
        endDate: dStr,
        month: yDate.toISOString().slice(0, 7),
        label: 'Yesterday',
      };
    }

    // 3. "this month" / "current_month" / "this_month"
    if (
      normalized.includes('current') ||
      normalized.includes('this month') ||
      normalized === 'current_month' ||
      normalized === 'this_month' ||
      normalized === 'now'
    ) {
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: 'This Month',
      };
    }

    // 4. "last month" / "previous_month" / "last_month"
    if (
      normalized.includes('last month') ||
      normalized.includes('previous') ||
      normalized === 'previous_month' ||
      normalized === 'last_month'
    ) {
      const prevStart = new Date(Date.UTC(year, month - 1, 1));
      const prevEnd = new Date(Date.UTC(year, month, 0));
      const mStr = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        startDate: prevStart.toISOString().slice(0, 10),
        endDate: prevEnd.toISOString().slice(0, 10),
        month: mStr,
        label: 'Last Month',
      };
    }

    // 5. "next month" / "next_month"
    if (normalized.includes('next month') || normalized === 'next_month') {
      const nextStart = new Date(Date.UTC(year, month + 1, 1));
      const nextEnd = new Date(Date.UTC(year, month + 2, 0));
      const mStr = `${nextStart.getUTCFullYear()}-${String(nextStart.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        startDate: nextStart.toISOString().slice(0, 10),
        endDate: nextEnd.toISOString().slice(0, 10),
        month: mStr,
        label: 'Next Month',
      };
    }

    // 6. "this week" / "current_week"
    if (normalized.includes('this week') || normalized === 'this_week') {
      const dayOfWeek = ref.getUTCDay(); // 0 is Sunday
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(ref);
      monday.setUTCDate(day - diffToMonday);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        startDate: monday.toISOString().slice(0, 10),
        endDate: sunday.toISOString().slice(0, 10),
        month: monday.toISOString().slice(0, 7),
        label: 'This Week',
      };
    }

    // 7. "this year" / "current_year"
    if (normalized.includes('this year') || normalized === 'current_year') {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        month: `${year}-01`,
        label: `Year ${year}`,
      };
    }

    // 8. "last year" / "previous_year"
    if (normalized.includes('last year') || normalized === 'previous_year') {
      return {
        startDate: `${year - 1}-01-01`,
        endDate: `${year - 1}-12-31`,
        month: `${year - 1}-01`,
        label: `Year ${year - 1}`,
      };
    }

    // 9. Format like "YYYY-MM"
    const ymMatch = /^(\d{4})-(\d{2})$/.exec(normalized);
    if (ymMatch) {
      const y = parseInt(ymMatch[1], 10);
      const m = parseInt(ymMatch[2], 10);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0));
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        month: normalized,
        label: normalized,
      };
    }

    // Default to current month
    const defStart = new Date(Date.UTC(year, month, 1));
    const defEnd = new Date(Date.UTC(year, month + 1, 0));
    return {
      startDate: defStart.toISOString().slice(0, 10),
      endDate: defEnd.toISOString().slice(0, 10),
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: 'This Month',
    };
  }
}

export const dateResolver = new DeterministicDateResolver();
