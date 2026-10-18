import React from 'react';
import { ScrollView } from 'react-native';
import { EmptyState } from '../src/components/ui/EmptyState';

export default function EmptyStatesScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <EmptyState title="No transactions yet" message="Start tracking your money to understand your spending." actionLabel="Add transaction" />
      <EmptyState title="No goals yet" message="Create your first financial goal." actionLabel="Create goal" />
    </ScrollView>
  );
}