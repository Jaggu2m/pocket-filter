import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { useFinancialData } from '../../src/hooks/useFinancialData';
import { financialService } from '../../src/services/financialService';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Unspecified balance adjustment modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustedBalance, setAdjustedBalance] = useState('');
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  // Live financial data
  const { data: dashboardData } = useFinancialData(
    () => financialService.getDashboard(),
    isAuthenticated
  );

  const { data: accountsData, reload: reloadAccounts } = useFinancialData(
    () => financialService.listAccounts(),
    isAuthenticated
  );

  const { data: accountSummaryData, reload: reloadSummary } = useFinancialData(
    () => financialService.getAccountSummary(),
    isAuthenticated
  );

  const { data: budgetData } = useFinancialData(
    () => financialService.getCurrentBudget(),
    isAuthenticated
  );

  const { data: apiGoalsData } = useFinancialData(
    () => financialService.listGoals(),
    isAuthenticated
  );

  const { data: notifData } = useFinancialData(
    () => financialService.getUnreadNotificationCount(),
    isAuthenticated
  );

  const displayName = user?.firstName
    || (user?.name ? user.name.split(' ')[0] : null)
    || user?.email?.split('@')[0]
    || 'there';

  // Current month context
  const now = new Date();
  const currentMonthName = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate());

  const unspecifiedBalance = useMemo(() => {
    return Number(accountSummaryData?.unspecifiedBalance) || 0;
  }, [accountSummaryData]);

  const totalLiquidBalance = useMemo(() => {
    if (accountSummaryData?.totalLiquidBalance !== undefined) {
      return accountSummaryData.totalLiquidBalance;
    }
    const accountsSum = Array.isArray(accountsData)
      ? accountsData
          .filter((a: any) => a.type === 'bank' || a.type === 'cash' || a.type === 'upi_wallet')
          .reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0)
      : 0;
    return accountsSum + unspecifiedBalance;
  }, [accountSummaryData, accountsData, unspecifiedBalance]);

  const unspecifiedPercent = useMemo(() => {
    if (totalLiquidBalance <= 0) return 0;
    return Math.round((unspecifiedBalance / totalLiquidBalance) * 100);
  }, [totalLiquidBalance, unspecifiedBalance]);

  // Available to spend
  const availableToSpend = useMemo(() => {
    if (budgetData?.remainingBudget !== undefined) return Math.max(0, budgetData.remainingBudget);
    if (dashboardData?.summary?.netSavings !== undefined && dashboardData.summary.netSavings > 0) {
      return Math.max(0, dashboardData.summary.netSavings);
    }
    if (totalLiquidBalance > 0) {
      return totalLiquidBalance;
    }
    return 0;
  }, [budgetData, dashboardData, totalLiquidBalance]);

  const dailySpendRate = useMemo(() => {
    if (dashboardData?.dailyBurnRate !== undefined) return Math.round(dashboardData.dailyBurnRate);
    if (availableToSpend > 0 && daysRemaining > 0) return Math.round(availableToSpend / daysRemaining);
    return 0;
  }, [dashboardData, availableToSpend, daysRemaining]);

  const bankAccounts = useMemo(() => {
    const list = Array.isArray(accountsData) ? accountsData.filter((a: any) => a.type === 'bank' || a.type === 'cash' || a.type === 'upi_wallet') : [];
    return list.map((a: any) => ({
      id: a.id,
      name: a.institutionName || a.name,
      mask: a.accountNumberLast4 ? `***${a.accountNumberLast4}` : (a.type === 'cash' ? 'Wallet' : 'Linked'),
      balance: Number(a.balance || 0),
      updated: 'Live',
      percent: totalLiquidBalance > 0 ? Math.round((Number(a.balance || 0) / totalLiquidBalance) * 100) : 0,
    }));
  }, [accountsData, totalLiquidBalance]);

  const creditCards = useMemo(() => {
    const list = Array.isArray(accountsData) ? accountsData.filter((a: any) => a.type === 'credit_card') : [];
    return list.map((c: any) => {
      const limit = Number(c.creditLimit || 0);
      const balance = Number(c.balance || 0);
      return {
        id: c.id,
        name: c.name || c.institutionName || 'Credit Card',
        available: Math.max(0, limit - balance),
        limit,
        due: balance,
        dueDate: 'Due this cycle',
      };
    });
  }, [accountsData]);

  const userGoals = useMemo(() => {
    const raw = apiGoalsData?.goals || apiGoalsData;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [apiGoalsData]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header: Avatar, Name Greeting & Theme Toggle */}
        <View style={styles.headerRow}>
          <View style={styles.greetingContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.avatarCircle}
              onPress={() => router.push('/profile')}
            >
              <Text style={styles.avatarEmoji}>😊</Text>
            </TouchableOpacity>
            <View style={styles.greetingTextContainer}>
              <Text style={styles.greetingTitle}>Hi {displayName}!</Text>
              <Text style={styles.greetingSubtitle}>You're all up to date 🎉</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.themeToggle}
              onPress={() => router.push('/notifications')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={18} color={Colors.text} />
              {Number(notifData) > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {Number(notifData) > 9 ? '9+' : notifData}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.themeToggle}
              onPress={() => setIsDarkMode(!isDarkMode)}
              activeOpacity={0.7}
            >
              <Ionicons name="moon-outline" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Copilot Search Bar with AI Badge */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.copilotSearch}
          onPress={() => router.push('/copilot')}
        >
          <View style={styles.copilotLeft}>
            <Ionicons name="sparkles-outline" size={17} color="#6366F1" />
            <Text style={styles.copilotPlaceholder}>Ask Copilot anything...</Text>
          </View>
          <View style={styles.betaBadge}>
            <Text style={styles.betaText}>AI</Text>
          </View>
        </TouchableOpacity>

        {/* Financial Insights & Monthly Review Shortcut */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.insightsBanner}
          onPress={() => router.push('/insights')}
        >
          <View style={styles.insightsBannerLeft}>
            <View style={styles.insightsBannerIconWrap}>
              <Ionicons name="bulb-outline" size={16} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightsBannerTitle}>{currentMonthName} Review & Insights</Text>
              <Text style={styles.insightsBannerSub}>Causal drivers & macro spending shifts</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={17} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Quick Feature Shortcuts */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/account-settings')}
          >
            <View style={[styles.quickActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <MaterialIcons name="account-balance" size={18} color="#2563EB" />
            </View>
            <Text style={styles.quickActionText}>Accounts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/statement-upload')}
          >
            <View style={[styles.quickActionIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="document-text-outline" size={18} color="#4F46E5" />
            </View>
            <Text style={styles.quickActionText}>Upload PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/lent')}
          >
            <View style={[styles.quickActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Feather name="book-open" size={17} color="#059669" />
            </View>
            <Text style={styles.quickActionText}>Ledger</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/recurring')}
          >
            <View style={[styles.quickActionIconWrap, { backgroundColor: '#FFFBEB' }]}>
              <Feather name="repeat" size={17} color="#D97706" />
            </View>
            <Text style={styles.quickActionText}>Recurring</Text>
          </TouchableOpacity>
        </View>

        {/* Budget Overview Card */}
        <View style={styles.card}>
          <View style={styles.budgetHeader}>
            <View>
              <View style={styles.budgetTitleRow}>
                <Text style={styles.budgetTitle}>{currentMonthName} Budget</Text>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={Colors.textMuted}
                  style={{ marginLeft: 4 }}
                />
              </View>
              <Text style={styles.budgetSubtitle}>
                {daysRemaining} days to go <Text style={{ color: '#D1D5DB' }}>•</Text>{' '}
                <Text style={styles.budgetDailySpend}>₹{dailySpendRate.toLocaleString('en-IN')} per day</Text>
              </Text>
            </View>
            <View style={styles.budgetAmountBlock}>
              <Text style={styles.budgetMainAmount}>₹{availableToSpend.toLocaleString('en-IN')}</Text>
              <Text style={styles.budgetAmountLabel}>Left to spend</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Savings Goal Progress */}
          {userGoals.length > 0 ? (
            userGoals.slice(0, 2).map((g: any, index: number) => {
              const saved = Number(g.currentAmount || g.savedAmount || 0);
              const target = Number(g.targetAmount || 1);
              const pct = Math.min(100, Math.round((saved / target) * 100));
              return (
                <View key={g.id || index} style={[styles.goalSection, index > 0 && { marginTop: 14 }]}>
                  <View style={styles.goalTitleRow}>
                    <Text style={styles.goalLabel}>{g.name || 'Goal'}</Text>
                    <TouchableOpacity onPress={() => router.push('/goals')}>
                      <Text style={styles.editAction}>View</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                  </View>
                  <View style={styles.goalFooterRow}>
                    <Text style={styles.goalAmounts}>₹{saved.toLocaleString('en-IN')} / ₹{target.toLocaleString('en-IN')}</Text>
                    <Text style={styles.goalPercent}>{pct}% Completed</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyGoalRow}>
              <Text style={styles.emptyGoalText}>No goals set up yet</Text>
              <TouchableOpacity onPress={() => router.push('/create-goal')}>
                <Text style={styles.createGoalLink}>+ Create a Goal</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.budgetCycle}>
            {budgetData ? `Budget cycle: 1 ${currentMonthName.slice(0, 3)} – ${daysInMonth} ${currentMonthName.slice(0, 3)}` : 'Set a monthly budget to unlock spending insights'}
          </Text>
        </View>

        {/* Can I afford this? Action Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.affordCard}
          onPress={() => router.push('/spending-capacity')}
        >
          <View style={styles.affordIconWrap}>
            <Ionicons name="calculator-outline" size={20} color="#4B5563" />
          </View>
          <View style={styles.affordTextWrap}>
            <Text style={styles.affordTitle}>Can I afford this?</Text>
            <Text style={styles.affordSubtitle}>Simulate a purchase before you buy</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Overall Money Balance Section */}
        <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View>
            <Text style={styles.sectionTitle}>Overall money balance</Text>
            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Across all tracked money sources</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/account-settings')}>
            <Text style={styles.manageLink}>+ Accounts</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.totalBalanceHero}>₹{totalLiquidBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              {bankAccounts.length > 0
                ? `Sum of ${bankAccounts.length} account${bankAccounts.length > 1 ? 's' : ''} + general balance`
                : 'Tracked general money balance (No bank account required)'}
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            {/* Explicitly Tracked Accounts */}
            {bankAccounts.map((acc) => (
              <View key={acc.id} style={styles.bankAccountRow}>
                <View style={styles.bankIconWrap}>
                  <MaterialIcons name="account-balance" size={18} color="#D32F2F" />
                </View>
                <View style={styles.bankDetails}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.bankName}>{acc.name} {acc.mask}</Text>
                    <View style={styles.trackedBadge}>
                      <Text style={styles.trackedBadgeText}>Account</Text>
                    </View>
                  </View>
                  <View style={styles.updatedDotRow}>
                    <View style={styles.greenLiveDot} />
                    <Text style={styles.updatedText}>{acc.updated}</Text>
                  </View>
                </View>
                <View style={styles.bankAmountBlock}>
                  <Text style={styles.bankAmountText}>₹{acc.balance.toLocaleString('en-IN')}</Text>
                  <Text style={styles.bankPercentText}>{acc.percent}%</Text>
                </View>
              </View>
            ))}

            {/* Unspecified Balance (Virtual Money Source) */}
            <View style={styles.bankAccountRow}>
              <View style={[styles.bankIconWrap, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="wallet-outline" size={18} color="#475569" />
              </View>
              <View style={styles.bankDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.bankName}>Unspecified Balance</Text>
                  <View style={[styles.trackedBadge, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={[styles.trackedBadgeText, { color: '#475569' }]}>General</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setAdjustedBalance(String(unspecifiedBalance));
                    setShowAdjustModal(true);
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#3B82F6', fontWeight: '500' }}>
                    No account assigned • <Text style={{ textDecorationLine: 'underline' }}>Adjust</Text>
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bankAmountBlock}>
                <Text style={styles.bankAmountText}>₹{unspecifiedBalance.toLocaleString('en-IN')}</Text>
                <Text style={styles.bankPercentText}>{unspecifiedPercent}%</Text>
              </View>
            </View>

            {bankAccounts.length === 0 && (
              <TouchableOpacity
                style={[styles.addAccountBtn, { marginTop: 6, alignSelf: 'flex-start' }]}
                onPress={() => router.push('/account-settings')}
              >
                <Ionicons name="add-circle-outline" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={[styles.addAccountBtnText, { fontSize: 11 }]}>Add Bank Account (Optional)</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Credit cards Section */}
        <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={styles.sectionTitle}>Credit cards</Text>
          <TouchableOpacity onPress={() => router.push('/account-settings')}>
            <Text style={styles.manageLink}>+ Manage</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.card, { marginBottom: 30 }]}>
          {creditCards.length === 0 ? (
            <View style={styles.emptyAccountBox}>
              <Text style={styles.emptyAccountTitle}>No credit cards added</Text>
              <Text style={styles.emptyAccountSubtitle}>Track your credit card limits, bill due dates, and spends</Text>
              <TouchableOpacity
                style={styles.addAccountBtn}
                onPress={() => router.push('/account-settings')}
              >
                <Ionicons name="card-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.addAccountBtnText}>Add Credit Card</Text>
              </TouchableOpacity>
            </View>
          ) : (
            creditCards.map((card) => (
              <View key={card.id} style={styles.bankAccountRow}>
                <View style={[styles.bankIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <FontAwesome5 name="credit-card" size={16} color="#2563EB" />
                </View>
                <View style={styles.bankDetails}>
                  <Text style={styles.bankName}>{card.name}</Text>
                  <Text style={styles.updatedText}>
                    Available: ₹{card.available.toLocaleString('en-IN')} / Limit ₹{card.limit.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.bankAmountBlock}>
                  <Text style={[styles.bankAmountText, { color: Colors.danger }]}>
                    ₹{card.due.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.bankPercentText}>{card.dueDate}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal to adjust Unspecified / General Balance */}
      <Modal
        visible={showAdjustModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdjustModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set General Balance</Text>
            <Text style={styles.modalSubtitle}>
              Update your starting or unassigned money balance. Any expenses or income recorded without selecting a specific bank account will adjust this balance.
            </Text>
            <View style={styles.modalInputWrap}>
              <Text style={styles.modalCurrency}>₹</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="decimal-pad"
                value={adjustedBalance}
                onChangeText={setAdjustedBalance}
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAdjustModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={isSavingBalance}
                onPress={async () => {
                  const val = parseFloat(adjustedBalance);
                  if (isNaN(val)) return;
                  setIsSavingBalance(true);
                  try {
                    await financialService.updateUnspecifiedBalance(val);
                    await Promise.all([reloadSummary(), reloadAccounts()]);
                    setShowAdjustModal(false);
                  } catch (e) {
                    console.warn(e);
                  } finally {
                    setIsSavingBalance(false);
                  }
                }}
              >
                <Text style={styles.modalSaveText}>{isSavingBalance ? 'Saving...' : 'Save Balance'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  greetingTextContainer: {},
  greetingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  greetingSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  themeToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  insightsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  insightsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  insightsBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightsBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  insightsBannerSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 1,
  },
  copilotSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  copilotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copilotPlaceholder: {
    marginLeft: 8,
    fontSize: 14,
    color: '#64748B',
  },
  betaBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  betaText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  budgetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  budgetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  budgetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  budgetDailySpend: {
    fontWeight: '700',
    color: '#0F172A',
  },
  budgetAmountBlock: {
    alignItems: 'flex-end',
  },
  budgetMainAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  budgetAmountLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  goalSection: {},
  goalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  goalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  editAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#157A4F',
    borderRadius: 4,
  },
  goalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  goalAmounts: {
    fontSize: 11,
    color: '#64748B',
  },
  goalPercent: {
    fontSize: 11,
    color: '#64748B',
  },
  budgetCycle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 14,
  },
  affordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 16,
  },
  affordIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  affordTextWrap: {
    flex: 1,
  },
  affordTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  affordSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  totalBalanceHero: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  bankAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  bankIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  bankDetails: {
    flex: 1,
  },
  bankName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  updatedDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  greenLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
    marginRight: 5,
  },
  updatedText: {
    fontSize: 11,
    color: '#64748B',
  },
  bankAmountBlock: {
    alignItems: 'flex-end',
  },
  bankAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  bankPercentText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
  },
  manageLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  emptyAccountBox: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyAccountTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptyAccountSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addAccountBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyGoalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  emptyGoalText: {
    fontSize: 12,
    color: '#64748B',
  },
  createGoalLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  trackedBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  trackedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 16,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    height: 48,
    marginBottom: 18,
  },
  modalCurrency: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 6,
  },
  modalInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});