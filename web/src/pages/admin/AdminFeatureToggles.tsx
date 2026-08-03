// src/pages/admin/AdminFeatureToggles.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ToggleLeft } from 'lucide-react';

const MENUS = [
  { key: 'createDocument', label: 'สร้างเอกสารใหม่' },
  { key: 'inbox', label: 'งานที่รอดำเนินการ' },
  { key: 'dutyRoster', label: 'เวรครู' },
  { key: 'guardChecklist', label: 'เช็คลิสต์เวรยาม' },
  { key: 'vehicleLog', label: 'บันทึกรถเข้า-ออก' },
];

export default function AdminFeatureToggles() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  function load() { api.get('/api/admin/feature-toggles').then(setToggles); }
  useEffect(() => { load(); }, []);

  async function toggle(key: string) {
    const next = { ...toggles, [key]: toggles[key] === false ? true : false };
    setToggles(next);
    await api.put('/api/admin/feature-toggles', { featureToggles: next });
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><ToggleLeft size={20} />เปิด/ปิดเมนูฟังก์ชัน</h1>
      <p className="text-sm text-slate-500">ปิดเมนูที่ไม่ต้องการให้แสดงในระบบ (มีผลกับผู้ใช้ทุกคนที่มีสิทธิ์เข้าเมนูนั้น)</p>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {MENUS.map(m => {
          const on = toggles[m.key] !== false;
          return (
            <div key={m.key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{m.label}</span>
              <button onClick={() => toggle(m.key)}
                className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-[var(--color-primary)]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
