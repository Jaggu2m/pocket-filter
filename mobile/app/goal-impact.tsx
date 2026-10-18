import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Card } from '../src/components/ui/Card';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function GoalImpactScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Goal Impact</Text>
      <Card>
        <Text style={styles.name}>Kashmir Trip</Text>
        <Text style={styles.muted}>Before: December</Text>
        <Text style={styles.muted}>After: January</Text>
        <Text style={styles.muted}>Impact: +1 month delay</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  name: { color: Colors.text, fontWeight: '600', fontSize: Typography.h3 },
  muted: { color: Colors.textSecondary, marginTop: 4 },
});