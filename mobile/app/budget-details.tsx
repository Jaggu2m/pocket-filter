import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Card } from '../src/components/ui/Card';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function BudgetDetailsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Food</Text>
      <Card>
        <Text style={styles.muted}>Budget: ₹7,000</Text>
        <Text style={styles.muted}>Spent: ₹5,800</Text>
        <Text style={styles.muted}>Remaining: ₹1,200</Text>
      </Card>
      <Card><Text style={styles.section}>Forecast</Text><Text style={styles.muted}>At current pace: ₹8,200</Text><Text style={styles.muted}>Expected overspend: ₹1,200</Text></Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  section: { color: Colors.text, fontWeight: '600', marginBottom: 4 },
});