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
import { Feather, Ionicons } from '@expo/vector-icons';
import { financialService } from '../src/services/financialService';

export default function BorrowedScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await financialService.listTransactions({ category: 'Borrowed Money' });
      const list = data?.transactions || data || [];
      setEntries(Array.isArray(list) ? list : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadEntries(); }, [loadEntries]));

  const totalBorrowed = entries.reduce((sum, e) => sum + Math.abs(parseFloat(e.amount) || 0), 0);

  const handleAdd = async () => {
    if (!person.trim()) { setFormError('Enter person name'); return; }
    if (!amount || isNaN(parseFloat(amount))) { setFormError('Enter valid amount'); return; }
    setFormError('');
    setSaving(true);
    try {
      await financialService.createTransaction({
        type: 'income',
        amount: parseFloat(amount),
        category: 'Borrowed Money',
        description: `Borrowed from ${person.trim()}${note ? ` - ${note}` : ''}`,
        date: new Date().toISOString().slice(0, 10),
        notes: JSON.stringify({ person: person.trim(), dueDate: dueDate || null, note }),
      });
      setShowModal(false);
      resetForm();
      loadEntries();
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setPerson('');
    setAmount('');
    setNote('');
    setDueDate('');
    setFormError('');
  };

  const handleMarkRepaid = (entry: any) => {
    const personName = entry.description?.replace('Borrowed from ', '').split(' - ')[0] || 'person';
    const amt = Math.abs(parseFloat(entry.amount));
    Alert.alert(
      'Mark as Repaid',
      `Record that you repaid ₹${amt.toLocaleString('en-IN')} to ${personName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Repaid',
          onPress: async () => {
            try {
              await financialService.createTransaction({
                type: 'expense',
                amount: amt,
                category: 'Borrowed Money Repaid',
                description: `Repaid: ${entry.description}`,
                date: new Date().toISOString().slice(0, 10),
              });
              Alert.alert('✅ Recorded', 'Repayment recorded as expense.');
              loadEntries();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not record');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Money Borrowed</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowModal(true); }}>
            <Feather name="plus" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Outstanding Debt</Text>
          <Text style={styles.summaryAmount}>₹{totalBorrowed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          <Text style={styles.summaryNote}>{entries.length} active {entries.length === 1 ? 'entry' : 'entries'}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#DC2626" style={{ marginTop: 32 }} />
        ) : entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="arrow-undo-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No borrowed entries</Text>
            <Text style={styles.emptySubtitle}>Track money you've borrowed from friends or family.</Text>
          </View>
        ) : (
          entries.map((entry) => {
            const personName = entry.description?.replace('Borrowed from ', '').split(' - ')[0] || 'Unknown';
            const amt = Math.abs(parseFloat(entry.amount) || 0);
            const date = entry.date ? new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            return (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryAvatar}>
                  <Text style={styles.entryAvatarLetter}>{personName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.entryDetails}>
                  <Text style={styles.entryPerson}>{personName}</Text>
                  <Text style={styles.entryDate}>{date}</Text>
                </View>
                <View style={styles.entryRight}>
                  <Text style={styles.entryAmount}>₹{amt.toLocaleString('en-IN')}</Text>
                  <TouchableOpacity onPress={() => handleMarkRepaid(entry)} style={styles.repaidBtn}>
                    <Text style={styles.repaidBtnText}>Repaid</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.modalTitle}>Record Borrowed Money</Text>

          <Text style={styles.fieldLabel}>Lender Name *</Text>
          <TextInput style={styles.input} placeholder="e.g. Priya" placeholderTextColor="#94A3B8" value={person} onChangeText={setPerson} />

          <Text style={styles.fieldLabel}>Amount (₹) *</Text>
          <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput style={styles.input} placeholder="e.g. Emergency" placeholderTextColor="#94A3B8" value={note} onChangeText={setNote} />

          <Text style={styles.fieldLabel}>Repayment Date</Text>
          <TextInput style={styles.input} placeholder="e.g. 2024-06-15" placeholderTextColor="#94A3B8" value={dueDate} onChangeText={setDueDate} />

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleAdd} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Entry</Text>}
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
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  summaryCard: { backgroundColor: '#7F1D1D', borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: '#FCA5A5' },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: '#FFF', marginTop: 4 },
  summaryNote: { fontSize: 12, color: '#FCA5A5', marginTop: 4 },
  emptyState: { alignItems: 'center', paddingTop: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6 },
  entryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EDF2F7' },
  entryAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  entryAvatarLetter: { fontSize: 18, fontWeight: '700', color: '#DC2626' },
  entryDetails: { flex: 1 },
  entryPerson: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  entryDate: { fontSize: 11, color: '#64748B', marginTop: 2 },
  entryRight: { alignItems: 'flex-end' },
  entryAmount: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  repaidBtn: { marginTop: 6, backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  repaidBtnText: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  dragHandle: { width: 44, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 12, marginBottom: 10 },
  saveBtn: { backgroundColor: '#DC2626', borderRadius: 12, height: 46, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});