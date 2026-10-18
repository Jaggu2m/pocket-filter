import React from 'react';
import { SimpleScreen } from '../src/components/ui/SimpleScreen';

export default function SettingsScreen() {
  return <SimpleScreen title="Settings" items={[
    { title: 'Currency', subtitle: '₹ INR' },
    { title: 'Theme', subtitle: 'System / Light / Dark' },
    { title: 'Notifications', subtitle: 'On' },
    { title: 'Biometric Lock', subtitle: 'On' },
    { title: 'Data & Privacy' },
    { title: 'Security' },
  ]} />;
}