import { apiClient } from '../lib/apiClient';
import { setSecureItem, removeSecureItem } from '../lib/secureStorage';

export const authService = {
  async register(payload: { email: string; password: string; firstName?: string }) {
    const res = await apiClient.post('/auth/register', payload);
    if (res.data?.tokens?.accessToken) {
      await setSecureItem('accessToken', res.data.tokens.accessToken);
      await setSecureItem('refreshToken', res.data.tokens.refreshToken);
    }
    return res.data;
  },
  async login(payload: { email: string; password: string }) {
    const res = await apiClient.post('/auth/login', payload);
    if (res.data?.tokens?.accessToken) {
      await setSecureItem('accessToken', res.data.tokens.accessToken);
      await setSecureItem('refreshToken', res.data.tokens.refreshToken);
    }
    return res.data;
  },
  async logout() {
    await removeSecureItem('accessToken');
    await removeSecureItem('refreshToken');
  },
};