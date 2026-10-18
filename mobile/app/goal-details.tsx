import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function GoalDetailsScreen() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const fetchGoal = useCallback(() => financialService.getGoalHealth(String(id)), [id]);
  const goal = useFinancialData(fetchGoal, Boolean(id));
  const [contribAmount, setContribAmount] = useState('');
  const [sending, setSending] = useState(false);

  const submitContribution = async () => {
    if (!id) return;
    const amount = Number(contribAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSending(true);
    try {
      await financialService.addGoalContribution(String(id), { amount });
      setContribAmount('');
      goal.reload();
    } finally { setSending(false); }
  };

  if (goal.isLoading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  if (goal.error || !goal.data) return <View style={styles.center}><Text style={styles.error}>{goal.error || 'Goal not found'}</Text><Button title="Retry" onPress={goal.reload} /></View>;

  const data: any = goal.data.health || goal.data.goal || goal.data;
  const amount = data?.savedAmount ?? data?.goal?.savedAmount ?? 0;
  const target = data?.targetAmount ?? data?.goal?.targetAmount ?? 1;
  const progress = Math.round((amount / target) * 100);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{data?.goalName || data?.name || 'Goal'}</Text>
      <Card>
        <Text style={styles.hero}>₹{amount.toLocaleString('en-IN')}</Text>
        <Text style={styles.muted}>saved of ₹{target.toLocaleString('en-IN')}</Text>
        <Text style={styles.progress}>{progress}% complete</Text>
      </Card>
      <Card>
        <Text style={styles.section}>Required monthly saving</Text>
        <Text style={styles.value}>{data?.requiredMonthlySaving ? `₹${Number(data.requiredMonthlySaving).toLocaleString('en-IN')}` : 'Calculating...'}</Text>
        <Text style={styles.muted}>Current pace: {data?.currentMonthlyPace ? `₹${Number(data.currentMonthlyPace).toLocaleString('en-IN')} / month` : '...'}</Text>
        <Text style={styles.muted}>{data?.status ? `${data.status}` : ''}</Text>
      </Card>
      <Card>
        <Text style={styles.section}>Add contribution</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" placeholder="Amount" />
          <Button title={sending ? 'Saving...' : 'Add'} onPress={submitContribution} />
        </View>
      </Card>
      <Button title="Goal impact" onPress={() => router.push(`/goal-impact?amount=10000${id ? `&goalId=${id}` : ''}`)} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  hero: { fontSize: Typography.display, fontWeight: '700', color: Colors.text },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  progress: { color: Colors.primary, fontWeight: '700', marginTop: 4 },
  value: { color: Colors.text, fontWeight: '600', fontSize: Typography.h2, marginTop: 4 },
  section: { color: Colors.text, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md },
  error: { color: Colors.danger, marginBottom: Spacing.md },
});