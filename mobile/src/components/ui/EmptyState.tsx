import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

export function EmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel ? <Text style={styles.action}>{actionLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.xl, alignItems: 'center' },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  message: { color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  action: { color: Colors.primary, fontWeight: '600' },
});