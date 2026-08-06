// src/components/Layout.tsx
import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Inbox, ShieldCheck, Trash2, PlusCircle, Bell,
  ClipboardList, ShieldAlert, Car, Megaphone, Settings, Users, Activity,
  FileStack, Database, Menu, X, LogOut, Sun, Moon, Globe, UserCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/client';

interface NavItem {
  to: string; label: string; icon: any;
  show: boolean; featureKey?: string;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeAnnouncements, setActiveAnnouncements] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dismissedAnnouncementIds') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    api.get('/api/settings').then(s => setFeatureToggles(s.featureToggles || {})).catch(() => {});
  }, []);

  useEffect(() => {
    // เช็คการแจ้งเตือน/ประกาศระบบใหม่เป็นระยะ ไม่รบกวนงานที่ทำอยู่ (ไม่มี popup บล็อกหน้าจอ)
    function poll() {
      api.get('/api/notifications').then(list => setUnreadCount(list.filter((n: any) => !n.isRead).length)).catch(() => {});
      api.get('/api/announcements/active').then(setActiveAnnouncements).catch(() => {});
    }
    poll();
    const iv = setInterval(poll, 45000);
    return () => clearInterval(iv);
  }, []);

  function dismissAnnouncement(id: string) {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    localStorage.setItem('dismissedAnnouncementIds', JSON.stringify(next));
  }

  if (!user) return <>{children}</>;

  const isAdmin = user.role === 'admin';
  const isGuard = user.role === 'guard';
  const canReview = user.role === 'office_head' || isAdmin || (user as any).extraPermissions?.includes('review_documents');
  const isDirector = user.role === 'director';
  const canManageUsers = isAdmin || user.role === 'office_head';
  const canManageFeatures = isAdmin || user.role === 'office_head';
  const canManageBackups = isAdmin || user.role === 'office_head';
  const canManageDuty = isAdmin || user.role === 'office_head' || (user as any).extraPermissions?.includes('manage_teacher_duty');
  // เช็คลิสต์เวรยาม/บันทึกรถเข้า-ออก: ปกติมีแค่ยาม+แอดมิน (ไว้ทดสอบ) เห็น — คนอื่นไม่เห็นเมนูนี้เลย
  // เว้นแต่แอดมิน/หัวหน้าสำนักงานจะมอบสิทธิ์ guard_duty_access ให้เป็นรายบุคคล (เช่น ครูที่ต้องช่วยเวรยาม)
  const canAccessGuardDuty = isGuard || isAdmin || (user as any).extraPermissions?.includes('view_guard_oversight') || (user as any).extraPermissions?.includes('guard_duty_access');

  function enabled(key: string) {
    // ค่าเริ่มต้นคือเปิด เว้นแต่แอดมินปิดไว้อย่างชัดเจน
    return featureToggles[key] !== false;
  }

  // บัญชียาม (รปภ.) ใช้งานได้แค่ 2 เมนูนี้เท่านั้น ไม่เกี่ยวข้องกับงานสารบรรณ/ธุรการอื่นๆ ของโรงเรียนเลย
  const mainNav: NavItem[] = isGuard ? [] : [
    { to: '/dashboard', label: t('dashboard'), icon: LayoutDashboard, show: true },
    { to: '/documents/new', label: t('createDocument'), icon: PlusCircle, show: enabled('createDocument') },
    { to: '/documents/inbox', label: t('inbox'), icon: Inbox, show: enabled('inbox') },
    { to: '/documents/review', label: t('pendingReview'), icon: ShieldCheck, show: canReview },
    { to: '/documents/mine', label: t('myDocuments'), icon: FileText, show: true },
    { to: '/documents/all', label: t('documents'), icon: FileStack, show: isAdmin || isDirector || user.role === 'office_head' },
    { to: '/documents/trash', label: t('trash'), icon: Trash2, show: canReview || isDirector || isAdmin },
  ];

  const opsNav: NavItem[] = isGuard ? [
    { to: '/guard', label: t('guardChecklist'), icon: ShieldAlert, show: enabled('guardChecklist') && canAccessGuardDuty },
    { to: '/vehicles', label: t('vehicleLog'), icon: Car, show: enabled('vehicleLog') && canAccessGuardDuty },
  ] : [
    { to: '/duty', label: t('dutyRoster'), icon: ClipboardList, show: enabled('dutyRoster') },
    { to: '/guard', label: t('guardChecklist'), icon: ShieldAlert, show: enabled('guardChecklist') && canAccessGuardDuty },
    { to: '/vehicles', label: t('vehicleLog'), icon: Car, show: enabled('vehicleLog') && canAccessGuardDuty },
  ];

  const adminNav: NavItem[] = isGuard ? [] : [
    { to: '/admin/users', label: t('users'), icon: Users, show: canManageUsers || !!(user.role === 'staff' && (user as any).headsDepartment) },
    { to: '/admin/document-types', label: t('documentTypes'), icon: FileStack, show: isAdmin || user.role === 'office_head' },
    { to: '/admin/backups', label: t('backups'), icon: Database, show: canManageBackups },
    { to: '/admin/duty', label: t('navManageDuty'), icon: ClipboardList, show: canManageDuty },
    { to: '/admin/translations', label: t('navTranslations'), icon: Globe, show: isAdmin },
    { to: '/admin/system-log', label: t('navSystemLog'), icon: Activity, show: isAdmin },
    { to: '/announcements', label: t('announcements'), icon: Megaphone, show: isAdmin },
    { to: '/admin/settings', label: t('settings'), icon: Settings, show: isAdmin || canManageFeatures },
  ];

  function NavGroup({ items, title }: { items: NavItem[]; title?: string }) {
    const visible = items.filter(i => i.show);
    if (!visible.length) return null;
    return (
      <div className="mb-4">
        {title && <p className="px-3 mb-1 text-[11px] font-semibold tracking-wide uppercase text-slate-400">{title}</p>}
        {visible.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-[var(--color-border)]">
          <img src="/icon-192.png" alt="SNKDocSystem" className="w-9 h-9 rounded-lg shrink-0" />
          <div className="leading-tight min-w-0">
            <p className="text-sm font-semibold truncate">{t('appName')}</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <NavGroup items={mainNav} />
          <NavGroup items={opsNav} title={t('navOpsGroupTitle')} />
          <NavGroup items={adminNav} title={t('admin')} />
        </nav>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center px-3 sm:px-4 gap-2 sm:gap-3 no-print">
          <button className="lg:hidden shrink-0" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0">
              <UserCircle2 size={20} />
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-semibold truncate max-w-[38vw] sm:max-w-[220px]">{user.fullName}</p>
              <p className="text-xs text-slate-500 truncate max-w-[38vw] sm:max-w-[220px] hidden sm:block">{user.position}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-2 shrink-0">
            <button
              title={t('notifications')}
              onClick={() => navigate('/notifications')}
              className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] leading-4 text-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              title={t('theme')}
              onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <button onClick={() => setLangMenuOpen(v => !v)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1">
                <Globe size={18} />
                <span className="text-xs uppercase hidden sm:inline">{lang}</span>
              </button>
              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLangMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-20">
                    {(['th', 'en', 'zh'] as const).map(l => (
                      <button key={l} onClick={() => { setLang(l); setLangMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
                        {l === 'th' ? 'ไทย' : l === 'en' ? 'English' : '中文'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={async () => { await logout(); navigate('/login'); }}
              title={t('logout')}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </header>
        {activeAnnouncements.filter(a => !dismissedIds.includes(a.id)).map(a => (
          <div key={a.id} className="no-print bg-amber-100 dark:bg-amber-950/50 border-b border-amber-300 dark:border-amber-800 px-4 py-2 flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
            <Megaphone size={15} className="shrink-0" />
            <span className="flex-1 min-w-0">{a.message}</span>
            <button onClick={() => dismissAnnouncement(a.id)} className="shrink-0 p-1 rounded hover:bg-amber-200/60 dark:hover:bg-amber-900/60"><X size={14} /></button>
          </div>
        ))}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
