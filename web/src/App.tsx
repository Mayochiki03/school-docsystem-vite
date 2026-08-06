// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './context/I18nContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DocumentList from './pages/documents/DocumentList';
import DocumentCreate from './pages/documents/DocumentCreate';
import DocumentDetail from './pages/documents/DocumentDetail';
import DocumentEdit from './pages/documents/DocumentEdit';
import Notifications from './pages/Notifications';
import Duty from './pages/Duty';
import Guard from './pages/Guard';
import Vehicles from './pages/Vehicles';
import Announcements from './pages/Announcements';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDocumentTypes from './pages/admin/AdminDocumentTypes';
import AdminSettings from './pages/admin/AdminSettings';
import AdminBackups from './pages/admin/AdminBackups';
import AdminDuty from './pages/admin/AdminDuty';
import AdminTranslations from './pages/admin/AdminTranslations';
import AdminSystemLog from './pages/admin/AdminSystemLog';

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" replace />;
  // ครอบ ErrorBoundary รอบเนื้อหาหน้า (ไม่ครอบ Layout) — ถ้าหน้าใดพังระหว่างแสดงผล แถบเมนู/นำทาง
  // ยังใช้งานได้ปกติ ผู้ใช้กดไปหน้าอื่นต่อได้เลย ไม่ต้องเจอจอขาวเปล่าที่กดอะไรไม่ได้เลย
  return <Layout><ErrorBoundary key={typeof window !== 'undefined' ? window.location.pathname : undefined}>{children}</ErrorBoundary></Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
              <Route path="/documents/new" element={<Private><DocumentCreate /></Private>} />
              <Route path="/documents/inbox" element={<Private><DocumentList box="inbox" titleKey="inbox" /></Private>} />
              <Route path="/documents/review" element={<Private><DocumentList box="pending_office_review" titleKey="pendingReview" /></Private>} />
              <Route path="/documents/mine" element={<Private><DocumentList box="created" titleKey="myDocuments" /></Private>} />
              <Route path="/documents/all" element={<Private><DocumentList box="all" titleKey="documents" /></Private>} />
              <Route path="/documents/trash" element={<Private><DocumentList box="trash" titleKey="trash" /></Private>} />
              <Route path="/documents/:id" element={<Private><DocumentDetail /></Private>} />
              <Route path="/documents/:id/edit" element={<Private><DocumentEdit /></Private>} />
              <Route path="/notifications" element={<Private><Notifications /></Private>} />
              <Route path="/duty" element={<Private><Duty /></Private>} />
              <Route path="/guard" element={<Private><Guard /></Private>} />
              <Route path="/vehicles" element={<Private><Vehicles /></Private>} />
              <Route path="/announcements" element={<Private><Announcements /></Private>} />
              <Route path="/admin/users" element={<Private><AdminUsers /></Private>} />
              <Route path="/admin/document-types" element={<Private><AdminDocumentTypes /></Private>} />
              <Route path="/admin/settings" element={<Private><AdminSettings /></Private>} />
              <Route path="/admin/backups" element={<Private><AdminBackups /></Private>} />
              <Route path="/admin/duty" element={<Private><AdminDuty /></Private>} />
              <Route path="/admin/translations" element={<Private><AdminTranslations /></Private>} />
              <Route path="/admin/system-log" element={<Private><AdminSystemLog /></Private>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
