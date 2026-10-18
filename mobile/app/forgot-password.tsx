import React from 'react';
import { ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function ForgotPasswordScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Forgot Password</Text>
      <TextInput style={styles.input} placeholder="Email" />
      <Button title="Reset" onPress={() => {}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md },
});