import React, { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function RecurringScreen() {
  const { isAuthenticated } = useAuth();
  const fetchRecurring = useCallback(() => financialService.listRecurringPayments(), []);
  const recurring = useFinancialData(fetchRecurring, isAuthenticated);
  const data: any = recurring.data;
  const payments = Array.isArray(data) ? data : (data?.recurringPayments || data?.payments || []);
  if (recurring.isLoading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recurring Payments</Text>
        <Button title="Detect" onPress={async () => { await financialService.detectRecurringPayments(); recurring.reload(); }} />
      </View>
      {payments.length === 0 && <Text style={styles.muted}>No recurring payments detected.</Text>}
      {payments.map((p: any, i: number) => (
        <Card key={p.id || i}>
          <View style={styles.row}>
            <Text style={styles.name}>{p.merchant || p.name || 'Recurring'}</Text>
            <Text style={styles.value}>₹{Number(p.averageAmount ?? p.amount ?? 0).toLocaleString('en-IN')}</Text>
          </View>
          <Text style={styles.muted}>{p.status || 'detected'} · {p.occurrenceCount || ''} times</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: Colors.text, fontWeight: '600' },
  value: { color: Colors.primary, fontWeight: '700' },
  muted: { color: Colors.textSecondary, marginTop: 4 },
});