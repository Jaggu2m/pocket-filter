import React, { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function TransactionDetailsScreen() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const fetchTransaction = useCallback(() => financialService.getTransaction(String(id)), [id]);
  const tx = useFinancialData(fetchTransaction, Boolean(id));

  if (tx.isLoading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  if (tx.error || !tx.data) return <View style={styles.center}><Text style={styles.error}>{tx.error || 'Transaction not found'}</Text><Button title="Retry" onPress={tx.reload} /></View>;

  const transaction: any = tx.data.transaction || tx.data;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{transaction.type === 'income' ? '+' : '-'}₹{Number(transaction.amount).toLocaleString('en-IN')}</Text>
      <Card>
        <Text style={styles.name}>{transaction.description || transaction.category}</Text>
        <Text style={styles.muted}>{transaction.category} · {transaction.date}</Text>
        <Text style={styles.muted}>Account ID: {transaction.accountId || 'Optional/non-linked'}</Text>
      </Card>
      <Card><Text style={styles.section}>Budget impact</Text><Text style={styles.muted}>Updated automatically through linked financial state.</Text></Card>
      <Button title="Delete transaction" onPress={async () => { await financialService.deleteTransaction(transaction.id); router.back(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  title: { fontSize: Typography.display, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  name: { color: Colors.text, fontWeight: '600', fontSize: Typography.h3 },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  section: { color: Colors.text, fontWeight: '600', marginBottom: 4 },
  error: { color: Colors.danger, marginBottom: Spacing.md },
});