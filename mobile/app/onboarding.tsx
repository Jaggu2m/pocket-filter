import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function OnboardingScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Understand your money</Text>
      <Text style={styles.muted}>See where your money goes and understand your spending patterns.</Text>
      <Button title="Get Started" onPress={() => {}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  muted: { color: Colors.textSecondary, marginBottom: Spacing.lg },
});