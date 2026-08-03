// src/pages/admin/AdminSettings.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Settings, ToggleLeft } from 'lucide-react';

const MENUS = [
  { key: 'createDocument', label: 'สร้างเอกสารใหม่' },
  { key: 'inbox', label: 'งานที่รอดำเนินการ' },
  { key: 'dutyRoster', label: 'เวรครู' },
  { key: 'guardChecklist', label: 'เช็คลิสต์เวรยาม' },
  { key: 'vehicleLog', label: 'บันทึกรถเข้า-ออก' },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  function load() {
    api.get('/api/settings').then(s => { setSettings(s); setToggles(s.featureToggles || {}); });
  }
  useEffect(() => { load(); }, []);

  async function save(patch: any) {
    const updated = await api.put('/api/settings', patch);
    setSettings(updated);
  }
  async function toggleFeature(key: string) {
    const next = { ...toggles, [key]: toggles[key] === false ? true : false };
    setToggles(next);
    await api.put('/api/settings', { featureToggles: next });
  }

  if (!settings) return <p className="text-sm text-slate-400">กำลังโหลด...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2"><Settings size={20} />ตั้งค่าระบบ</h1>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">ชื่อโรงเรียน</label>
          <input defaultValue={settings.schoolName} onBlur={e => save({ schoolName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><ToggleLeft size={16} />เปิด/ปิดเมนูฟังก์ชัน</h2>
        <p className="text-xs text-slate-500 mb-2">ปิดเมนูที่ไม่ต้องการให้แสดงในระบบ (มีผลกับผู้ใช้ทุกคนที่มีสิทธิ์เข้าเมนูนั้น)</p>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          {MENUS.map(m => {
            const on = toggles[m.key] !== false;
            return (
              <div key={m.key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{m.label}</span>
                <button type="button" onClick={() => toggleFeature(m.key)}
                  className={`w-11 h-6 p-0 border-0 rounded-full relative transition-colors shrink-0 appearance-none cursor-pointer ${on ? 'bg-[var(--color-primary)]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
