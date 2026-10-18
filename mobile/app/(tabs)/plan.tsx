import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { useFinancialData } from '../../src/hooks/useFinancialData';
import { financialService } from '../../src/services/financialService';

export default function PlanScreen() {
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Live recurring payments
  const { data: recurringData } = useFinancialData(
    () => financialService.listRecurringPayments(),
    isAuthenticated
  );

  // Live accounts for credit card dues
  const { data: accountsData } = useFinancialData(
    () => financialService.listAccounts(),
    isAuthenticated
  );

  const upcomingBills = useMemo(() => {
    const list: any[] = [];

    // Credit cards with outstanding balances
    const accounts = Array.isArray(accountsData) ? accountsData : [];
    for (const acc of accounts) {
      if (acc.type === 'credit_card' && Number(acc.balance || 0) > 0) {
        list.push({
          id: `cc-${acc.id}`,
          name: acc.name || 'Credit Card Bill',
          dueDate: 'Due this cycle',
          amount: `₹${Number(acc.balance).toLocaleString('en-IN')}`,
          isCc: true,
        });
      }
    }

    // Active recurring payments / EMIs
    const recurring = Array.isArray(recurringData)
      ? recurringData
      : (recurringData?.recurringPayments || recurringData?.payments || []);
    for (const r of recurring) {
      const amt = Number(r.averageAmount || r.amount || 0);
      const dateStr = r.nextExpectedDate
        ? `Due ${new Date(r.nextExpectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : 'Monthly recurring';
      list.push({
        id: `rec-${r.id}`,
        name: r.merchantName || r.merchant || r.name || 'Recurring Payment',
        dueDate: dateStr,
        amount: `₹${amt.toLocaleString('en-IN')}`,
        isCc: false,
      });
    }

    return list;
  }, [recurringData, accountsData]);

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of Pocket Filter?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <Text style={styles.screenTitle}>Plan & Settings</Text>

        {/* 1. What-If Simulator Hero Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.card}
          onPress={() => router.push('/what-if')}
        >
          <View style={styles.simulatorTitleRow}>
            <Ionicons name="trending-up-outline" size={18} color="#4F46E5" style={{ marginRight: 6 }} />
            <Text style={styles.simulatorTitle}>What-If Simulator</Text>
          </View>
          <Text style={styles.simulatorDesc}>
            See how a large purchase, loan, or investment affects your daily spend and liquidity before you commit.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#4F46E5' }}>Simulate a purchase</Text>
            <Feather name="arrow-right" size={13} color="#4F46E5" style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>

        {/* 2. Upcoming bills Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Upcoming Bills & EMIs</Text>
          <TouchableOpacity onPress={() => router.push('/recurring')}>
            <Text style={styles.manageAction}>Manage</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {upcomingBills.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={26} color="#94A3B8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No bills scheduled</Text>
              <Text style={styles.emptySubtitle}>Track credit card dues, utility bills, and monthly subscriptions</Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push('/goals')}
              >
                <Text style={styles.actionBtnText}>+ Add EMI / Bill</Text>
              </TouchableOpacity>
            </View>
          ) : (
            upcomingBills.map((bill, index) => {
              const isLast = index === upcomingBills.length - 1;
              return (
                <View key={bill.id}>
                  <View style={styles.billRow}>
                    <View style={styles.billDetails}>
                      <Text style={styles.billName}>{bill.name}</Text>
                      <Text style={styles.billDueDate}>{bill.dueDate}</Text>
                    </View>
                    <Text style={styles.billAmount}>{bill.amount}</Text>
                  </View>
                  {!isLast && <View style={styles.cardDivider} />}
                </View>
              );
            })
          )}
        </View>

        {/* 3. Profile & Account Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Account & Profile</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.profileRow}
            activeOpacity={0.7}
            onPress={() => router.push('/profile')}
          >
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarEmoji}>😊</Text>
            </View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileName}>
                {user?.firstName
                  ? (user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName)
                  : user?.name || user?.email?.split('@')[0] || 'My Account'}
              </Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.cardDivider} />

          <TouchableOpacity
            style={styles.settingsClickableRow}
            activeOpacity={0.7}
            onPress={() => router.push('/account-settings')}
          >
            <View style={styles.settingLabelRow}>
              <Ionicons name="wallet-outline" size={18} color="#475569" style={{ marginRight: 10 }} />
              <Text style={styles.settingsLabel}>Linked Accounts & Cards</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 4. Settings Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Preferences</Text>
        </View>

        <View style={styles.card}>
          {/* Notifications */}
          <View style={styles.settingsRow}>
            <View style={styles.settingLabelRow}>
              <Ionicons name="notifications-outline" size={18} color="#475569" style={{ marginRight: 10 }} />
              <Text style={styles.settingsLabel}>Notifications & Alerts</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E2E8F0', true: '#15803D' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.cardDivider} />

          {/* Currency / Regional */}
          <TouchableOpacity
            style={styles.settingsClickableRow}
            activeOpacity={0.7}
            onPress={() => router.push('/settings')}
          >
            <View style={styles.settingLabelRow}>
              <Ionicons name="globe-outline" size={18} color="#475569" style={{ marginRight: 10 }} />
              <Text style={styles.settingsLabel}>Currency & Region</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.settingValueText}>₹ INR</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. Logout Action */}
        <View style={[styles.card, { marginBottom: 36 }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.logoutButtonRow}
            onPress={handleLogout}
          >
            <MaterialIcons name="logout" size={20} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  simulatorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  simulatorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  simulatorDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  manageAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  billDetails: {
    flex: 1,
  },
  billName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  billDueDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  billAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileAvatarEmoji: {
    fontSize: 18,
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  profileEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  settingsClickableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingValueText: {
    fontSize: 12,
    color: '#64748B',
  },
  logoutButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 3,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 240,
  },
  actionBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});