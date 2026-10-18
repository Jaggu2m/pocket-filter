import {
  Transaction,
  Goal,
  Budget,
  FinancialSummary,
  Emi,
  Lent,
  Borrowed,
} from '../types/financial';

export const mockFinancialSummary: FinancialSummary = {
  availableBalance: 90000,
  spendingCapacityPerDay: 1850,
  monthlyIncome: 60000,
  monthlyExpenses: 32400,
  monthlySavings: 27600,
  emergencyReserve: 40000,
  goalCommitments: 15000,
  upcomingBills: 8000,
};

export const mockTransactions: Transaction[] = [
  { id: 't1', type: 'expense', amount: 420, category: 'Food', description: 'Swiggy', date: '2026-10-14', accountId: 'a1' },
  { id: 't2', type: 'expense', amount: 240, category: 'Transport', description: 'Uber', date: '2026-10-14', accountId: 'a1' },
  { id: 't3', type: 'expense', amount: 1299, category: 'Shopping', description: 'Amazon', date: '2026-10-13', accountId: 'a1' },
  { id: 't4', type: 'income', amount: 60000, category: 'Salary', description: 'Salary', date: '2026-10-01', accountId: 'a1' },
];

export const mockGoals: Goal[] = [
  { id: 'g1', name: 'Kashmir Trip', targetAmount: 60000, savedAmount: 30000, targetDate: '2026-12-31', status: 'active', priority: 1 },
  { id: 'g2', name: 'Emergency Fund', targetAmount: 100000, savedAmount: 70000, targetDate: '2027-06-30', status: 'active', priority: 2 },
  { id: 'g3', name: 'Laptop', targetAmount: 80000, savedAmount: 40000, targetDate: '2026-11-30', status: 'active', priority: 3 },
];

export const mockBudget: Budget = {
  month: '2026-10',
  overallLimit: 40000,
  spent: 27400,
  categories: [
    { category: 'Food', limit: 7000, spent: 5800 },
    { category: 'Transport', limit: 4000, spent: 2100 },
    { category: 'Shopping', limit: 5000, spent: 7200 },
  ],
};

export const mockEmis: Emi[] = [
  { id: 'e1', name: 'Laptop EMI', monthlyAmount: 4200, monthsRemaining: 8, nextPaymentDate: '2026-10-28', totalRemainingDebt: 33600 },
  { id: 'e2', name: 'Phone EMI', monthlyAmount: 2800, monthsRemaining: 5, nextPaymentDate: '2026-10-15', totalRemainingDebt: 14000 },
];

export const mockLent: Lent[] = [
  { id: 'l1', person: 'Rahul', amount: 8000, dueDate: '2026-10-25', status: 'pending' },
];

export const mockBorrowed: Borrowed[] = [
  { id: 'b1', person: 'Amit', amount: 24000, dueDate: '2026-11-10', status: 'pending' },
];