import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { http, setToken, setUnauthorizedHandler } from '../api/http';

export interface AuthUser {
  id: number;
  username: string;
}

interface LoginResp {
  user: AuthUser;
  token: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  signup: (input: SignupInput) => Promise<AuthUser>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  forgotQuestion: (username: string) => Promise<{ username: string; question: string }>;
  verifyForgotAnswer: (username: string, answer: string) => Promise<string>; // returns resetToken
  resetPassword: (resetToken: string, newPassword: string, confirmPassword: string) => Promise<void>;
}

export interface SignupInput {
  username: string;
  password: string;
  security_question: string;
  security_answer: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  /**
   * 全局 401 处理：清 token、跳 /login。
   * 在 AuthProvider 挂载时注册到 http 工具，确保任意 API 401 都能被拦截。
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      // 仅在不在登录页时跳转，避免冲掉当前正在显示的错误
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate]);

  /**
   * 启动时：如果 localStorage 有 token，则尝试调 /me 验证。
   * 验证失败 → 清掉、保持未登录。
   */
  useEffect(() => {
    const existing = localStorage.getItem('yd-token');
    if (!existing) {
      setReady(true);
      return;
    }
    let aborted = false;
    (async () => {
      try {
        const data = await http<{ user: AuthUser }>('/api/auth/me', {
          silent401: true,
        });
        if (!aborted) setUser(data.user);
      } catch {
        // 401 silent401 不会清 token，但用户可能 stale；为稳妥起见清掉
        if (!aborted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!aborted) setReady(true);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await http<LoginResp>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      silent401: true,
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const data = await http<LoginResp>('/api/auth/signup', {
      method: 'POST',
      body: input,
      silent401: true,
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await http('/api/auth/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    });
  }, []);

  const forgotQuestion = useCallback(async (username: string) => {
    return await http<{ username: string; question: string }>(
      '/api/auth/forgot-question',
      { method: 'POST', body: { username }, silent401: true },
    );
  }, []);

  const verifyForgotAnswer = useCallback(async (username: string, answer: string) => {
    const data = await http<{ resetToken: string }>(
      '/api/auth/forgot-verify',
      { method: 'POST', body: { username, answer }, silent401: true },
    );
    return data.resetToken;
  }, []);

  const resetPassword = useCallback(
    async (resetToken: string, newPassword: string, confirmPassword: string) => {
      await http('/api/auth/reset-password', {
        method: 'POST',
        body: { resetToken, newPassword, confirmPassword },
        silent401: true,
      });
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      login,
      signup,
      logout,
      changePassword,
      forgotQuestion,
      verifyForgotAnswer,
      resetPassword,
    }),
    [user, ready, login, signup, logout, changePassword, forgotQuestion, verifyForgotAnswer, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}