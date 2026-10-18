import React, { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Card } from '../src/components/ui/Card';
import { useAuth } from '../src/context/AuthContext';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function AnalyticsScreen() {
  const { isAuthenticated } = useAuth();
  const fetchDashboard = useCallback(() => financialService.getDashboard(), []);
  const dashboard = useFinancialData(fetchDashboard, isAuthenticated);
  const data: any = dashboard.data;
  if (dashboard.isLoading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Analytics</Text>
      <Card><Text style={styles.section}>Overview</Text><Text style={styles.muted}>Income ₹{Number(data?.totalIncome || 0).toLocaleString('en-IN')}</Text><Text style={styles.muted}>Expenses ₹{Number(data?.totalExpenses || 0).toLocaleString('en-IN')}</Text><Text style={styles.muted}>Savings rate {data?.savingsRate || 0}%</Text></Card>
      <Card><Text style={styles.section}>Top categories</Text>{(data?.topCategories || []).map((c: any, i: number) => <Text key={i} style={styles.muted}>{c.category}: ₹{Number(c.amount).toLocaleString('en-IN')}</Text>)}</Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  section: { fontSize: Typography.h3, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  muted: { color: Colors.textSecondary, marginTop: 4 },
});