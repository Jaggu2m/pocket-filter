import React from 'react';
import { ScrollView, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import { Typography } from '../src/constants/typography';

export default function OtpScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>OTP Verification</Text>
      <TextInput style={styles.input} placeholder="123456" keyboardType="number-pad" />
      <Button title="Verify" onPress={() => {}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md },
});