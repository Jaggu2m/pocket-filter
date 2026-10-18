import React, { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Card } from '../src/components/ui/Card';
import { useAuth } from '../src/context/AuthContext';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function SpendingCapacityScreen() {
  const { isAuthenticated } = useAuth();
  const fetchAccounts = useCallback(() => financialService.listAccounts(), []);
  const fetchGoals = useCallback(() => financialService.listGoals(), []);
  const fetchRecurring = useCallback(() => financialService.listRecurringPayments(), []);
  const accounts = useFinancialData(fetchAccounts, isAuthenticated);
  const goals = useFinancialData(fetchGoals, isAuthenticated);
  const recurring = useFinancialData(fetchRecurring, isAuthenticated);

  if ((accounts.isLoading || goals.isLoading || recurring.isLoading) && isAuthenticated) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  const accountList: any[] = Array.isArray(accounts.data) ? accounts.data : (accounts.data?.accounts || []);
  const availableBalance = accountList.reduce(
    (sum: number, a: any) => sum + (a.type !== 'credit_card' ? Number(a.balance || 0) : 0),
    0
  );

  const goalList: any[] = Array.isArray(goals.data) ? goals.data : (goals.data?.goals || []);
  const goalCommitments = goalList.reduce((sum: number, g: any) => {
    const saved = Number(g.currentAmount || g.savedAmount || 0);
    const target = Number(g.targetAmount || 0);
    const rem = Math.max(0, target - saved);
    return sum + (rem > 0 ? rem / 12 : 0);
  }, 0);

  const emergencyGoal = goalList.find((g: any) => g.name?.toLowerCase().includes('emergency'));
  const emergencyReserve = emergencyGoal ? Number(emergencyGoal.targetAmount || emergencyGoal.savedAmount || 0) : 0;

  const recurringList: any[] = Array.isArray(recurring.data)
    ? recurring.data
    : (recurring.data?.recurringPayments || recurring.data?.payments || []);
  const upcomingBills = recurringList.reduce((sum: number, r: any) => sum + Number(r.averageAmount || r.amount || 0), 0);

  const remaining = Math.max(0, availableBalance - emergencyReserve - goalCommitments - upcomingBills);
  const perDay = Math.max(0, Math.round(remaining / 30));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Spending Capacity</Text>
      <Card>
        <Text style={styles.hero}>₹{perDay.toLocaleString('en-IN')}</Text>
        <Text style={styles.muted}>Safe daily spending</Text>
      </Card>
      <Card>
        <View style={styles.row}><Text style={styles.label}>Available liquidity</Text><Text style={styles.value}>₹{Math.round(availableBalance).toLocaleString('en-IN')}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Emergency reserve</Text><Text style={styles.value}>₹{Math.round(emergencyReserve).toLocaleString('en-IN')}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Goal commitments</Text><Text style={styles.value}>₹{Math.round(goalCommitments).toLocaleString('en-IN')}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Upcoming bills</Text><Text style={styles.value}>₹{Math.round(upcomingBills).toLocaleString('en-IN')}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Safe discretionary amount</Text><Text style={styles.value}>₹{Math.round(remaining).toLocaleString('en-IN')}</Text></View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  hero: { fontSize: Typography.display, fontWeight: '700', color: Colors.text },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: Spacing.xs },
  label: { color: Colors.textSecondary },
  value: { color: Colors.text, fontWeight: '600' },
});