import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather, Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { financialService } from '../src/services/financialService';

const ACCOUNT_TYPES = [
  { key: 'bank', label: 'Bank Account', icon: 'account-balance', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'credit_card', label: 'Credit Card', icon: 'credit-card', color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'cash', label: 'Cash / Wallet', icon: 'wallet', color: '#059669', bg: '#ECFDF5' },
  { key: 'upi_wallet', label: 'UPI Wallet', icon: 'phone-android', color: '#D97706', bg: '#FFFBEB' },
  { key: 'investment', label: 'Investment', icon: 'trending-up', color: '#7C3AED', bg: '#F5F3FF' },
];

export default function AccountSettingsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // New account form state
  const [newType, setNewType] = useState('bank');
  const [newName, setNewName] = useState('');
  const [newInstitution, setNewInstitution] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newLast4, setNewLast4] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await financialService.listAccounts();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAccounts(); }, [loadAccounts]));

  const handleAddAccount = async () => {
    if (!newName.trim()) { setFormError('Account name is required'); return; }
    if (!newBalance || isNaN(parseFloat(newBalance))) { setFormError('Enter a valid balance'); return; }
    setFormError('');
    setSaving(true);
    try {
      const payload: any = {
        type: newType,
        name: newName.trim(),
        balance: parseFloat(newBalance),
      };
      if (newInstitution.trim()) payload.institutionName = newInstitution.trim();
      if (newLast4.trim()) payload.accountNumberLast4 = newLast4.trim();
      if (newType === 'credit_card' && newCreditLimit) payload.creditLimit = parseFloat(newCreditLimit);
      await financialService.createAccount(payload);
      setShowAddModal(false);
      resetForm();
      loadAccounts();
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setNewType('bank');
    setNewName('');
    setNewInstitution('');
    setNewBalance('');
    setNewLast4('');
    setNewCreditLimit('');
    setFormError('');
  };

  const handleDelete = (account: any) => {
    Alert.alert(
      'Remove Account',
      `Remove "${account.name || account.institutionName}"? This will not delete your transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await financialService.deleteAccount(account.id);
              loadAccounts();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not remove account');
            }
          },
        },
      ]
    );
  };

  const getTypeInfo = (type: string) => {
    return ACCOUNT_TYPES.find(t => t.key === type) || ACCOUNT_TYPES[0];
  };

  const bankAccounts = accounts.filter(a => a.type === 'bank');
  const creditCards = accounts.filter(a => a.type === 'credit_card');
  const others = accounts.filter(a => a.type !== 'bank' && a.type !== 'credit_card');

  const renderAccountRow = (account: any, index: number, arr: any[]) => {
    const typeInfo = getTypeInfo(account.type);
    const isLast = index === arr.length - 1;
    return (
      <View key={account.id}>
        <View style={styles.accountRow}>
          <View style={[styles.accountIconWrap, { backgroundColor: typeInfo.bg }]}>
            {account.type === 'credit_card'
              ? <FontAwesome5 name="credit-card" size={15} color={typeInfo.color} />
              : <MaterialIcons name={typeInfo.icon as any} size={18} color={typeInfo.color} />
            }
          </View>
          <View style={styles.accountDetails}>
            <Text style={styles.accountName}>
              {account.institutionName || account.name}
              {account.accountNumberLast4 ? ` •••${account.accountNumberLast4}` : ''}
            </Text>
            <Text style={styles.accountBalance}>₹{parseFloat(account.balance || 0).toLocaleString('en-IN')}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(account)} style={styles.deleteBtn}>
            <Feather name="trash-2" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
        {!isLast && <View style={styles.divider} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Linked Accounts</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { resetForm(); setShowAddModal(true); }}
          >
            <Feather name="plus" size={20} color="#157A4F" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#157A4F" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Bank Accounts */}
            {bankAccounts.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Bank Accounts</Text>
                <View style={styles.card}>
                  {bankAccounts.map((a, i) => renderAccountRow(a, i, bankAccounts))}
                </View>
              </>
            )}

            {/* Credit Cards */}
            {creditCards.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Credit Cards</Text>
                <View style={styles.card}>
                  {creditCards.map((a, i) => renderAccountRow(a, i, creditCards))}
                </View>
              </>
            )}

            {/* Others */}
            {others.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Wallets & Investments</Text>
                <View style={styles.card}>
                  {others.map((a, i) => renderAccountRow(a, i, others))}
                </View>
              </>
            )}

            {accounts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No accounts linked</Text>
                <Text style={styles.emptySubtitle}>Add your bank accounts and credit cards to track balances.</Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => { resetForm(); setShowAddModal(true); }}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Add Account Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.modalTitle}>Add Account</Text>

          {/* Type Selector */}
          <Text style={styles.fieldLabel}>Account Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ACCOUNT_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setNewType(t.key)}
                  style={[styles.typePill, newType === t.key && styles.typePillActive]}
                >
                  <Text style={[styles.typePillText, newType === t.key && styles.typePillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Account Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. HDFC Salary Account"
            placeholderTextColor="#94A3B8"
            value={newName}
            onChangeText={setNewName}
          />

          <Text style={styles.fieldLabel}>Institution / Bank</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. HDFC Bank"
            placeholderTextColor="#94A3B8"
            value={newInstitution}
            onChangeText={setNewInstitution}
          />

          <Text style={styles.fieldLabel}>Current Balance (₹) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
            value={newBalance}
            onChangeText={setNewBalance}
          />

          <Text style={styles.fieldLabel}>Last 4 Digits</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2111"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={4}
            value={newLast4}
            onChangeText={setNewLast4}
          />

          {newType === 'credit_card' && (
            <>
              <Text style={styles.fieldLabel}>Credit Limit (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 200000"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={newCreditLimit}
                onChangeText={setNewCreditLimit}
              />
            </>
          )}

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleAddAccount}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Add Account</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#BBFCE0' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#FFF', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#EDF2F7', marginBottom: 16, elevation: 1 },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  accountIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  accountDetails: { flex: 1 },
  accountName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  accountBalance: { fontSize: 12, color: '#64748B', marginTop: 2 },
  deleteBtn: { padding: 8 },
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  emptyAddBtn: { marginTop: 20, backgroundColor: '#157A4F', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyAddBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  dragHandle: { width: 44, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', marginBottom: 12 },
  typePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
  typePillActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  typePillText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  typePillTextActive: { color: '#FFF', fontWeight: '600' },
  errorText: { color: '#DC2626', fontSize: 12, marginBottom: 10 },
  saveBtn: { backgroundColor: '#157A4F', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});