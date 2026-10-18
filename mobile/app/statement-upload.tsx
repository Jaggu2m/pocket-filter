import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { financialService } from '../src/services/financialService';

export default function StatementUploadScreen() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('Processing...');
  const [preview, setPreview] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const accs = await financialService.listAccounts();
      if (Array.isArray(accs)) {
        setAccounts(accs);
      }
    } catch {
      // Non-blocking: accounts optional under money-source model
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) return;

      let name = file.name || 'statement.pdf';
      let mimeType = file.mimeType || 'application/pdf';
      const isCsv = name.toLowerCase().endsWith('.csv') || mimeType.includes('csv');
      const isPdf = name.toLowerCase().endsWith('.pdf') || mimeType.includes('pdf') || (!isCsv && !name.includes('.'));

      if (isPdf) {
        if (!name.toLowerCase().endsWith('.pdf')) name = `${name}.pdf`;
        mimeType = 'application/pdf';
      } else if (isCsv) {
        if (!name.toLowerCase().endsWith('.csv')) name = `${name}.csv`;
        mimeType = 'text/csv';
      }

      setUploadMessage('Parsing bank statement...');
      setUploading(true);
      setPreview(null);

      const data = await financialService.uploadStatement({
        uri: file.uri,
        name,
        type: mimeType,
      });

      processUploadResponse(data, name, isPdf ? 'pdf' : 'csv');
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message || 'Could not process file. Ensure it is a valid bank statement PDF or CSV.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Permission to access your photo gallery is required to upload screenshots.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      let name = asset.fileName || `screenshot_${Date.now()}.jpg`;
      if (!name.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)) {
        name = `${name}.jpg`;
      }
      const mimeType = asset.mimeType || 'image/jpeg';

      setUploadMessage('Running OCR & extracting transaction data...');
      setUploading(true);
      setPreview(null);

      const data = await financialService.uploadStatement({
        uri: asset.uri,
        name,
        type: mimeType,
        base64: asset.base64 || undefined,
      });

      processUploadResponse(data, name, 'image');
    } catch (e: any) {
      Alert.alert('Image Scan Failed', e?.message || 'Could not extract transaction from screenshot. Please try a clearer screenshot.');
    } finally {
      setUploading(false);
    }
  };

  const handleCapturePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to capture receipt photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      let name = `receipt_${Date.now()}.jpg`;
      const mimeType = 'image/jpeg';

      setUploadMessage('Analyzing receipt with OCR...');
      setUploading(true);
      setPreview(null);

      const data = await financialService.uploadStatement({
        uri: asset.uri,
        name,
        type: mimeType,
        base64: asset.base64 || undefined,
      });

      processUploadResponse(data, name, 'image');
    } catch (e: any) {
      Alert.alert('Receipt Scan Failed', e?.message || 'Could not extract details from receipt photo.');
    } finally {
      setUploading(false);
    }
  };

  const processUploadResponse = (data: any, fileName: string, defaultFileType: 'pdf' | 'csv' | 'image') => {
    const resData = data?.data || data;
    const rows: any[] = resData?.transactions || [];
    const fileType = resData?.fileType || defaultFileType;

    if (!rows || rows.length === 0) {
      Alert.alert('No Transactions Found', 'The uploaded file could not be parsed into valid transactions.');
      return;
    }

    setPreview({
      rows,
      fileName: resData?.fileName || fileName,
      fileType,
      duplicateCount: resData?.duplicateCount || 0,
    });

    // Auto-select non-duplicate rows by default
    const ids = new Set<string>();
    rows.forEach((row, idx) => {
      if (!row.isDuplicate) ids.add(String(idx));
    });
    // If all are marked duplicates, select all anyway to let user override
    if (ids.size === 0) {
      rows.forEach((_, idx) => ids.add(String(idx)));
    }
    setSelectedRows(ids);
  };

  const toggleRow = (idx: string) => {
    const s = new Set(selectedRows);
    if (s.has(idx)) s.delete(idx);
    else s.add(idx);
    setSelectedRows(s);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    const selected = preview.rows.filter((_: any, i: number) => selectedRows.has(String(i)));
    if (selected.length === 0) {
      Alert.alert('No transactions selected', 'Please select at least one transaction to import.');
      return;
    }

    setConfirming(true);
    try {
      const formattedTransactions = selected.map((tx: any) => ({
        date: tx.date,
        merchant: tx.merchant || undefined,
        description: tx.description || tx.merchant || 'Imported Transaction',
        amount: Number(tx.amount),
        type: tx.type === 'income' ? 'income' : 'expense',
        category: tx.category || 'General',
        importHash: tx.importHash || undefined,
      }));

      await financialService.confirmStatementImport({
        fileName: preview.fileName,
        fileType: preview.fileType || 'pdf',
        accountId: selectedAccountId || undefined,
        transactions: formattedTransactions,
      });

      const destName = selectedAccountId
        ? accounts.find((a) => a.id === selectedAccountId)?.name || 'Account'
        : 'Unspecified Balance';

      Alert.alert(
        '✅ Import Complete',
        `${selected.length} transactions imported and balances updated for ${destName}.`,
        [{ text: 'Done', onPress: () => { setPreview(null); router.back(); } }]
      );
    } catch (e: any) {
      Alert.alert('Import Failed', e?.message || 'Could not import transactions.');
    } finally {
      setConfirming(false);
    }
  };

  // Preview Totals
  const selectedTransactions = preview
    ? preview.rows.filter((_: any, i: number) => selectedRows.has(String(i)))
    : [];
  const totalIncome = selectedTransactions
    .filter((tx: any) => tx.type === 'income')
    .reduce((sum: number, tx: any) => sum + (parseFloat(tx.amount) || 0), 0);
  const totalExpense = selectedTransactions
    .filter((tx: any) => tx.type !== 'income')
    .reduce((sum: number, tx: any) => sum + (parseFloat(tx.amount) || 0), 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Transactions</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="sparkles" size={20} color="#4F46E5" style={{ marginTop: 2 }} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.infoTitle}>Smart Ingestion Engine</Text>
            <Text style={styles.infoDesc}>
              Upload bank statements (PDF, CSV) or payment screenshots from GPay, PhonePe, Paytm, or receipts. Pocket Filter extracts amounts, merchants, and dates automatically.
            </Text>
          </View>
        </View>

        {/* Loading Spinner */}
        {uploading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#157A4F" />
            <Text style={styles.loadingText}>{uploadMessage}</Text>
            <Text style={styles.loadingSubtext}>This may take a few seconds...</Text>
          </View>
        )}

        {/* Upload Options (Hidden while uploading or previewing) */}
        {!preview && !uploading && (
          <>
            <Text style={styles.sectionTitle}>Choose Ingestion Method</Text>

            {/* Option 1: Bank / Card Statement */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={handlePickDocument}
              activeOpacity={0.75}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="document-text" size={26} color="#4F46E5" />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Bank / Card Statement</Text>
                <Text style={styles.cardSubtitle}>Upload official PDF or exported CSV statements</Text>
                <View style={styles.tagRow}>
                  <View style={styles.tagBadge}><Text style={styles.tagText}>PDF</Text></View>
                  <View style={[styles.tagBadge, { backgroundColor: '#DCFCE7' }]}><Text style={[styles.tagText, { color: '#15803D' }]}>CSV</Text></View>
                  <Text style={styles.formatHint}>Up to 2,000 transactions</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 2: Screenshot from Gallery */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={handlePickImage}
              activeOpacity={0.75}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="image" size={26} color="#D97706" />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Payment Screenshot</Text>
                <Text style={styles.cardSubtitle}>GPay, PhonePe, Paytm, SMS, or digital receipts</Text>
                <View style={styles.tagRow}>
                  <View style={[styles.tagBadge, { backgroundColor: '#FEF3C7' }]}><Text style={[styles.tagText, { color: '#B45309' }]}>JPEG / PNG</Text></View>
                  <Text style={styles.formatHint}>Instant OCR Reader</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 3: Camera Snap */}
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={handleCapturePhoto}
              activeOpacity={0.75}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="camera" size={26} color="#15803D" />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Snap Receipt Photo</Text>
                <Text style={styles.cardSubtitle}>Capture physical bill or POS printout</Text>
                <View style={styles.tagRow}>
                  <View style={[styles.tagBadge, { backgroundColor: '#E0F2FE' }]}><Text style={[styles.tagText, { color: '#0369A1' }]}>Camera</Text></View>
                  <Text style={styles.formatHint}>Automatic total extraction</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* Tips Card */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Tips for best extraction:</Text>
              <Text style={styles.tipItem}>• For GPay / PhonePe: Take a screenshot of the "Payment Successful" screen with the amount and recipient clearly visible.</Text>
              <Text style={styles.tipItem}>• For Bank Statements: Unlocked PDF statements or standard CSV exports work best.</Text>
            </View>
          </>
        )}

        {/* Transaction Preview Section */}
        {preview && (
          <>
            {/* Preview Header */}
            <View style={styles.previewHeaderCard}>
              <View style={styles.previewHeaderTop}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[
                      styles.fileTypeBadge,
                      preview.fileType === 'pdf' && { backgroundColor: '#FEE2E2' },
                      preview.fileType === 'csv' && { backgroundColor: '#DCFCE7' },
                      preview.fileType === 'image' && { backgroundColor: '#FEF3C7' },
                    ]}>
                      <Text style={[
                        styles.fileTypeBadgeText,
                        preview.fileType === 'pdf' && { color: '#DC2626' },
                        preview.fileType === 'csv' && { color: '#15803D' },
                        preview.fileType === 'image' && { color: '#B45309' },
                      ]}>
                        {preview.fileType.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {preview.fileName}
                    </Text>
                  </View>
                  <Text style={styles.previewSubtitle}>
                    {preview.rows.length} transaction{preview.rows.length !== 1 ? 's' : ''} detected
                    {preview.duplicateCount > 0 ? ` · ${preview.duplicateCount} duplicate(s) unselected` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setPreview(null)} style={styles.reUploadBtn}>
                  <Feather name="refresh-cw" size={14} color="#475569" />
                  <Text style={styles.reUploadText}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* Destination Account Selector */}
              <View style={styles.accountSelectorBox}>
                <Text style={styles.accountSelectorLabel}>Money Source Destination:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.accountChip,
                      selectedAccountId === null && styles.accountChipActive,
                    ]}
                    onPress={() => setSelectedAccountId(null)}
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={14}
                      color={selectedAccountId === null ? '#FFF' : '#475569'}
                    />
                    <Text
                      style={[
                        styles.accountChipText,
                        selectedAccountId === null && styles.accountChipTextActive,
                      ]}
                    >
                      General / Unspecified
                    </Text>
                  </TouchableOpacity>

                  {accounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountChip,
                        selectedAccountId === acc.id && styles.accountChipActive,
                      ]}
                      onPress={() => setSelectedAccountId(acc.id)}
                    >
                      <Ionicons
                        name="business-outline"
                        size={14}
                        color={selectedAccountId === acc.id ? '#FFF' : '#475569'}
                      />
                      <Text
                        style={[
                          styles.accountChipText,
                          selectedAccountId === acc.id && styles.accountChipTextActive,
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Summary Stats */}
              <View style={styles.summaryBar}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Selected</Text>
                  <Text style={styles.summaryValue}>{selectedTransactions.length}</Text>
                </View>
                {totalIncome > 0 && (
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Income</Text>
                    <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                      +₹{totalIncome.toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
                {totalExpense > 0 && (
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Expense</Text>
                    <Text style={[styles.summaryValue, { color: '#0F172A' }]}>
                      -₹{totalExpense.toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Select All Toggle */}
            <View style={styles.listControlRow}>
              <TouchableOpacity
                style={styles.selectAllBtn}
                onPress={() => {
                  if (selectedRows.size === preview.rows.length) setSelectedRows(new Set());
                  else setSelectedRows(new Set(preview.rows.map((_: any, i: number) => String(i))));
                }}
              >
                <Ionicons
                  name={selectedRows.size === preview.rows.length ? 'checkbox' : 'square-outline'}
                  size={20}
                  color="#157A4F"
                />
                <Text style={styles.selectAllText}>
                  {selectedRows.size === preview.rows.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.selectedCountText}>
                {selectedRows.size} of {preview.rows.length} selected
              </Text>
            </View>

            {/* Transaction Items */}
            {preview.rows.map((row: any, i: number) => {
              const isSelected = selectedRows.has(String(i));
              const isIncome = row.type === 'income';
              const displayDate = row.date ? new Date(row.date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }) : 'Recent';

              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.txCard, !isSelected && styles.txCardUnselected]}
                  onPress={() => toggleRow(String(i))}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? '#157A4F' : '#CBD5E1'}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.txTitle} numberOfLines={1}>
                        {row.merchant || row.description || 'Transaction'}
                      </Text>
                      {row.isDuplicate && (
                        <View style={styles.dupBadge}>
                          <Text style={styles.dupBadgeText}>Duplicate</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.txMeta}>
                      {displayDate} · {row.category || 'General'}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, isIncome ? styles.txIncome : styles.txExpense]}>
                    {isIncome ? '+' : '-'}₹{Math.abs(parseFloat(row.amount) || 0).toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Confirm Button */}
            <TouchableOpacity
              style={[styles.confirmBtn, confirming && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.8}
            >
              {confirming ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  Import {selectedRows.size} Transaction{selectedRows.size !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#C7D2FE' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#3730A3', marginBottom: 4 },
  infoDesc: { fontSize: 12, color: '#4338CA', lineHeight: 18 },
  loadingCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', marginVertical: 20 },
  loadingText: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 16 },
  loadingSubtext: { fontSize: 12, color: '#64748B', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  uploadCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 8, lineHeight: 16 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  formatHint: { fontSize: 11, color: '#94A3B8' },
  tipsCard: { backgroundColor: '#F1F5F9', borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  tipItem: { fontSize: 12, color: '#64748B', lineHeight: 18, marginBottom: 4 },
  previewHeaderCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  previewHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  fileTypeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  fileTypeBadgeText: { fontSize: 10, fontWeight: '800' },
  previewFileName: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  previewSubtitle: { fontSize: 12, color: '#64748B' },
  reUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reUploadText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  accountSelectorBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  accountSelectorLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  accountChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  accountChipActive: { backgroundColor: '#157A4F', borderColor: '#157A4F' },
  accountChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  accountChipTextActive: { color: '#FFF' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#64748B', marginBottom: 2 },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  listControlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 13, fontWeight: '700', color: '#157A4F' },
  selectedCountText: { fontSize: 12, color: '#64748B' },
  txCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  txCardUnselected: { opacity: 0.45 },
  txTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  txMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  dupBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  dupBadgeText: { fontSize: 9, fontWeight: '700', color: '#B45309' },
  txAmount: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
  txIncome: { color: '#15803D' },
  txExpense: { color: '#0F172A' },
  confirmBtn: { backgroundColor: '#157A4F', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16, shadowColor: '#157A4F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  confirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
