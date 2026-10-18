import React, { useState } from 'react';
import { ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/ui/Button';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function CreateBudgetScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [overallLimit, setOverallLimit] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const limit = Number(overallLimit);
    if (!Number.isFinite(limit) || limit < 0) { setError('Enter a valid limit'); return; }
    setSaving(true); setError('');
    try {
      await financialService.createBudget({ month, overallLimit: limit, currency: 'INR', categoryLimits: [] });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create budget');
    } finally { setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Budget</Text>
      <TextInput style={styles.input} placeholder="Month YYYY-MM" value={month} onChangeText={setMonth} />
      <TextInput style={styles.input} placeholder="Overall limit" keyboardType="numeric" value={overallLimit} onChangeText={setOverallLimit} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={saving ? 'Creating...' : 'Create budget'} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md },
  error: { color: Colors.danger, marginBottom: Spacing.md },
});