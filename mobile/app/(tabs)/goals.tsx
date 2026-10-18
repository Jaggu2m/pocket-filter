import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { useFinancialData } from '../../src/hooks/useFinancialData';
import { financialService } from '../../src/services/financialService';

export default function GoalsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // State for Add EMI modal
  const [showAddEmiModal, setShowAddEmiModal] = useState(false);
  const [emiName, setEmiName] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [emiDueDate, setEmiDueDate] = useState('');
  const [emiCategory, setEmiCategory] = useState('Loan / EMI');
  const [isSubmittingEmi, setIsSubmittingEmi] = useState(false);
  const [emiError, setEmiError] = useState('');

  // Live goals data from backend API
  const { data: apiGoalsData, reload: reloadGoals } = useFinancialData(
    () => financialService.listGoals(),
    isAuthenticated
  );

  // Live recurring payments (EMIs)
  const { data: recurringData, reload: reloadRecurring } = useFinancialData(
    () => financialService.listRecurringPayments(),
    isAuthenticated
  );

  // Live accounts for emergency fund liquidity calculation
  const { data: accountsData } = useFinancialData(
    () => financialService.listAccounts(),
    isAuthenticated
  );

  // Live transactions to display real lent/borrowed entries
  const { data: txData } = useFinancialData(
    () => financialService.listTransactions({ limit: '50' }),
    isAuthenticated
  );

  const goalList = useMemo(() => {
    const raw = apiGoalsData?.goals || apiGoalsData;
    if (Array.isArray(raw)) {
      return raw.map((g: any, i: number) => {
        const saved = parseFloat(g.currentAmount || g.savedAmount || 0);
        const target = parseFloat(g.targetAmount || 1);
        const pct = Math.min(100, Math.round((saved / target) * 100));
        const dateStr = g.targetDate
          ? new Date(g.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
          : 'Ongoing';
        return {
          id: g.id,
          tag: i < 2 ? 'PRIORITY' : 'LONG-TERM',
          name: g.name,
          saved,
          target,
          pct,
          date: dateStr,
        };
      });
    }
    return [];
  }, [apiGoalsData]);

  const emiList = useMemo(() => {
    const raw = recurringData?.recurringPayments || recurringData?.payments || recurringData;
    if (Array.isArray(raw)) {
      return raw.map((r: any) => {
        const amt = parseFloat(r.averageAmount || r.amount || 0);
        const nextDate = r.nextExpectedDate
          ? new Date(r.nextExpectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : 'Due monthly';
        return {
          id: r.id,
          name: r.merchantName || r.merchant || r.name || 'Recurring EMI',
          monthlyAmount: `₹${amt.toLocaleString('en-IN')}/mo`,
          progressPct: '100%',
          subtitle: `Next: ${nextDate}`,
          rate: r.status || 'Active',
          rawAmount: amt,
        };
      });
    }
    return [];
  }, [recurringData]);

  // Emergency Fund calculation based on actual goal or liquid accounts
  const emergencyFund = useMemo(() => {
    const rawGoals = apiGoalsData?.goals || apiGoalsData;
    const efGoal = Array.isArray(rawGoals)
      ? rawGoals.find((g: any) => g.name?.toLowerCase().includes('emergency'))
      : null;

    if (efGoal) {
      const saved = Number(efGoal.currentAmount || efGoal.savedAmount || 0);
      const target = Number(efGoal.targetAmount || 1);
      const pct = Math.min(100, Math.round((saved / target) * 100));
      return {
        exists: true,
        saved,
        target,
        pct,
        monthsHero: (saved / 30000).toFixed(1),
      };
    }

    // Fallback: check total liquid balances from bank accounts
    const accountList = Array.isArray(accountsData) ? accountsData : [];
    const liquidTotal = accountList
      .filter((a: any) => a.type === 'bank' || a.type === 'cash')
      .reduce((s: number, a: any) => s + Number(a.balance || 0), 0);

    return {
      exists: false,
      saved: liquidTotal,
      target: 100000,
      pct: Math.min(100, Math.round((liquidTotal / 100000) * 100)),
      monthsHero: liquidTotal > 0 ? (liquidTotal / 30000).toFixed(1) : '0',
    };
  }, [apiGoalsData, accountsData]);

  // Real Lent & Borrowed entries from transactions
  const ledgerEntries = useMemo(() => {
    const txs: any[] = txData?.transactions || (Array.isArray(txData) ? txData : []);
    return txs.filter((t: any) => t.category === 'Money Lent' || t.category === 'Money Borrowed').slice(0, 5);
  }, [txData]);

  const handleAddEmi = async () => {
    const numAmount = parseFloat(emiAmount);
    if (!emiName.trim()) {
      setEmiError('Please enter loan or EMI name');
      return;
    }
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      setEmiError('Please enter a valid monthly amount');
      return;
    }
    setEmiError('');
    setIsSubmittingEmi(true);
    try {
      await financialService.createRecurringPayment({
        merchantName: emiName.trim(),
        amount: numAmount,
        frequency: 'MONTHLY',
        category: emiCategory,
        nextExpectedDate: emiDueDate || undefined,
      });
      setShowAddEmiModal(false);
      setEmiName('');
      setEmiAmount('');
      setEmiDueDate('');
      reloadRecurring();
    } catch (e: any) {
      setEmiError(e?.message || 'Failed to add EMI');
    } finally {
      setIsSubmittingEmi(false);
    }
  };

  const handleDeleteEmi = (id: string, name: string) => {
    Alert.alert('Remove EMI', `Are you sure you want to remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await financialService.deleteRecurringPayment(id);
            reloadRecurring();
          } catch {
            Alert.alert('Error', 'Failed to remove EMI');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <Text style={styles.screenTitle}>Goals & Commitments</Text>

        {/* 1. Emergency Fund Card */}
        <View style={styles.card}>
          <View style={styles.emergencyHeaderRow}>
            <View style={styles.emergencyTitleWrap}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#15803D" style={{ marginRight: 6 }} />
              <Text style={styles.emergencyTitle}>Emergency fund</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/create-goal')}>
              <Text style={styles.addNewAction}>{emergencyFund.exists ? 'Edit' : '+ Setup Goal'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.emergencyStatsRow}>
            <View>
              <Text style={styles.emergencyMonthsHero}>
                {emergencyFund.monthsHero} <Text style={styles.emergencyMonthsUnit}>months</Text>
              </Text>
              <Text style={styles.emergencySubtitle}>of living expenses protected</Text>
            </View>
            <View style={styles.emergencyTargetBlock}>
              <Text style={styles.emergencyAmountText}>
                ₹{emergencyFund.saved.toLocaleString('en-IN')} / ₹{emergencyFund.target.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.emergencyTargetLabel}>
                {emergencyFund.exists ? `${emergencyFund.pct}% funded` : 'Target: ₹1,00,000'}
              </Text>
            </View>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${emergencyFund.pct}%` }]} />
          </View>
        </View>

        {/* 2. Goals Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Goals</Text>
          <TouchableOpacity onPress={() => router.push('/create-goal')}>
            <Text style={styles.addNewAction}>+ Add Goal</Text>
          </TouchableOpacity>
        </View>

        {/* Goals Grid / Empty State */}
        {goalList.length === 0 ? (
          <View style={[styles.card, styles.emptyBox]}>
            <MaterialCommunityIcons name="target" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>No savings goals yet</Text>
            <Text style={styles.emptySubtitle}>Track progress towards your dream trip, gadget, or long-term fund</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/create-goal')}
            >
              <Text style={styles.actionButtonText}>+ Create Your First Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.goalGrid}>
            {goalList.map((g) => (
              <TouchableOpacity
                key={g.id}
                activeOpacity={0.8}
                style={styles.gridCard}
                onPress={() => router.push(`/goal-details?id=${g.id}`)}
              >
                <Text style={styles.goalTag}>{g.tag}</Text>
                <Text style={styles.gridGoalName} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.gridGoalAmounts}>
                  ₹{g.saved.toLocaleString('en-IN')} of ₹{g.target.toLocaleString('en-IN')}
                </Text>
                <View style={styles.gridProgressBarTrack}>
                  <View style={[styles.gridProgressBarFill, { width: `${g.pct}%` }]} />
                </View>
                <View style={styles.gridCardFooter}>
                  <Text style={styles.gridFooterText}>{g.pct}%</Text>
                  <Text style={styles.gridFooterText}>{g.date}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 3. Active EMIs Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Active EMIs & Commitments</Text>
          <TouchableOpacity onPress={() => setShowAddEmiModal(true)}>
            <Text style={styles.addNewAction}>+ Add EMI</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {emiList.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="card-outline" size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No active EMIs or loans</Text>
              <Text style={styles.emptySubtitle}>Add your monthly loan installments, vehicle or gadget EMIs</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowAddEmiModal(true)}
              >
                <Text style={styles.actionButtonText}>+ Add Loan / EMI</Text>
              </TouchableOpacity>
            </View>
          ) : (
            emiList.map((emi, index) => (
              <View key={emi.id}>
                <View style={styles.emiItem}>
                  <View style={styles.emiTitleRow}>
                    <Text style={styles.emiName}>{emi.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.emiMonthlyAmount}>{emi.monthlyAmount}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteEmi(emi.id, emi.name)}
                        style={{ padding: 4 }}
                      >
                        <Feather name="trash-2" size={14} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: '100%', backgroundColor: '#4F46E5' }]} />
                  </View>
                  <View style={styles.emiFooterRow}>
                    <Text style={styles.emiSubtitle}>{emi.subtitle}</Text>
                    <Text style={styles.emiRate}>{emi.rate}</Text>
                  </View>
                </View>
                {index < emiList.length - 1 && <View style={styles.cardDivider} />}
              </View>
            ))
          )}
        </View>

        {/* 4. Lent & borrowed Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Lent & Borrowed Ledger</Text>
          <TouchableOpacity onPress={() => router.push('/lent')}>
            <Text style={styles.addNewAction}>+ Open Ledger</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {ledgerEntries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Feather name="book-open" size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No ledger records</Text>
              <Text style={styles.emptySubtitle}>Track money you lent to friends or borrowed from others</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#15803D' }]}
                  onPress={() => router.push('/lent')}
                >
                  <Text style={styles.actionButtonText}>+ Money Lent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#B91C1C' }]}
                  onPress={() => router.push('/borrowed')}
                >
                  <Text style={styles.actionButtonText}>− Borrowed</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            ledgerEntries.map((entry, index) => {
              const isLent = entry.category === 'Money Lent';
              const name = entry.merchant || entry.description || 'Contact';
              return (
                <View key={entry.id || index}>
                  <View style={styles.lentRow}>
                    <View style={[styles.avatarLetter, { backgroundColor: isLent ? '#DCFCE7' : '#FEE2E2' }]}>
                      <Text style={[styles.avatarLetterText, { color: isLent ? '#15803D' : '#DC2626' }]}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.lentDetails}>
                      <Text style={styles.contactName}>{name}</Text>
                      <Text style={styles.lentSubtitle}>
                        {isLent ? 'Lent out' : 'Borrowed'} • {entry.date ? new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recorded'}
                      </Text>
                    </View>
                    <View style={styles.lentAmountBlock}>
                      <Text style={isLent ? styles.lentAmountGreen : styles.borrowedAmountRed}>
                        {isLent ? `+₹${Number(entry.amount).toLocaleString('en-IN')}` : `−₹${Number(entry.amount).toLocaleString('en-IN')}`}
                      </Text>
                      <Text style={styles.pendingText}>Active</Text>
                    </View>
                  </View>
                  {index < ledgerEntries.length - 1 && <View style={styles.cardDivider} />}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Add EMI Modal */}
      <Modal
        visible={showAddEmiModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddEmiModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Loan / EMI</Text>
              <TouchableOpacity onPress={() => setShowAddEmiModal(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {emiError ? <Text style={styles.errorText}>{emiError}</Text> : null}

            <Text style={styles.inputLabel}>Name / Lender</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Car Loan (HDFC) or iPhone EMI"
              placeholderTextColor="#94A3B8"
              value={emiName}
              onChangeText={setEmiName}
            />

            <Text style={styles.inputLabel}>Monthly Amount (₹)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 5500"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={emiAmount}
              onChangeText={setEmiAmount}
            />

            <Text style={styles.inputLabel}>Next Due Date (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="YYYY-MM-DD (e.g. 2026-11-05)"
              placeholderTextColor="#94A3B8"
              value={emiDueDate}
              onChangeText={setEmiDueDate}
            />

            <TouchableOpacity
              style={[styles.saveEmiBtn, isSubmittingEmi && { opacity: 0.7 }]}
              onPress={handleAddEmi}
              disabled={isSubmittingEmi}
            >
              {isSubmittingEmi ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveEmiBtnText}>Save EMI Commitment</Text>
              )}
            </TouchableOpacity>
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
  emergencyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emergencyTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emergencyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  emergencyMonthsHero: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  emergencyMonthsUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  emergencySubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  emergencyTargetBlock: {
    alignItems: 'flex-end',
  },
  emergencyAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  emergencyTargetLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  addNewAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#157A4F',
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  goalTag: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gridGoalName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  gridGoalAmounts: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  gridProgressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  gridProgressBarFill: {
    height: '100%',
    backgroundColor: '#157A4F',
    borderRadius: 3,
  },
  gridCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridFooterText: {
    fontSize: 10,
    color: '#64748B',
  },
  emiItem: {
    paddingVertical: 4,
  },
  emiTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emiName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  emiMonthlyAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  emiFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  emiSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  emiRate: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  lentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarLetterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lentDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  lentSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  lentAmountBlock: {
    alignItems: 'flex-end',
  },
  lentAmountGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  borrowedAmountRed: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  pendingText: {
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
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 260,
  },
  actionButton: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  saveEmiBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveEmiBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    marginBottom: 8,
  },
});