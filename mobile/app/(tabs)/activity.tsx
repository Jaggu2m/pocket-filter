import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { useFinancialData } from '../../src/hooks/useFinancialData';
import { financialService } from '../../src/services/financialService';

interface DisplayTransactionItem {
  id: string;
  merchant: string;
  letter: string;
  rail: 'CC' | 'UPI' | 'Debit';
  time: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
}

const fallbackTransactions: DisplayTransactionItem[] = [
  { id: '1', merchant: 'Ola', letter: 'O', rail: 'CC', time: '30 Apr, 11:50 pm', category: 'Commute', amount: 1000.00, type: 'expense' },
  { id: '2', merchant: 'Zomato', letter: 'Z', rail: 'UPI', time: '29 Apr, 8:52 pm', category: 'Food & Drinks', amount: 536.26, type: 'income' },
  { id: '3', merchant: 'Netflix', letter: 'N', rail: 'CC', time: '28 Apr, 4:50 pm', category: 'Entertainment', amount: 899.37, type: 'expense' },
  { id: '4', merchant: 'Zomato', letter: 'Z', rail: 'UPI', time: '25 Apr, 3:50 pm', category: 'Food & Drinks', amount: 899.37, type: 'expense' },
  { id: '5', merchant: 'Tata Croma', letter: 'T', rail: 'CC', time: '25 Apr, 8:30 am', category: 'Electronics & Software', amount: 25000.00, type: 'expense' },
  { id: '6', merchant: 'Bigbasket', letter: 'B', rail: 'UPI', time: '24 Apr, 12:21 pm', category: 'Groceries', amount: 798.32, type: 'expense' },
  { id: '7', merchant: 'Om Medical', letter: 'O', rail: 'UPI', time: '24 Apr, 12:20 pm', category: 'Pharmacy', amount: 340.00, type: 'expense' },
];

const categoryIcons: Record<string, string> = {
  'Commute': 'car-outline',
  'Food & Drinks': 'restaurant-outline',
  'Entertainment': 'film-outline',
  'Electronics & Software': 'laptop-outline',
  'Groceries': 'cart-outline',
  'Pharmacy': 'medkit-outline',
  'Shopping': 'bag-handle-outline',
  'Bills': 'receipt-outline',
  'Income': 'cash-outline',
};

export default function ActivityScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Expenses' | 'Income/Refunds' | 'UPI' | 'CC'>('All');

  // Live transactions data from backend API
  const { data: apiTxData, reload } = useFinancialData(
    () => financialService.listTransactions(),
    isAuthenticated
  );

  // Reload transactions when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) reload();
    }, [isAuthenticated, reload])
  );

  const parsedTransactions = useMemo<DisplayTransactionItem[]>(() => {
    const rawList = apiTxData?.transactions || apiTxData;
    if (Array.isArray(rawList) && rawList.length > 0) {
      return rawList.map((t: any) => {
        const merchantName = t.merchant || t.description || t.category || 'Transaction';
        const letter = (merchantName.trim().charAt(0) || 'T').toUpperCase();
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Today';
        return {
          id: t.id,
          merchant: merchantName,
          letter,
          rail: (t.paymentRail?.toUpperCase() === 'CC' ? 'CC' : t.paymentRail?.toUpperCase() === 'DEBIT' ? 'Debit' : 'UPI') as any,
          time: dateStr,
          category: t.category || 'General',
          amount: Math.abs(parseFloat(t.amount) || 0),
          type: t.type === 'income' ? 'income' : 'expense',
        };
      });
    }
    return fallbackTransactions;
  }, [apiTxData]);

  const displayedList = useMemo(() => {
    let list = parsedTransactions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    if (selectedFilter === 'Expenses') {
      list = list.filter(t => t.type === 'expense');
    } else if (selectedFilter === 'Income/Refunds') {
      list = list.filter(t => t.type === 'income');
    } else if (selectedFilter === 'UPI') {
      list = list.filter(t => t.rail === 'UPI');
    } else if (selectedFilter === 'CC') {
      list = list.filter(t => t.rail === 'CC');
    }
    return list;
  }, [parsedTransactions, searchQuery, selectedFilter]);

  const totalMonthlySpend = useMemo(() => {
    const total = displayedList
      .filter(t => t.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);
    return total > 0 ? total : 54157.01;
  }, [displayedList]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Title */}
        <Text style={styles.screenTitle}>Activity</Text>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <Feather name="search" size={17} color="#64748B" style={styles.searchIcon} />
          <TextInput
            placeholder="Search merchants, e.g. Zomato"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Horizontal Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsContainer}
        >
          {(['All', 'Expenses', 'Income/Refunds', 'UPI', 'CC'] as const).map((item) => {
            const isActive = selectedFilter === item;
            return (
              <TouchableOpacity
                key={item}
                activeOpacity={0.7}
                onPress={() => setSelectedFilter(item)}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Month Section Header */}
        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthTitle}>April 2024</Text>
          <Text style={styles.monthTotal}>₹{totalMonthlySpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
        </View>

        {/* Transactions List */}
        {displayedList.map((item) => {
          const isIncome = item.type === 'income';
          const iconName = categoryIcons[item.category] || 'pricetag-outline';

          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.75}
              style={styles.transactionCard}
              onPress={() => router.push(`/transaction-details?id=${item.id}`)}
            >
              <View style={styles.txTopRow}>
                {/* Left: Avatar Letter + Merchant Name */}
                <View style={styles.txMerchantWrap}>
                  <View style={styles.merchantAvatar}>
                    <Text style={styles.merchantAvatarLetter}>{item.letter}</Text>
                  </View>
                  <Text style={styles.merchantName}>{item.merchant}</Text>
                </View>

                {/* Right: Rail Badge + Timestamp */}
                <View style={styles.txRailTimeWrap}>
                  <View style={styles.railBadge}>
                    <Text style={styles.railBadgeText}>{item.rail}</Text>
                  </View>
                  <Text style={styles.timestampText}>{item.time}</Text>
                </View>
              </View>

              {/* Bottom Row: Amount + Category Chip */}
              <View style={styles.txBottomRow}>
                <Text style={[styles.txAmountText, isIncome ? styles.txAmountIncome : styles.txAmountExpense]}>
                  {isIncome ? '+' : '-'}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>

                <View style={styles.categoryChip}>
                  <Ionicons name={iconName as any} size={12} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.categoryChipText}>{item.category}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
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
    paddingBottom: 24,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterPillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  monthTitle: {
    fontSize: 12,
    color: '#64748B',
  },
  monthTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txMerchantWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  merchantAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  merchantAvatarLetter: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  merchantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  txRailTimeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  railBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginRight: 6,
  },
  railBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  timestampText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  txBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  txAmountExpense: {
    color: '#0F172A',
  },
  txAmountIncome: {
    color: '#15803D',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});