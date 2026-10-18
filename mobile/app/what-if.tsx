import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function WhatIfScreen() {
  const [amount, setAmount] = useState('40000');
  const [category, setCategory] = useState('electronics');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const simulate = async () => {
    setLoading(true); setError('');
    try {
      const data = await financialService.simulate({ type: 'ONE_TIME_EXPENSE', amount: Number(amount), category });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>What If?</Text>
      <Card>
        <Text style={styles.label}>What are you planning to buy?</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="40000" />
        <Text style={styles.label}>Category</Text>
        <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="electronics" />
        <Button title={loading ? 'Simulating...' : 'Simulate'} onPress={simulate} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>
      {result ? (
        <Card>
          <Text style={styles.section}>Decision: {result.decision?.status}</Text>
          <Text style={styles.muted}>After liquidity: ₹{Number(result.after?.liquidBalance || result.after?.liquidMoney || 0).toLocaleString('en-IN')}</Text>
          <Text style={styles.muted}>Goal impacts: {result.goalImpacts?.length || 0}</Text>
          {result.decision?.reasons?.map((r: any, i: number) => <Text key={i} style={styles.muted}>• {r.message}</Text>)}
        </Card>
      ) : null}
      {loading && <ActivityIndicator color={Colors.primary} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  label: { color: Colors.text, fontWeight: '600', marginBottom: Spacing.sm },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md },
  section: { color: Colors.text, fontWeight: '600', marginBottom: 4 },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  error: { color: Colors.danger, marginTop: Spacing.md },
});