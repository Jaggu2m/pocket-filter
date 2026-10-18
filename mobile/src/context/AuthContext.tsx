import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { getSecureItem, removeSecureItem, setSecureItem } from '../lib/secureStorage';
import { apiClient } from '../lib/apiClient';

export interface AuthUser {
  id?: string;
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile from backend
  const fetchUserProfile = useCallback(async () => {
    try {
      const res: any = await apiClient.get('/auth/profile');
      const u = res?.data?.user ?? res?.user ?? res;
      if (u && (u.id || u.userId || u.email)) {
        setUser({
          id: u.id || u.userId,
          userId: u.userId || u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          name: u.name || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName),
          phone: u.phone,
        });
      }
    } catch {
      // Token may be expired — clear it
      await removeSecureItem('accessToken');
      await removeSecureItem('refreshToken');
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const token = await getSecureItem('accessToken');
    if (token) {
      setIsAuthenticated(true);
      await fetchUserProfile();
    }
    setIsLoading(false);
  }, [fetchUserProfile]);

  useEffect(() => {
    refreshBootstrap();
  }, [refreshBootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login({ email, password });
    const u = data?.user;
    if (u) {
      setUser({
        id: u.id || u.userId,
        userId: u.userId || u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        name: u.name || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName),
        phone: u.phone,
      });
    }
    setIsAuthenticated(true);
    // Fetch full profile to ensure latest data
    fetchUserProfile();
  }, [fetchUserProfile]);

  const register = useCallback(async (email: string, password: string, firstName?: string) => {
    const data = await authService.register({ email, password, firstName });
    const u = data?.user;
    if (u) {
      setUser({
        id: u.id || u.userId,
        userId: u.userId || u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        name: u.name || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName),
        phone: u.phone,
      });
    }
    setIsAuthenticated(true);
    fetchUserProfile();
  }, [fetchUserProfile]);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUserProfile();
  }, [fetchUserProfile]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}