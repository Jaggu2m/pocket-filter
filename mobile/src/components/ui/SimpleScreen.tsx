import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Card } from './Card';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';

export function SimpleScreen({ title, items }: { title: string; items: Array<{ title: string; subtitle?: string; value?: string }> }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {items.map((item, index) => (
        <Card key={`${item.title}-${index}`}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.titleCard}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.muted}>{item.subtitle}</Text> : null}
            </View>
            {item.value ? <Text style={styles.value}>{item.value}</Text> : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg },
  title: { fontSize: Typography.h1, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex: { flex: 1 },
  titleCard: { color: Colors.text, fontWeight: '600' },
  muted: { color: Colors.textSecondary, marginTop: 4 },
  value: { color: Colors.primary, fontWeight: '700' },
});