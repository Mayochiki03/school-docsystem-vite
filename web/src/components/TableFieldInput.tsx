// src/components/TableFieldInput.tsx
// อินพุตสำหรับฟิลด์ชนิด "ตาราง" (type: 'table') — เพิ่ม/ลบแถวได้เอง ใช้ร่วมกันทั้งหน้าสร้างเอกสารและหน้าแก้ไข
import { Plus, Trash2 } from 'lucide-react';
import type { TableColumn } from '../api/client';
import { useI18n } from '../context/I18nContext';

export type TableRow = Record<string, string>;

function emptyRow(columns: TableColumn[]): TableRow {
  const row: TableRow = {};
  columns.forEach(c => { row[c.key] = ''; });
  return row;
}

export default function TableFieldInput({
  columns, value, onChange
}: {
  columns: TableColumn[];
  value: TableRow[];
  onChange: (rows: TableRow[]) => void;
}) {
  const { t } = useI18n();
  const rows = value && value.length > 0 ? value : [emptyRow(columns)];

  function updateCell(ri: number, key: string, v: string) {
    const next = rows.map((r, idx) => (idx === ri ? { ...r, [key]: v } : r));
    onChange(next);
  }
  function addRow() {
    onChange([...rows, emptyRow(columns)]);
  }
  function removeRow(ri: number) {
    const next = rows.filter((_, idx) => idx !== ri);
    onChange(next.length > 0 ? next : [emptyRow(columns)]);
  }

  if (!columns || columns.length === 0) {
    return <p className="text-xs text-amber-600">{t('tableFieldNoColumns')}</p>;
  }

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60">
            <th className="px-2 py-1.5 text-xs font-medium text-slate-500 w-8 text-center">#</th>
            {columns.map(c => (
              <th key={c.key} className="px-2 py-1.5 text-xs font-medium text-slate-500 text-left">{c.label || c.key}</th>
            ))}
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-[var(--color-border)]">
              <td className="px-2 py-1 text-xs text-slate-400 text-center">{ri + 1}</td>
              {columns.map(c => (
                <td key={c.key} className="px-1 py-1">
                  <input
                    type={c.type === 'number' ? 'number' : 'text'}
                    value={row[c.key] || ''}
                    onChange={e => updateCell(ri, c.key, e.target.value)}
                    className="w-full px-2 py-1 rounded border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] bg-transparent text-sm focus:outline-none"
                  />
                </td>
              ))}
              <td className="px-1 py-1 text-center">
                <button type="button" onClick={() => removeRow(ri)} className="text-slate-300 hover:text-rose-600"><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-[var(--color-primary)] border-t border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <Plus size={13} /> {t('tableFieldAddRow')}
      </button>
    </div>
  );
}
