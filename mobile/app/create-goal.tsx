import React, { useState } from 'react';
import { ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/ui/Button';
import { financialService } from '../src/services/financialService';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function CreateGoalScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));
  const [savedAmount, setSavedAmount] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const target = Number(targetAmount);
    const saved = Number(savedAmount) || 0;
    if (!name || !Number.isFinite(target) || target <= 0) { setError('Enter a valid goal'); return; }
    setSaving(true); setError('');
    try {
      const goal: any = await financialService.createGoal({
        name,
        targetAmount: target,
        targetDate,
        priority: 2,
      });
      const goalId = goal?.goal?.id || goal?.id;
      if (goalId && saved > 0) {
        await financialService.addGoalContribution(goalId, { amount: saved });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create goal');
    } finally { setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Goal</Text>
      <TextInput style={styles.input} placeholder="Goal name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Target amount" keyboardType="numeric" value={targetAmount} onChangeText={setTargetAmount} />
      <TextInput style={styles.input} placeholder="Deadline YYYY-MM-DD" value={targetDate} onChangeText={setTargetDate} />
      <TextInput style={styles.input} placeholder="Current savings" keyboardType="numeric" value={savedAmount} onChangeText={setSavedAmount} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={saving ? 'Creating...' : 'Create'} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md },
  error: { color: Colors.danger, marginBottom: Spacing.md },
});