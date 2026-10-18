import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { useFinancialData } from '../../src/hooks/useFinancialData';
import { financialService } from '../../src/services/financialService';

export default function AnalyticsTabScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [categoryType, setCategoryType] = useState<'Expense' | 'Income'>('Expense');

  const { data: analyticsData } = useFinancialData(
    () => financialService.getDashboard(),
    isAuthenticated
  );

  const { data: transactionsData } = useFinancialData(
    () => financialService.listTransactions({ limit: '100' }),
    isAuthenticated
  );

  const now = new Date();
  const currentMonthName = now.toLocaleString('en-US', { month: 'long' });

  // Live metrics
  const totalIncome = Number(analyticsData?.summary?.totalIncome || 0);
  const totalExpenses = Number(analyticsData?.summary?.totalExpenses || 0);
  const netSavings = Number(analyticsData?.summary?.netSavings || 0);
  const avgDailySpend = analyticsData?.dailyBurnRate ? Math.round(analyticsData.dailyBurnRate) : 0;
  const savingsRate = Number(analyticsData?.summary?.savingsRate || 0);

  // Month-over-month comparisons from backend
  const momIncomeChange = analyticsData?.monthOverMonth?.incomeChangePercent ?? null;
  const momExpenseChange = analyticsData?.monthOverMonth?.expenseChangePercent ?? null;

  // Real category breakdown
  const rawCategories: any[] = analyticsData?.categoryBreakdown || [];
  const categories = useMemo(() => {
    if (categoryType === 'Expense') {
      return rawCategories.filter((c: any) => c.category !== 'Salary' && c.category !== 'Refund');
    }
    // Income categories
    const txs: any[] = Array.isArray(transactionsData?.transactions)
      ? transactionsData.transactions
      : (Array.isArray(transactionsData) ? transactionsData : []);
    const incomeTxs = txs.filter((t: any) => t.type === 'income');
    const catMap = new Map<string, { amount: number; count: number }>();
    for (const t of incomeTxs) {
      const cat = t.category || 'Income';
      const prev = catMap.get(cat) || { amount: 0, count: 0 };
      catMap.set(cat, { amount: prev.amount + Number(t.amount || 0), count: prev.count + 1 });
    }
    return Array.from(catMap.entries()).map(([cat, val]) => ({
      category: cat,
      amount: val.amount,
      transactionCount: val.count,
      percentage: totalIncome > 0 ? Math.round((val.amount / totalIncome) * 100) : 100,
    }));
  }, [rawCategories, categoryType, transactionsData, totalIncome]);

  // Payment rails breakdown computed from actual transactions
  const railsBreakdown = useMemo(() => {
    const txs: any[] = Array.isArray(transactionsData?.transactions)
      ? transactionsData.transactions
      : (Array.isArray(transactionsData) ? transactionsData : []);
    if (txs.length === 0) return [];

    const railMap = new Map<string, { amount: number; count: number }>();
    let totalAmt = 0;
    for (const t of txs) {
      const rail = t.paymentRail || 'UPI / App';
      const amt = Number(t.amount || 0);
      totalAmt += amt;
      const prev = railMap.get(rail) || { amount: 0, count: 0 };
      railMap.set(rail, { amount: prev.amount + amt, count: prev.count + 1 });
    }

    return Array.from(railMap.entries()).map(([rail, val]) => ({
      name: rail,
      amount: val.amount,
      count: val.count,
      percent: totalAmt > 0 ? Math.round((val.amount / totalAmt) * 100) : 0,
    }));
  }, [transactionsData]);

  // Historical months from backend dashboard history
  const monthlyHistory: any[] = analyticsData?.monthlyHistory || [];
  const maxHistoryAmt = useMemo(() => {
    if (monthlyHistory.length === 0) return 10000;
    return Math.max(...monthlyHistory.map((m: any) => Math.max(m.income || 0, m.expense || 0)), 10000);
  }, [monthlyHistory]);

  const hasData = totalIncome > 0 || totalExpenses > 0 || rawCategories.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <Text style={styles.screenTitle}>Analytics</Text>

        {/* 1. Bar Chart Comparison Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>{currentMonthName} Cash Flow</Text>
          <View style={styles.metricsRow}>
            {/* Money In */}
            <View style={styles.metricColumn}>
              <View style={styles.metricHeaderRow}>
                <Ionicons name="arrow-down" size={13} color="#157A4F" style={{ marginRight: 4 }} />
                <Text style={styles.metricLabel}>Money In</Text>
              </View>
              <Text style={[styles.metricValue, { color: '#157A4F' }]}>+₹{totalIncome.toLocaleString('en-IN')}</Text>
              <Text style={styles.metricSubtext}>
                {momIncomeChange !== null ? `${momIncomeChange >= 0 ? '+' : ''}${momIncomeChange}% vs last mo` : 'Current period'}
              </Text>
            </View>

            <View style={styles.metricVerticalDivider} />

            {/* Money Out */}
            <View style={styles.metricColumn}>
              <View style={styles.metricHeaderRow}>
                <Ionicons name="arrow-up" size={13} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={styles.metricLabel}>Money Out</Text>
              </View>
              <Text style={[styles.metricValue, { color: '#DC2626' }]}>−₹{totalExpenses.toLocaleString('en-IN')}</Text>
              <Text style={styles.metricSubtext}>
                {momExpenseChange !== null ? `${momExpenseChange >= 0 ? '+' : ''}${momExpenseChange}% vs last mo` : 'Current period'}
              </Text>
            </View>

            <View style={styles.metricVerticalDivider} />

            {/* Savings Rate */}
            <View style={styles.metricColumn}>
              <View style={styles.metricHeaderRow}>
                <Ionicons name="pie-chart-outline" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                <Text style={styles.metricLabel}>Savings</Text>
              </View>
              <Text style={styles.metricValue}>{savingsRate}%</Text>
              <Text style={styles.metricSubtext}>Net ₹{netSavings.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Dynamic History Bars */}
          {monthlyHistory.length > 0 ? (
            <View style={{ marginTop: 20 }}>
              <View style={styles.chartArea}>
                <View style={styles.barsContainer}>
                  {monthlyHistory.slice(-4).map((m: any, idx: number) => {
                    const inHeight = Math.min(110, Math.max(8, Math.round(((m.income || 0) / maxHistoryAmt) * 110)));
                    const outHeight = Math.min(110, Math.max(8, Math.round(((m.expense || 0) / maxHistoryAmt) * 110)));
                    return (
                      <View key={m.month || idx} style={styles.monthBarGroup}>
                        <View style={styles.barsRow}>
                          <View style={[styles.barColumn, { height: inHeight, backgroundColor: '#157A4F' }]} />
                          <View style={[styles.barColumn, { height: outHeight, backgroundColor: '#DC2626' }]} />
                        </View>
                        <Text style={styles.monthGroupLabel}>{m.month?.slice(5) || 'Mo'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#157A4F' }]} />
                  <Text style={styles.legendText}>Income</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
                  <Text style={styles.legendText}>Expenses</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Average Daily Spend Highlight Chip */}
          {avgDailySpend > 0 ? (
            <View style={styles.avgDailyChip}>
              <Text style={styles.avgDailyText}>Your avg. daily spend is ₹{avgDailySpend.toLocaleString('en-IN')} in {currentMonthName}</Text>
            </View>
          ) : null}
        </View>

        {/* 2. Top Categories Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
        </View>

        {/* Expense / Income Segmented Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.toggleBtn, categoryType === 'Expense' && styles.toggleBtnActive]}
            onPress={() => setCategoryType('Expense')}
          >
            <Text style={[styles.toggleText, categoryType === 'Expense' && styles.toggleTextActive]}>
              Expense
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.toggleBtn, categoryType === 'Income' && styles.toggleBtnActive]}
            onPress={() => setCategoryType('Income')}
          >
            <Text style={[styles.toggleText, categoryType === 'Income' && styles.toggleTextActive]}>
              Income
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category Budget Cards */}
        <View style={styles.card}>
          {categories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="pie-chart-outline" size={30} color="#94A3B8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No {categoryType.toLowerCase()} data yet</Text>
              <Text style={styles.emptySubtitle}>Transactions you record will be categorized and analyzed here</Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push('/add-transaction')}
              >
                <Text style={styles.actionBtnText}>+ Add Transaction</Text>
              </TouchableOpacity>
            </View>
          ) : (
            categories.slice(0, 6).map((cat: any, index: number) => {
              const pct = Number(cat.percentage || 0);
              const isOver = pct > 100;
              const barColor = categoryType === 'Income' ? '#157A4F' : (isOver ? '#DC2626' : '#2563EB');
              return (
                <View key={cat.category || index}>
                  <View style={styles.categoryItem}>
                    <View style={styles.categoryTitleRow}>
                      <Text style={styles.categoryName}>
                        {cat.category} {cat.transactionCount ? <Text style={styles.txCount}>• {cat.transactionCount} txns</Text> : null}
                      </Text>
                      <Text style={styles.categoryAmount}>₹{Number(cat.amount).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(4, pct))}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={styles.categoryBudgetFoot}>
                      {pct}% of total {categoryType.toLowerCase()}s
                    </Text>
                  </View>
                  {index < Math.min(categories.length, 6) - 1 && <View style={styles.cardDivider} />}
                </View>
              );
            })
          )}
        </View>

        {/* 3. Payment Rails Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Payment Rails & Channels</Text>
        </View>

        <View style={[styles.card, { marginBottom: 30 }]}>
          {railsBreakdown.length === 0 ? (
            <View style={styles.emptyBox}>
              <Feather name="credit-card" size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No payment channel records</Text>
              <Text style={styles.emptySubtitle}>See breakdown between UPI, Credit Cards, Net Banking, and Cash</Text>
            </View>
          ) : (
            railsBreakdown.map((rail, index) => (
              <View key={rail.name}>
                <View style={styles.railItem}>
                  <View style={styles.railAvatar}>
                    <Text style={styles.railAvatarLetter}>{rail.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.railDetails}>
                    <Text style={styles.railName}>{rail.name}</Text>
                    <Text style={styles.railTxCount}>{rail.count} Transactions</Text>
                  </View>
                  <View style={styles.railAmountBlock}>
                    <Text style={styles.railAmountText}>₹{rail.amount.toLocaleString('en-IN')}</Text>
                    <Text style={styles.railPercentText}>{rail.percent}%</Text>
                  </View>
                </View>
                {index < railsBreakdown.length - 1 && <View style={styles.cardDivider} />}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  metricSubtext: {
    fontSize: 10,
    color: '#94A3B8',
  },
  metricVerticalDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#F1F5F9',
  },
  chartArea: {
    height: 130,
    justifyContent: 'flex-end',
    paddingTop: 10,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 110,
  },
  monthBarGroup: {
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginBottom: 6,
  },
  barColumn: {
    width: 14,
    borderRadius: 4,
  },
  monthGroupLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  avgDailyChip: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avgDailyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  sectionHeaderRow: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  toggleTextActive: {
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryItem: {
    paddingVertical: 4,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  txCount: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
  },
  categoryAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryBudgetFoot: {
    fontSize: 10,
    color: '#64748B',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  railAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  railAvatarLetter: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  railDetails: {
    flex: 1,
  },
  railName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  railTxCount: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  railAmountBlock: {
    alignItems: 'flex-end',
  },
  railAmountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  railPercentText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 240,
  },
  actionBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
