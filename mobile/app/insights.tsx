import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../src/constants/colors';
import { apiClient } from '../src/lib/apiClient';

export default function InsightsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'REVIEW' | 'DIAGNOSTICS'>('REVIEW');
  const [reviewData, setReviewData] = useState<any>(null);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [review, diagnostics] = await Promise.all([
        apiClient.get('/financial-review/monthly'),
        apiClient.get('/spending/diagnostics'),
      ]);
      setReviewData(review);
      setDiagnosticsData(diagnostics);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const healthColor = (status: string) => {
    if (status === 'GREEN' || status === 'COMPLETED') return '#157A4F';
    if (status === 'YELLOW') return '#D97706';
    return '#DC2626';
  };

  const healthBg = (status: string) => {
    if (status === 'GREEN' || status === 'COMPLETED') return '#E8F5E9';
    if (status === 'YELLOW') return '#FEF3C7';
    return '#FEE2E2';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="sparkles" size={17} color="#6366F1" />
          <Text style={styles.headerTitle}>Financial Insights</Text>
        </View>
        <TouchableOpacity
          style={styles.copilotBtn}
          onPress={() => router.push('/copilot')}
          activeOpacity={0.7}
        >
          <Text style={styles.copilotBtnText}>Ask AI</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'REVIEW' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('REVIEW')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'REVIEW' && styles.segmentTextActive]}>
            Monthly Review
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'DIAGNOSTICS' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('DIAGNOSTICS')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'DIAGNOSTICS' && styles.segmentTextActive]}>
            Spending Causal Drivers
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {activeTab === 'REVIEW' && reviewData && (
            <View style={styles.sectionWrap}>
              {/* Month Banner */}
              <View style={styles.metricsCard}>
                <Text style={styles.reviewMonthTitle}>{reviewData.monthName} Performance</Text>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Income</Text>
                    <Text style={[styles.metricValue, { color: '#059669' }]}>
                      ₹{(reviewData.metrics?.income || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Expenses</Text>
                    <Text style={[styles.metricValue, { color: '#DC2626' }]}>
                      ₹{(reviewData.metrics?.expenses || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Net Savings</Text>
                    <Text style={[styles.metricValue, { color: Colors.primary }]}>
                      ₹{(reviewData.metrics?.netSavings || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Savings Rate</Text>
                    <Text style={[styles.metricValue, { color: '#6366F1' }]}>
                      {reviewData.metrics?.savingsRate || 0}%
                    </Text>
                  </View>
                </View>
              </View>

              {/* AI Coach Narrative Box */}
              {reviewData.aiNarrative && (
                <View style={styles.aiBox}>
                  <View style={styles.aiBoxHeader}>
                    <Ionicons name="sparkles" size={15} color="#6366F1" />
                    <Text style={styles.aiBoxTitle}>AI Financial Coach</Text>
                  </View>
                  <Text style={styles.aiBoxText}>{reviewData.aiNarrative}</Text>
                </View>
              )}

              {/* What Went Well */}
              {reviewData.whatWentWell?.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="checkmark-done-circle" size={18} color="#157A4F" />
                    <Text style={styles.cardTitle}>What Went Well</Text>
                  </View>
                  {reviewData.whatWentWell.map((w: string, i: number) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bulletDot, { backgroundColor: '#157A4F' }]} />
                      <Text style={styles.bulletText}>{w}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* What Changed */}
              {reviewData.whatChanged?.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="trending-up" size={18} color="#D97706" />
                    <Text style={styles.cardTitle}>What Changed</Text>
                  </View>
                  {reviewData.whatChanged.map((c: string, i: number) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bulletDot, { backgroundColor: '#D97706' }]} />
                      <Text style={styles.bulletText}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Major Drivers */}
              {reviewData.majorDrivers?.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="pie-chart-outline" size={18} color="#4F46E5" />
                    <Text style={styles.cardTitle}>Major Spending Drivers</Text>
                  </View>
                  {reviewData.majorDrivers.map((d: string, i: number) => (
                    <View key={i} style={styles.driverRow}>
                      <Text style={styles.driverNum}>{i + 1}.</Text>
                      <Text style={styles.driverText}>{d}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Goal Health */}
              {reviewData.goalHealth?.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="flag-outline" size={18} color={Colors.primary} />
                    <Text style={styles.cardTitle}>Goal Health</Text>
                  </View>
                  {reviewData.goalHealth.map((g: any, i: number) => (
                    <View key={i} style={styles.goalRow}>
                      <Text style={styles.goalName}>{g.name}</Text>
                      <View style={[styles.goalPill, { backgroundColor: healthBg(g.status) }]}>
                        <View style={[styles.statusDot, { backgroundColor: healthColor(g.status) }]} />
                        <Text style={[styles.goalStatusText, { color: healthColor(g.status) }]}>
                          {g.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Suggested Focus */}
              {reviewData.suggestedFocus && (
                <View style={styles.focusCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="bulb-outline" size={18} color="#92400E" />
                    <Text style={styles.focusTitle}>Suggested Focus</Text>
                  </View>
                  <Text style={styles.focusText}>{reviewData.suggestedFocus}</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'DIAGNOSTICS' && diagnosticsData && (
            <View style={styles.sectionWrap}>
              {/* Causal Explanation Box */}
              <View style={styles.aiBox}>
                <View style={styles.aiBoxHeader}>
                  <Ionicons name="pulse" size={16} color="#6366F1" />
                  <Text style={styles.aiBoxTitle}>Causal Diagnostic Summary</Text>
                </View>
                <Text style={styles.aiBoxText}>{diagnosticsData.explanation}</Text>
              </View>

              {/* Top Category Deviations */}
              <Text style={styles.subheading}>Top Spending Increases vs 3-Mo Baseline</Text>
              {(diagnosticsData.topDeviations || []).map((dev: any, i: number) => (
                <View key={i} style={styles.card}>
                  <View style={styles.devHeader}>
                    <View>
                      <Text style={styles.devCategory}>{dev.category}</Text>
                      <Text style={styles.devBaseline}>
                        Baseline: ₹{dev.baseline.toLocaleString('en-IN')} → Current: ₹{dev.current.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.devBadge}>
                      <Text style={styles.devBadgeText}>+{dev.changePercent}%</Text>
                    </View>
                  </View>

                  {/* Merchant Contributors */}
                  {dev.contributors?.length > 0 && (
                    <View style={styles.contributorsWrap}>
                      <Text style={styles.contribTitle}>Key Merchant Contributors:</Text>
                      {dev.contributors.map((c: any, ci: number) => (
                        <View key={ci} style={styles.contribRow}>
                          <View style={styles.contribLeft}>
                            <Text style={styles.contribMerchant}>{c.merchant}</Text>
                            {c.isNew && (
                              <View style={styles.newBadge}>
                                <Text style={styles.newBadgeText}>NEW</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.contribAmt}>+₹{c.increase.toLocaleString('en-IN')}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              {/* Micro Anomalies */}
              {diagnosticsData.microAnomalies?.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="warning-outline" size={18} color="#D97706" />
                    <Text style={styles.cardTitle}>Micro Anomalies Detected</Text>
                  </View>
                  {diagnosticsData.microAnomalies.map((a: any, i: number) => (
                    <View key={i} style={styles.anomalyItem}>
                      <Text style={styles.anomalyTitle}>{a.title}</Text>
                      <Text style={styles.anomalyDesc}>{a.description}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.subtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  copilotBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  copilotBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Segment
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: Colors.subtle,
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },

  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionWrap: {
    gap: 12,
  },

  // Metrics Card
  metricsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewMonthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metricItem: {
    width: '50%',
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // AI Box
  aiBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  aiBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aiBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
  aiBoxText: {
    fontSize: 13.5,
    color: '#312E81',
    lineHeight: 20,
  },

  // Standard Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bulletText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },

  // Drivers
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  driverNum: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  driverText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },

  // Goals
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.subtle,
  },
  goalName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text,
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goalStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Suggested Focus
  focusCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  focusTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#92400E',
  },
  focusText: {
    fontSize: 13.5,
    color: '#78350F',
    lineHeight: 19,
    fontWeight: '500',
  },

  // Diagnostics Tab
  subheading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  devHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  devCategory: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  devBaseline: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  devBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  devBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  contributorsWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.subtle,
  },
  contribTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  contribRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  contribLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contribMerchant: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  newBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4F46E5',
  },
  contribAmt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Anomaly
  anomalyItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.subtle,
  },
  anomalyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  anomalyDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
