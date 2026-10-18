import React from 'react';
import { SimpleScreen } from '../src/components/ui/SimpleScreen';
import { mockEmis } from '../src/mock/data';

export default function EmiScreen() {
  return <SimpleScreen title="EMIs" items={mockEmis.map((e) => ({ title: e.name, subtitle: `${e.monthsRemaining} months remaining · next ${e.nextPaymentDate}`, value: `₹${e.monthlyAmount.toLocaleString('en-IN')}/mo` }))} />;
}