import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/colors';
import { Typography } from '../src/constants/typography';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Finance Copilot</Text>
      <Text style={styles.muted}>Your money. Better decisions.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title: { fontSize: Typography.display, fontWeight: '700', color: Colors.text },
  muted: { color: Colors.textSecondary, marginTop: 8 },
});