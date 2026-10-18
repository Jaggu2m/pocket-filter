import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  ScrollView,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../src/lib/apiClient';
import { Colors } from '../src/constants/colors';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Alternative {
  suggestion: string;
  reason: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  decision?: string;
  tradeoffs?: string[];
  alternative?: Alternative | null;
  createdAt?: string;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

// ─── Intent Badges ───────────────────────────────────────────────────────────
const INTENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  TRANSACTION_QUERY:   { label: 'Transactions',  icon: 'receipt-outline',     color: '#6366F1' },
  SPENDING_DIAGNOSTIC: { label: 'Diagnosis',     icon: 'pulse-outline',       color: '#F59E0B' },
  BUDGET_QUERY:        { label: 'Budget',         icon: 'wallet-outline',      color: '#157A4F' },
  GOAL_PROGRESS:       { label: 'Goals',          icon: 'flag-outline',        color: '#EC4899' },
  PURCHASE_SIMULATION: { label: 'Simulation',     icon: 'calculator-outline',  color: '#3B82F6' },
  DEBT_QUERY:          { label: 'EMI / Debt',     icon: 'card-outline',        color: '#EF4444' },
  ACCOUNT_BALANCE:     { label: 'Balance',        icon: 'trending-up-outline', color: '#10B981' },
  INCOME_QUERY:        { label: 'Income',         icon: 'cash-outline',        color: '#059669' },
  GENERAL_FINANCE:     { label: 'Overview',       icon: 'compass-outline',     color: '#8B5CF6' },
};

const DECISION_META: Record<string, { color: string; bg: string; icon: string }> = {
  AFFORDABLE:              { color: '#157A4F', bg: '#E8F5E9', icon: 'checkmark-circle' },
  AFFORDABLE_WITH_CAUTION: { color: '#D97706', bg: '#FEF3C7', icon: 'alert-circle' },
  NOT_RECOMMENDED:         { color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle' },
};

// ─── Suggested Prompts ───────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  'How much did I spend on food this month?',
  'Why did my expenses increase?',
  'Can I afford a ₹40,000 phone next month?',
  'Am I on track with my emergency fund?',
  'How much do I earn monthly?',
  'What are my active EMIs?',
  'What is my total account balance?',
  'What happens if I take a ₹15,000 EMI?',
];

// ─── Typing Indicator ────────────────────────────────────────────────────────
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      );
    Animated.parallel([anim(dot1, 0), anim(dot2, 150), anim(dot3, 300)]).start();
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingAvatar}>
        <Ionicons name="sparkles" size={12} color="#FFFFFF" />
      </View>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const intentMeta = msg.intent ? INTENT_LABELS[msg.intent] : null;
  const decisionMeta = msg.decision ? DECISION_META[msg.decision] : null;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAssistant,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <View style={styles.avatarPill}>
            <Ionicons name="sparkles" size={13} color="#FFFFFF" />
          </View>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {/* Intent Badge */}
        {!isUser && intentMeta && (
          <View style={[styles.intentBadge, { backgroundColor: intentMeta.color + '18' }]}>
            <Ionicons name={intentMeta.icon as any} size={11} color={intentMeta.color} />
            <Text style={[styles.intentLabel, { color: intentMeta.color }]}>{intentMeta.label}</Text>
          </View>
        )}
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {msg.content}
        </Text>
        {/* Decision Badge */}
        {!isUser && decisionMeta && msg.decision && (
          <View style={[styles.decisionBadge, { backgroundColor: decisionMeta.bg }]}>
            <Ionicons name={decisionMeta.icon as any} size={14} color={decisionMeta.color} />
            <Text style={[styles.decisionText, { color: decisionMeta.color }]}>
              {msg.decision.replace(/_/g, ' ')}
            </Text>
          </View>
        )}
        {/* Tradeoffs */}
        {!isUser && msg.tradeoffs && msg.tradeoffs.length > 0 && (
          <View style={styles.tradeoffsContainer}>
            {msg.tradeoffs.map((t, i) => (
              <View key={i} style={styles.tradeoffItem}>
                <View style={styles.tradeoffDot} />
                <Text style={styles.tradeoffText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {/* Alternative Suggestion */}
        {!isUser && msg.alternative && (
          <View style={styles.alternativeCard}>
            <View style={styles.alternativeHeader}>
              <Ionicons name="bulb-outline" size={13} color="#B45309" />
              <Text style={styles.alternativeTitle}>Suggestion</Text>
            </View>
            <Text style={styles.alternativeSuggestion}>{msg.alternative.suggestion}</Text>
            <Text style={styles.alternativeReason}>{msg.alternative.reason}</Text>
          </View>
        )}
      </View>
      {isUser && (
        <View style={styles.userAvatar}>
          <Feather name="user" size={14} color="#FFFFFF" />
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CopilotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiClient.get('/copilot/conversations');
      setConversations(data.conversations || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    setInput('');
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const data = await apiClient.post('/copilot/chat', {
        message: query,
        conversationId,
      });

      setConversationId(data.conversationId);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        intent: data.intent,
        decision: data.decision,
        tradeoffs: data.tradeoffs,
        alternative: data.alternative,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);
      loadHistory();
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an issue: ${err.message || 'Please try again.'}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, conversationId, scrollToBottom, loadHistory]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await apiClient.get(`/copilot/conversations/${id}`);
      const msgs: Message[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        intent: m.intent,
        decision: m.decision,
        tradeoffs: m.tradeoffs,
        alternative: m.alternative,
        createdAt: m.created_at,
      }));
      setMessages(msgs);
      setConversationId(id);
      setShowHistory(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
    } catch {
      Alert.alert('Error', 'Could not load conversation.');
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    Alert.alert('Delete Conversation', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/copilot/conversations/${id}`);
            if (conversationId === id) {
              setConversationId(null);
              setMessages([]);
            }
            loadHistory();
          } catch {
            Alert.alert('Error', 'Could not delete conversation.');
          }
        },
      },
    ]);
  }, [conversationId, loadHistory]);

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeftGroup}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHistory(!showHistory)} style={styles.headerBtn}>
              <Ionicons name="time-outline" size={21} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <View style={styles.headerLogo}>
              <Ionicons name="sparkles" size={15} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Finance Copilot</Text>
              <Text style={styles.headerSubtitle}>AI financial guide</Text>
            </View>
          </View>
          <TouchableOpacity onPress={startNewChat} style={styles.headerBtn}>
            <Feather name="edit-2" size={17} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* ── History Drawer ── */}
        {showHistory && (
          <View style={styles.historyDrawer}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Conversations</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
              {conversations.length === 0 ? (
                <Text style={styles.historyEmpty}>No conversations yet</Text>
              ) : (
                conversations.map((conv) => (
                  <View key={conv.id} style={styles.historyItem}>
                    <TouchableOpacity
                      style={styles.historyItemContent}
                      onPress={() => loadConversation(conv.id)}
                    >
                      <View style={styles.historyIconWrap}>
                        <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyItemTitle} numberOfLines={1}>{conv.title}</Text>
                        <Text style={styles.historyItemMeta}>
                          {conv.message_count} messages · {new Date(conv.updated_at).toLocaleDateString('en-IN')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteConversation(conv.id)} style={styles.historyDelete}>
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Messages List ── */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={[
            styles.messagesList,
            isEmpty && styles.messagesListEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="sparkles" size={38} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Your Finance Copilot</Text>
              <Text style={styles.emptySubtitle}>
                Ask me anything about your money — spending, budgets, goals, EMIs, and more.
              </Text>
              <View style={styles.suggestionsGrid}>
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionChip}
                    onPress={() => sendMessage(prompt)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={loading ? <TypingIndicator /> : null}
          onContentSizeChange={scrollToBottom}
        />

        {/* ── Suggestions Bar (when chatting) ── */}
        {!isEmpty && messages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickSuggestScroll}
            contentContainerStyle={styles.quickSuggestContent}
          >
            {SUGGESTED_PROMPTS.slice(0, 5).map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.quickChip}
                onPress={() => sendMessage(p)}
                activeOpacity={0.75}
              >
                <Text style={styles.quickChipText} numberOfLines={1}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Input Bar ── */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your finances..."
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>
            Calculated from your actual records. Not certified financial advice.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
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
    gap: 8,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
  },

  // History Drawer
  historyDrawer: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 100,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  historyList: {
    flex: 1,
  },
  historyEmpty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 40,
    fontSize: 14,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.subtle,
  },
  historyItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  historyItemMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  historyDelete: {
    padding: 8,
  },

  // Messages
  messagesList: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    flexGrow: 1,
  },
  messagesListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  assistantAvatar: {
    marginRight: 8,
    marginBottom: 2,
  },
  avatarPill: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    marginLeft: 8,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: {
    fontSize: 14.5,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  bubbleTextAssistant: {
    color: Colors.text,
  },

  // Intent Badge
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 7,
    gap: 4,
  },
  intentLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Decision
  decisionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  decisionText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Tradeoffs
  tradeoffsContainer: {
    marginTop: 10,
    gap: 5,
  },
  tradeoffItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  tradeoffDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 7,
  },
  tradeoffText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  // Alternative Card
  alternativeCard: {
    marginTop: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
  },
  alternativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  alternativeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  alternativeSuggestion: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  alternativeReason: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 3,
    lineHeight: 17,
  },

  // Typing Indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  typingAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 14,
    gap: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  suggestionText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },

  // Quick Suggestions Bar
  quickSuggestScroll: {
    maxHeight: 44,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  quickSuggestContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  quickChip: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    maxWidth: 200,
  },
  quickChipText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Input Bar
  inputBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.subtle,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
    marginBottom: 2,
  },
});
