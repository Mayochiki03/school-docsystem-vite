// src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { Building2, Lock, User as UserIcon } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || t('loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] px-4">
      <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center mb-3">
            <Building2 size={28} />
          </div>
          <h1 className="text-lg font-semibold text-center">{t('appName')}</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('username')}</label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                autoFocus
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('password')}</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-60 transition"
          >
            {busy ? t('loading') : t('login')}
          </button>
          <p className="text-xs text-center text-slate-400 pt-2">
            {t('forgotPasswordHint')}
          </p>
        </form>
      </div>
    </div>
  );
}
