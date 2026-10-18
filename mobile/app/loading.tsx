import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';

export default function LoadingScreen() {
  return <View style={styles.container}><Text style={styles.muted}>Loading...</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textSecondary },
});