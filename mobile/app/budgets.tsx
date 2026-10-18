import React, { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { useAuth } from '../src/context/AuthContext';
import { useFinancialData } from '../src/hooks/useFinancialData';
import { financialService } from '../src/services/financialService';
import { mockBudget } from '../src/mock/data';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function BudgetsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const fetchBudget = useCallback(() => financialService.getCurrentBudget(), []);
  const budget = useFinancialData(fetchBudget, isAuthenticated);
  const live: any = budget.data;
  const current = live?.budget || live || mockBudget;
  const spent = current?.spent ?? mockBudget.spent;
  const limit = current?.overallLimit ?? current?.overall_limit ?? mockBudget.overallLimit;
  const categories = current?.categories || mockBudget.categories;

  if (budget.isLoading) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  if (budget.error) return <View style={styles.center}><Text style={styles.error}>{budget.error}</Text><Button title="Retry" onPress={budget.reload} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Current Budget</Text>
        <Button title="Create" onPress={() => router.push('/create-budget')} />
      </View>
      <Card>
        <Text style={styles.muted}>Overall</Text>
        <Text style={styles.hero}>₹{Number(spent).toLocaleString('en-IN')} / ₹{Number(limit).toLocaleString('en-IN')}</Text>
      </Card>
      {categories.map((category: any) => {
        const name = category.category || category.name;
        const categorySpent = category.spent;
        const categoryLimit = category.limit;
        const percent = categoryLimit > 0 ? Math.round((categorySpent / categoryLimit) * 100) : 0;
        return (
          <Card key={name}>
            <View style={styles.row}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.value}>{percent}%</Text>
            </View>
            <Text style={styles.muted}>₹{Number(categorySpent).toLocaleString('en-IN')} / ₹{Number(categoryLimit).toLocaleString('en-IN')}</Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text },
  hero: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginTop: 4 },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: Colors.text, fontWeight: '600' },
  value: { color: Colors.primary, fontWeight: '700' },
  error: { color: Colors.danger, marginBottom: Spacing.md },
});