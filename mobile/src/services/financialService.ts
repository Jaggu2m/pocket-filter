import { apiClient } from '../lib/apiClient';

export const financialService = {
  getDashboard: async (month?: string) => {
    const res: any = await apiClient.get(`/dashboard/summary${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  listTransactions: async (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    const res: any = await apiClient.get(`/transactions${query}`);
    return res.data;
  },
  listGoals: async () => {
    const res: any = await apiClient.get('/goals');
    return res.data;
  },
  createGoal: async (payload: any) => {
    const res: any = await apiClient.post('/goals', payload);
    return res.data;
  },
  updateGoal: async (id: string, payload: any) => {
    const res: any = await apiClient.patch(`/goals/${id}`, payload);
    return res.data;
  },
  deleteGoal: async (id: string) => apiClient.delete(`/goals/${id}`),
  addGoalContribution: async (id: string, payload: any) => {
    const res: any = await apiClient.post(`/goals/${id}/contributions`, payload);
    return res.data;
  },
  getGoalHealth: async (id: string, month?: string) => {
    const res: any = await apiClient.get(`/goals/${id}/health${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  listGoalHealth: async () => {
    const res: any = await apiClient.get('/goals/health');
    return res.data;
  },
  getGoalImpact: async (id: string, amount: number, month?: string) => {
    const res: any = await apiClient.get(`/goals/${id}/impact?amount=${amount}${month ? `&month=${month}` : ''}`);
    return res.data;
  },
  listBudgets: async (month?: string) => {
    const res: any = await apiClient.get(`/budgets${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  getCurrentBudget: async (month?: string) => {
    const res: any = await apiClient.get(`/budgets/current${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  createBudget: async (payload: any) => {
    const res: any = await apiClient.post('/budgets', payload);
    return res.data;
  },
  getBudgetPace: async (month?: string, overallLimit?: number) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (overallLimit) params.set('overallLimit', String(overallLimit));
    const res: any = await apiClient.get(`/budgets/pace${params.toString() ? `?${params}` : ''}`);
    return res.data;
  },
  listAccounts: async () => {
    const res: any = await apiClient.get('/accounts');
    return res.data?.accounts ?? res.data ?? [];
  },
  getAccountSummary: async () => {
    const res: any = await apiClient.get('/accounts/summary');
    return res.data?.summary ?? res.data;
  },
  createAccount: async (payload: any) => {
    const res: any = await apiClient.post('/accounts', payload);
    return res.data?.account ?? res.data;
  },
  updateAccount: async (id: string, payload: any) => {
    const res: any = await apiClient.patch(`/accounts/${id}`, payload);
    return res.data?.account ?? res.data;
  },
  updateUnspecifiedBalance: async (balance: number) => {
    const res: any = await apiClient.patch('/accounts/unspecified-balance', { balance });
    return res.data;
  },
  deleteAccount: async (id: string) => apiClient.delete(`/accounts/${id}`),
  uploadStatement: async (file: { uri: string; name: string; type: string; base64?: string }) => {
    const { getSecureItem } = await import('../lib/secureStorage');
    const { Platform } = await import('react-native');
    const Constants = (await import('expo-constants')).default;
    const expoConfig: any = Constants.expoConfig || (Constants as any).manifest2?.extra?.expoClient || {};
    const hostUri = expoConfig.hostUri || (Constants as any).manifest?.debuggerHost || 'localhost:8081';
    const host = hostUri.split(':')[0] || 'localhost';
    const resolvedHost = Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1') ? '10.0.2.2' : host;
    const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${resolvedHost}:3000/api`;
    const token = await getSecureItem('accessToken');

    let fileName = file.name || 'statement.pdf';
    let mimeType = file.type || 'application/pdf';
    const lowerName = fileName.toLowerCase();

    let detectedType: 'pdf' | 'csv' | 'image' = 'pdf';
    if (lowerName.endsWith('.csv') || mimeType.includes('csv')) {
      detectedType = 'csv';
      mimeType = 'text/csv';
    } else if (
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp') ||
      mimeType.startsWith('image/')
    ) {
      detectedType = 'image';
      mimeType = lowerName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    }

    // Helper: read URI to base64
    const readUriAsBase64 = async (uri: string): Promise<string> => {
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = () => reject(new Error('Failed to read local file as blob'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
    };

    // Strategy 1: If base64 is already present or can be read, post JSON directly
    let base64String = file.base64;
    if (!base64String && file.uri) {
      try {
        base64String = await readUriAsBase64(file.uri);
      } catch {
        // Fallback to XHR multipart if readUriAsBase64 fails
      }
    }

    if (base64String) {
      const response = await fetch(`${API_URL}/statement/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          base64: base64String,
          fileName,
          fileType: detectedType,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Upload failed');
      return data;
    }

    // Strategy 2: Native XMLHttpRequest with FormData (does NOT touch Expo's fetch)
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      if (Platform.OS === 'web') {
        fetch(file.uri)
          .then((r) => r.blob())
          .then((blob) => {
            formData.append('file', blob, fileName);
            sendXhr();
          })
          .catch(() => {
            formData.append('file', { uri: file.uri, name: fileName, type: mimeType } as any);
            sendXhr();
          });
      } else {
        formData.append('file', { uri: file.uri, name: fileName, type: mimeType } as any);
        sendXhr();
      }

      function sendXhr() {
        xhr.open('POST', `${API_URL}/statement/preview`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed?.message || `Upload failed with status ${xhr.status}`));
            }
          } catch {
            reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network request failed during upload'));
        xhr.send(formData);
      }
    });
  },
  confirmStatementImport: async (payload: any) => {
    const res: any = await apiClient.post('/statement/confirm', payload);
    return res.data;
  },
  getStatementHistory: async () => {
    const res: any = await apiClient.get('/statement/history');
    return res.data;
  },
  createTransaction: async (payload: any) => {
    const res: any = await apiClient.post('/transactions', payload);
    return res.data;
  },
  updateTransaction: async (id: string, payload: any) => {
    const res: any = await apiClient.patch(`/transactions/${id}`, payload);
    return res.data;
  },
  deleteTransaction: async (id: string) => apiClient.delete(`/transactions/${id}`),
  getTransaction: async (id: string) => {
    const res: any = await apiClient.get(`/transactions/${id}`);
    return res.data;
  },
  listRecurringPayments: async () => {
    const res: any = await apiClient.get('/recurring-payments');
    return res.data;
  },
  createRecurringPayment: async (payload: { merchantName: string; amount: number; frequency?: string; category?: string; nextExpectedDate?: string }) => {
    const res: any = await apiClient.post('/recurring-payments', payload);
    return res.data?.recurringPayment || res.data;
  },
  deleteRecurringPayment: async (id: string) => {
    return apiClient.delete(`/recurring-payments/${id}`);
  },
  detectRecurringPayments: async () => {
    const res: any = await apiClient.post('/recurring-payments/detect');
    return res.data;
  },
  confirmRecurringPayment: async (id: string) => {
    const res: any = await apiClient.patch(`/recurring-payments/${id}/confirm`);
    return res.data;
  },
  dismissRecurringPayment: async (id: string) => {
    const res: any = await apiClient.patch(`/recurring-payments/${id}/dismiss`);
    return res.data;
  },
  getMonthEndForecast: async (month?: string) => {
    const res: any = await apiClient.get(`/forecast/month-end${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  getAnomalies: async (month?: string) => {
    const res: any = await apiClient.get(`/anomalies${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  simulate: async (payload: any) => {
    const res: any = await apiClient.post('/simulations', payload);
    return res.data;
  },
  getAIInsights: async (type: string, month?: string) => {
    const res: any = await apiClient.get(`/ai/${type}/explanation${month ? `?month=${month}` : ''}`);
    return res.data;
  },
  listNotifications: async (unreadOnly?: boolean) => {
    const res: any = await apiClient.get(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`);
    return res;
  },
  getUnreadNotificationCount: async () => {
    const res: any = await apiClient.get('/notifications/unread-count');
    return res.unreadCount || 0;
  },
  markNotificationRead: async (id: string) => {
    const res: any = await apiClient.patch(`/notifications/${id}/read`);
    return res;
  },
  markAllNotificationsRead: async () => {
    const res: any = await apiClient.patch('/notifications/read-all');
    return res;
  },
  getMonthlyReview: async (month?: string) => {
    const res: any = await apiClient.get(`/financial-review/monthly${month ? `?month=${month}` : ''}`);
    return res;
  },
  getSpendingDiagnostics: async (month?: string) => {
    const res: any = await apiClient.get(`/spending/diagnostics${month ? `?month=${month}` : ''}`);
    return res;
  },
  evaluateInsightsAndAlerts: async () => {
    const res: any = await apiClient.post('/insights/evaluate');
    return res;
  },
};