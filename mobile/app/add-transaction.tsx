import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { financialService } from '../src/services/financialService';

const expenseCategories = [
  'Food & Drinks',
  'Commute',
  'Groceries',
  'Pharmacy',
  'Entertainment',
  'Electronics & Software',
  'Shopping',
  'Bills',
  'Rent',
  'Other',
];

const incomeCategories = [
  'Salary',
  'Freelance',
  'Business',
  'Investment Returns',
  'Rental Income',
  'Refund',
  'Gift',
  'Other Income',
];

const paymentRails = ['UPI', 'CC', 'Debit', 'Bank Transfer', 'Cash'];

interface AccountItem {
  id: string;
  name: string;
  type: string;
  institutionName?: string | null;
  accountNumberLast4?: string | null;
  balance: number;
}

export default function AddTransactionScreen() {
  const router = useRouter();
  const [tabType, setTabType] = useState<'Expense' | 'Income' | 'Transfer'>('Expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Food & Drinks');
  const [selectedRail, setSelectedRail] = useState('UPI');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Money Source Tracking State
  // 'UNSPECIFIED' or specific account id
  const [selectedSourceId, setSelectedSourceId] = useState<string>('UNSPECIFIED');
  const [selectedDestId, setSelectedDestId] = useState<string>('UNSPECIFIED');

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [unspecifiedBalance, setUnspecifiedBalance] = useState<number>(0);
  const [loadingSources, setLoadingSources] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadSources() {
      try {
        const [accs, summary] = await Promise.all([
          financialService.listAccounts().catch(() => []),
          financialService.getAccountSummary().catch(() => null),
        ]);
        if (isMounted) {
          const validAccs = Array.isArray(accs) ? accs : [];
          setAccounts(validAccs);
          if (summary?.unspecifiedBalance !== undefined) {
            setUnspecifiedBalance(Number(summary.unspecifiedBalance) || 0);
          }
        }
      } catch (err) {
        console.warn('Failed to load accounts for transaction modal:', err);
      } finally {
        if (isMounted) setLoadingSources(false);
      }
    }
    loadSources();
    return () => {
      isMounted = false;
    };
  }, []);

  const categories = tabType === 'Income' ? incomeCategories : expenseCategories;

  const sourceName = useMemo(() => {
    if (selectedSourceId === 'UNSPECIFIED') return 'Unspecified Balance';
    const a = accounts.find((acc) => acc.id === selectedSourceId);
    return a ? (a.institutionName || a.name) : 'Selected Source';
  }, [selectedSourceId, accounts]);

  const destName = useMemo(() => {
    if (selectedDestId === 'UNSPECIFIED') return 'Unspecified Balance';
    const a = accounts.find((acc) => acc.id === selectedDestId);
    return a ? (a.institutionName || a.name) : 'Selected Destination';
  }, [selectedDestId, accounts]);

  const handleTabSwitch = (type: 'Expense' | 'Income' | 'Transfer') => {
    setTabType(type);
    setErrorMessage('');
    if (type === 'Income') {
      setSelectedCategory('Salary');
    } else if (type === 'Expense') {
      setSelectedCategory('Food & Drinks');
    } else {
      setSelectedCategory('Transfer');
      // When switching to transfer, default source & destination intelligently so they are distinct
      if (accounts.length >= 2) {
        setSelectedSourceId(accounts[0].id);
        setSelectedDestId(accounts[1].id);
      } else if (accounts.length === 1) {
        setSelectedSourceId(accounts[0].id);
        setSelectedDestId('UNSPECIFIED');
      }
    }
  };

  const handleSave = async () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    if (tabType === 'Transfer') {
      if (selectedSourceId === selectedDestId) {
        setErrorMessage('Source and destination cannot be identical');
        return;
      }
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const payload: any = {
        amount: numericAmount,
        date: new Date().toISOString().slice(0, 10),
      };

      if (tabType === 'Expense') {
        payload.type = 'expense';
        payload.category = selectedCategory;
        payload.merchant = merchant.trim() || null;
        payload.description = merchant.trim() || selectedCategory;
        payload.paymentRail = selectedRail;
        if (selectedSourceId === 'UNSPECIFIED') {
          payload.sourceType = 'UNSPECIFIED';
        } else {
          payload.sourceType = 'ACCOUNT';
          payload.accountId = selectedSourceId;
        }
      } else if (tabType === 'Income') {
        payload.type = 'income';
        payload.category = selectedCategory;
        payload.merchant = merchant.trim() || null;
        payload.description = merchant.trim() || selectedCategory;
        payload.paymentRail = selectedRail;
        if (selectedDestId === 'UNSPECIFIED') {
          payload.destinationType = 'UNSPECIFIED';
        } else {
          payload.destinationType = 'ACCOUNT';
          payload.accountId = selectedDestId;
        }
      } else {
        // Transfer
        payload.type = 'transfer';
        payload.category = 'Transfer';
        payload.description = merchant.trim() || `Transfer: ${sourceName} → ${destName}`;
        payload.paymentRail = selectedRail;
        if (selectedSourceId === 'UNSPECIFIED') {
          payload.sourceType = 'UNSPECIFIED';
        } else {
          payload.sourceType = 'ACCOUNT';
          payload.accountId = selectedSourceId;
        }
        if (selectedDestId === 'UNSPECIFIED') {
          payload.destinationType = 'UNSPECIFIED';
        } else {
          payload.destinationType = 'ACCOUNT';
          payload.toAccountId = selectedDestId;
        }
      }

      await financialService.createTransaction(payload);
      router.back();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to record transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSourceChip = (
    id: string,
    title: string,
    subtitle: string,
    isSelected: boolean,
    onSelect: () => void,
    icon: any = 'wallet-outline',
  ) => {
    return (
      <TouchableOpacity
        key={id}
        activeOpacity={0.7}
        onPress={onSelect}
        style={[styles.sourceCard, isSelected && styles.sourceCardSelected]}
      >
        <View style={[styles.sourceIconWrap, isSelected && styles.sourceIconWrapSelected]}>
          <Ionicons
            name={icon}
            size={16}
            color={isSelected ? '#FFFFFF' : '#475569'}
          />
        </View>
        <View style={styles.sourceTextWrap}>
          <Text
            style={[styles.sourceTitle, isSelected && styles.sourceTitleSelected]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[styles.sourceSubtitle, isSelected && styles.sourceSubtitleSelected]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={18} color="#0F172A" style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.backdrop}>
      <TouchableOpacity
        style={styles.dismissOverlay}
        activeOpacity={1}
        onPress={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetContainer}
      >
        <View style={styles.sheetCard}>
          {/* Top Grab Handle */}
          <View style={styles.dragHandle} />

          {/* Title + Upload Shortcut */}
          <View style={styles.headerRow}>
            <Text style={styles.sheetTitle}>
              {tabType === 'Transfer' ? 'Record Transfer' : 'Add Transaction'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                router.back();
                router.push('/statement-upload');
              }}
              style={styles.uploadShortcut}
            >
              <Ionicons name="cloud-upload-outline" size={14} color="#4F46E5" />
              <Text style={styles.uploadShortcutText}>Upload PDF</Text>
            </TouchableOpacity>
          </View>

          {/* 3-Way Segmented Toggle */}
          <View style={styles.segmentedToggleContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.segmentButton,
                tabType === 'Expense' && styles.segmentButtonExpenseActive,
              ]}
              onPress={() => handleTabSwitch('Expense')}
            >
              <Text
                style={[
                  styles.segmentText,
                  tabType === 'Expense' && styles.segmentTextExpenseActive,
                ]}
              >
                − Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.segmentButton,
                tabType === 'Income' && styles.segmentButtonIncomeActive,
              ]}
              onPress={() => handleTabSwitch('Income')}
            >
              <Text
                style={[
                  styles.segmentText,
                  tabType === 'Income' && styles.segmentTextIncomeActive,
                ]}
              >
                + Income
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.segmentButton,
                tabType === 'Transfer' && styles.segmentButtonTransferActive,
              ]}
              onPress={() => handleTabSwitch('Transfer')}
            >
              <Text
                style={[
                  styles.segmentText,
                  tabType === 'Transfer' && styles.segmentTextTransferActive,
                ]}
              >
                ⇄ Transfer
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {/* Amount Input with Currency Symbol */}
            <View
              style={[
                styles.amountInputContainer,
                {
                  borderColor:
                    tabType === 'Income'
                      ? '#16A34A'
                      : tabType === 'Transfer'
                        ? '#6366F1'
                        : '#3B82F6',
                },
              ]}
            >
              <Text
                style={[
                  styles.currencySymbol,
                  {
                    color:
                      tabType === 'Income'
                        ? '#16A34A'
                        : tabType === 'Transfer'
                          ? '#6366F1'
                          : '#64748B',
                  },
                ]}
              >
                {tabType === 'Income' ? '+₹' : tabType === 'Transfer' ? '₹' : '−₹'}
              </Text>
              <TextInput
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            {/* Merchant / Description Input */}
            <View style={styles.merchantInputContainer}>
              <TextInput
                style={styles.merchantInput}
                placeholder={
                  tabType === 'Transfer'
                    ? 'Transfer Note (e.g. ATM withdrawal, Bank deposit)'
                    : tabType === 'Income'
                      ? 'Source / Payer (e.g. Employer, Client)'
                      : 'Merchant (e.g. Swiggy, Uber)'
                }
                placeholderTextColor="#94A3B8"
                value={merchant}
                onChangeText={setMerchant}
              />
            </View>

            {/* Money-Source Contextual Prompt */}
            {tabType === 'Expense' && (
              <View style={styles.sectionWrap}>
                <View style={styles.questionHeader}>
                  <Ionicons name="card-outline" size={15} color="#0F172A" />
                  <Text style={styles.questionLabel}>Where did the money come from?</Text>
                </View>
                <Text style={styles.questionSubtitle}>Select payment source</Text>
                <View style={styles.sourceGrid}>
                  {renderSourceChip(
                    'UNSPECIFIED',
                    'Unspecified Balance',
                    `General • ₹${unspecifiedBalance.toLocaleString('en-IN')}`,
                    selectedSourceId === 'UNSPECIFIED',
                    () => setSelectedSourceId('UNSPECIFIED'),
                    'cash-outline',
                  )}
                  {accounts.map((acc) =>
                    renderSourceChip(
                      acc.id,
                      acc.institutionName || acc.name,
                      `${acc.type.toUpperCase()} • ₹${Number(acc.balance || 0).toLocaleString('en-IN')}`,
                      selectedSourceId === acc.id,
                      () => setSelectedSourceId(acc.id),
                      acc.type === 'bank'
                        ? 'business-outline'
                        : acc.type === 'credit_card'
                          ? 'card-outline'
                          : 'wallet-outline',
                    ),
                  )}
                </View>
              </View>
            )}

            {tabType === 'Income' && (
              <View style={styles.sectionWrap}>
                <View style={styles.questionHeader}>
                  <Ionicons name="arrow-down-circle-outline" size={15} color="#16A34A" />
                  <Text style={styles.questionLabel}>Where did the money go?</Text>
                </View>
                <Text style={styles.questionSubtitle}>Select destination account</Text>
                <View style={styles.sourceGrid}>
                  {renderSourceChip(
                    'UNSPECIFIED',
                    'Unspecified Balance',
                    'Directly adds to overall balance',
                    selectedDestId === 'UNSPECIFIED',
                    () => setSelectedDestId('UNSPECIFIED'),
                    'wallet-outline',
                  )}
                  {accounts.map((acc) =>
                    renderSourceChip(
                      acc.id,
                      acc.institutionName || acc.name,
                      `${acc.type.toUpperCase()} • ₹${Number(acc.balance || 0).toLocaleString('en-IN')}`,
                      selectedDestId === acc.id,
                      () => setSelectedDestId(acc.id),
                      acc.type === 'bank'
                        ? 'business-outline'
                        : acc.type === 'credit_card'
                          ? 'card-outline'
                          : 'wallet-outline',
                    ),
                  )}
                </View>
              </View>
            )}

            {tabType === 'Transfer' && (
              <View style={styles.sectionWrap}>
                {/* Source Selection */}
                <View style={styles.questionHeader}>
                  <Ionicons name="arrow-up-circle-outline" size={15} color="#EF4444" />
                  <Text style={styles.questionLabel}>From which source?</Text>
                </View>
                <View style={styles.sourceGrid}>
                  {renderSourceChip(
                    'UNSPECIFIED',
                    'Unspecified Balance',
                    `₹${unspecifiedBalance.toLocaleString('en-IN')}`,
                    selectedSourceId === 'UNSPECIFIED',
                    () => setSelectedSourceId('UNSPECIFIED'),
                    'cash-outline',
                  )}
                  {accounts.map((acc) =>
                    renderSourceChip(
                      acc.id,
                      acc.institutionName || acc.name,
                      `₹${Number(acc.balance || 0).toLocaleString('en-IN')}`,
                      selectedSourceId === acc.id,
                      () => setSelectedSourceId(acc.id),
                      acc.type === 'bank' ? 'business-outline' : 'card-outline',
                    ),
                  )}
                </View>

                {/* Destination Selection */}
                <View style={[styles.questionHeader, { marginTop: 12 }]}>
                  <Ionicons name="arrow-down-circle-outline" size={15} color="#16A34A" />
                  <Text style={styles.questionLabel}>To which destination?</Text>
                </View>
                <View style={styles.sourceGrid}>
                  {renderSourceChip(
                    'UNSPECIFIED',
                    'Unspecified Balance',
                    'General balance pool',
                    selectedDestId === 'UNSPECIFIED',
                    () => setSelectedDestId('UNSPECIFIED'),
                    'cash-outline',
                  )}
                  {accounts.map((acc) =>
                    renderSourceChip(
                      acc.id,
                      acc.institutionName || acc.name,
                      `₹${Number(acc.balance || 0).toLocaleString('en-IN')}`,
                      selectedDestId === acc.id,
                      () => setSelectedDestId(acc.id),
                      acc.type === 'bank' ? 'business-outline' : 'card-outline',
                    ),
                  )}
                </View>

                {/* Transfer Route Preview Banner */}
                <View style={styles.transferPreviewBanner}>
                  <View style={styles.transferPreviewBox}>
                    <Text style={styles.transferPreviewLabel}>From</Text>
                    <Text style={styles.transferPreviewValue} numberOfLines={1}>{sourceName}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#4F46E5" style={{ marginHorizontal: 8 }} />
                  <View style={styles.transferPreviewBox}>
                    <Text style={styles.transferPreviewLabel}>To</Text>
                    <Text style={styles.transferPreviewValue} numberOfLines={1}>{destName}</Text>
                  </View>
                </View>

                {selectedSourceId === selectedDestId && (
                  <View style={styles.identicalWarningBox}>
                    <Ionicons name="alert-circle" size={14} color="#DC2626" />
                    <Text style={styles.identicalWarningText}>Source and destination cannot be the same.</Text>
                  </View>
                )}
              </View>
            )}

            {/* Category Section (For Expense & Income) */}
            {tabType !== 'Transfer' && (
              <>
                <Text style={styles.fieldSectionLabel}>Category</Text>
                <View style={styles.categoryPillsWrap}>
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        activeOpacity={0.7}
                        onPress={() => setSelectedCategory(cat)}
                        style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                      >
                        <Text
                          style={[
                            styles.categoryPillText,
                            isSelected && styles.categoryPillTextSelected,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Paid Via Section */}
            <Text style={styles.fieldSectionLabel}>Payment Rail</Text>
            <View style={styles.railChipsRow}>
              {paymentRails.map((rail) => {
                const isSelected = selectedRail === rail;
                return (
                  <TouchableOpacity
                    key={rail}
                    activeOpacity={0.7}
                    onPress={() => setSelectedRail(rail)}
                    style={[styles.railChip, isSelected && styles.railChipSelected]}
                  >
                    <Text
                      style={[
                        styles.railChipText,
                        isSelected && styles.railChipTextSelected,
                      ]}
                    >
                      {rail}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </ScrollView>

          {/* Save Transaction Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.saveButton,
              tabType === 'Income'
                ? { backgroundColor: '#16A34A' }
                : tabType === 'Transfer'
                  ? { backgroundColor: '#4F46E5' }
                  : { backgroundColor: '#0F172A' },
            ]}
            onPress={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>
                {tabType === 'Income'
                  ? 'Record Income (+)'
                  : tabType === 'Transfer'
                    ? 'Transfer Between Sources'
                    : 'Record Expense (−)'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandle: {
    width: 44,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  uploadShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  uploadShortcutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
    marginLeft: 4,
  },
  segmentedToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentButtonExpenseActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonIncomeActive: {
    backgroundColor: '#DCFCE7',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonTransferActive: {
    backgroundColor: '#EEF2FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  segmentTextExpenseActive: {
    fontWeight: '700',
    color: '#0F172A',
  },
  segmentTextIncomeActive: {
    fontWeight: '700',
    color: '#15803D',
  },
  segmentTextTransferActive: {
    fontWeight: '700',
    color: '#4F46E5',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 10,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  merchantInputContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  merchantInput: {
    fontSize: 13,
    color: '#0F172A',
  },
  sectionWrap: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  questionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
    marginTop: 2,
  },
  sourceGrid: {
    gap: 6,
    marginTop: 6,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  sourceCardSelected: {
    borderColor: '#0F172A',
    backgroundColor: '#F1F5F9',
  },
  sourceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sourceIconWrapSelected: {
    backgroundColor: '#0F172A',
  },
  sourceTextWrap: {
    flex: 1,
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  sourceTitleSelected: {
    color: '#0F172A',
    fontWeight: '700',
  },
  sourceSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  sourceSubtitleSelected: {
    color: '#334155',
  },
  fieldSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  categoryPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryPillSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  categoryPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  categoryPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  railChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  railChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  railChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  railChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  railChipTextSelected: {
    color: '#FFFFFF',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  saveButton: {
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  transferPreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  transferPreviewBox: {
    flex: 1,
  },
  transferPreviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366F1',
    textTransform: 'uppercase',
  },
  transferPreviewValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E1B4B',
    marginTop: 2,
  },
  identicalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  identicalWarningText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
});