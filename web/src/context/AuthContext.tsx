// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User, type Department } from '../api/client';

interface AuthState {
  user: User | null;
  departments: Department[];
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await api.get('/api/me');
      setUser(data.user);
      setDepartments(data.departments || []);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // มือถือเปิดแอพผ่าน push notification หรือสลับกลับมาจาก background บ่อยๆ ตอนที่ session/เน็ตยังไม่พร้อมเต็มที่
  // ตัวนี้ช่วยให้แอพเช็คสถานะล็อกอินใหม่ทันทีที่กลับมาอยู่หน้าจอ แทนที่จะค้างสถานะเก่าที่อาจหลุดไปแล้วเงียบๆ
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') refresh();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  async function login(username: string, password: string) {
    const data = await api.post('/api/login', { username, password });
    setUser(data.user);
    await refresh();
  }

  async function logout() {
    await api.post('/api/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, departments, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องใช้ภายใน AuthProvider');
  return ctx;
}
