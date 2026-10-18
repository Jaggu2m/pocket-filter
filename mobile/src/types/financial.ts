export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description?: string;
  date: string;
  accountId: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  priority: number;
}

export interface BudgetCategory {
  category: string;
  limit: number;
  spent: number;
}

export interface Budget {
  month: string;
  overallLimit: number;
  spent: number;
  categories: BudgetCategory[];
}

export interface FinancialSummary {
  availableBalance: number;
  spendingCapacityPerDay: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  emergencyReserve: number;
  goalCommitments: number;
  upcomingBills: number;
}

export interface Emi {
  id: string;
  name: string;
  monthlyAmount: number;
  monthsRemaining: number;
  nextPaymentDate: string;
  totalRemainingDebt: number;
}

export interface Lent {
  id: string;
  person: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'overdue' | 'paid';
}

export interface Borrowed {
  id: string;
  person: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'overdue' | 'paid';
}