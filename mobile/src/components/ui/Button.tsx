import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

export function Button({ title, onPress, variant = 'primary' }: { title: string; onPress?: () => void; variant?: 'primary' | 'secondary' }) {
  return (
    <Pressable onPress={onPress} style={[styles.base, variant === 'primary' ? styles.primary : styles.secondary]}>
      <Text style={[styles.text, variant === 'primary' ? styles.primaryText : styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.subtle },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: '#FFFFFF' },
  secondaryText: { color: Colors.primary },
});