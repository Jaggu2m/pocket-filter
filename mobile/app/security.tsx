import React from 'react';
import { SimpleScreen } from '../src/components/ui/SimpleScreen';

export default function SecurityScreen() {
  return <SimpleScreen title="Security" items={[{ title: 'Biometric Lock', subtitle: 'On' }, { title: 'Data & Privacy' }]} />;
}