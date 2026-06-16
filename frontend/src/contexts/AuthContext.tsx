import { createContext, useContext, useState, useCallback } from 'react';

const TOKEN_KEY = 'zchoose_token';
const USER_KEY = 'zchoose_user';
export const REMEMBER_KEY = 'zchoose_remember';

export interface User {
  userId: number;
  phone?: string;
  /** 用户 | 商家，仅商家可见商家入驻槽位管理 */
  role?: 'user' | 'merchant';
}

export interface RememberedCredentials {
  account: string;
  password: string;
  type: 'phone';
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  /** 更新当前用户信息（如保存资料后同步 role） */
  updateUser: (partial: Partial<User>) => void;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, code: string, password: string) => Promise<void>;
  logout: () => void;
  /** 若 response 为 401 则清除登录状态并返回 true，便于各页统一处理「登录过期」 */
  handleUnauthorized: (response: Response) => boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const REQUEST_TIMEOUT_MS = 15000;

  const login = useCallback(async (phone: string, password: string) => {
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
        signal: ac.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '登录失败');
      }
      const data = await res.json();
      const role = data.role === 'merchant' ? 'merchant' : 'user';
      const userData = { userId: data.userId, phone: data.phone, role };
      setToken(data.token);
      setUser(userData);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        if (err.name === 'AbortError') throw new Error('网络请求超时，请检查网络后重试');
        throw err;
      }
      throw new Error('登录失败，请重试');
    }
  }, []);

  const register = useCallback(async (phone: string, code: string, password: string) => {
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim(), password }),
        signal: ac.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && (data.error || data.message)) || (res.status === 409 ? '该手机号已注册' : res.status === 400 ? '请检查手机号和密码格式' : '注册失败');
        throw new Error(msg);
      }
      const data = await res.json();
      const role = data.role === 'merchant' ? 'merchant' : 'user';
      const userData = { userId: data.userId, phone: data.phone, role };
      setToken(data.token);
      setUser(userData);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        if (err.name === 'AbortError') throw new Error('网络请求超时，请检查网络后重试');
        throw err;
      }
      throw new Error('注册失败，请重试');
    }
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const handleUnauthorized = useCallback((response: Response) => {
    if (response.status === 401) {
      logout();
      return true;
    }
    return false;
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        updateUser,
        login,
        register,
        logout,
        handleUnauthorized,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
