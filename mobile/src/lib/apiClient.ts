import { getSecureItem } from '../lib/secureStorage';

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const expoConfig: any = Constants.expoConfig || (Constants as any).manifest2?.extra?.expoClient || {};
const hostUri = expoConfig.hostUri || (Constants as any).manifest?.debuggerHost || 'localhost:8081';
const host = hostUri.split(':')[0] || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
const resolvedHost = Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')
  ? '10.0.2.2'
  : host;

const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${resolvedHost}:3000/api`;

async function request(path: string, options: RequestInit = {}) {
  const token = await getSecureItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detailText = Array.isArray(data?.details)
      ? data.details.map((detail: any) => `${detail.path ? `${detail.path}: ` : ''}${detail.message}`).join('; ')
      : (typeof data?.details === 'string' ? data.details : '');
    throw new Error([data?.message || `Request failed: ${response.status}`, detailText].filter(Boolean).join(': '));
  }
  return data;
}

export const apiClient = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};