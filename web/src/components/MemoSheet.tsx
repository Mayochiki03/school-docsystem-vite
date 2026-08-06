// src/components/MemoSheet.tsx
// แบบฟอร์มบันทึกข้อความมาตรฐาน — ใช้ทั้งตอน "พิมพ์จริง" (หน้ารายละเอียดเอกสาร) และตอน
// "พรีวิวเรียลไทม์" (หน้าสร้าง/แก้ไขเอกสาร) จากไฟล์เดียวกัน เพื่อให้สิ่งที่เห็นตอนกรอก
// ตรงกับสิ่งที่จะพิมพ์จริงเป๊ะๆ ไม่ต้องดูแลสองที่ให้ตรงกันเอง
import { TEXT_SIGNATURE_PREFIX } from './SignaturePad';
import type { FormField } from '../api/client';

export function fmtDateThai(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ลายเซ็นเก็บได้ 2 แบบ: รูปภาพ (data:image/... จากวาด/อัปโหลด) หรือข้อความล้วน (พิมพ์ชื่อ)
export function SignatureMark({ value }: { value?: string | null }) {
  if (!value) return null;
  if (value.startsWith(TEXT_SIGNATURE_PREFIX)) {
    const name = value.slice(TEXT_SIGNATURE_PREFIX.length);
    return <span className="italic underline" style={{ fontSize: 18 }}>{name}</span>;
  }
  return <img src={value} />;
}

// แสดงค่าฟิลด์หนึ่งช่องตามชนิดของมัน — ใช้ร่วมกันทั้งตารางและแถวข้อความธรรมดา
function renderFieldValue(f: FormField, raw: any) {
  if (f.type === 'checkbox') return raw === 'true' ? '☑' : '☐';
  if (raw === undefined || raw === null || raw === '') return '-';
  return String(raw);
}

// ฟิลด์ตาราง (type: 'table') — value เป็น array ของแถว {colKey: value}
function TableFieldBlock({ f, rows }: { f: FormField; rows: any }) {
  const list: Record<string, string>[] = Array.isArray(rows) ? rows : [];
  const cols = f.columns || [];
  if (cols.length === 0) return null;
  return (
    <div className="a4-row" key={f.key}>
      <b style={{ display: 'block', marginBottom: '.3rem' }}>{f.label}</b>
      <table className="a4-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            {cols.map(c => <th key={c.key}>{c.label || c.key}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', color: '#999' }}>-</td></tr>
          ) : list.map((row, ri) => (
            <tr key={ri}>
              <td style={{ textAlign: 'center' }}>{ri + 1}</td>
              {cols.map(c => <td key={c.key}>{row[c.key] || ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface MemoSheetDoc {
  subject: string;
  docNumber?: string | null;
  docYear?: string | null;
  createdAt?: string | null;
  fields?: Record<string, any>;
  creatorSignature?: string | null;
  createdByName?: string | null;
  createdByPosition?: string | null;
}

// แบบฟอร์มบันทึกข้อความมาตรฐาน — ใช้กับเอกสารทุกประเภทเหมือนกันหมด อ้างอิงหน้าตาจากระบบเดิม:
// หัวกระดาษ/เรื่อง/เรียน/เนื้อหา + บล็อกลงชื่อผู้จัดทำและผู้เกษียนหนังสือ
export default function MemoSheet({ doc, type, history = [], schoolName }: {
  doc: MemoSheetDoc; type: any; history?: any[]; schoolName: string;
}) {
  const fieldsByKey: Record<string, any> = doc.fields || {};
  const knownKeys = ['to', 'content', 'signerName', 'signerPosition'];
  const extraFields: FormField[] = (type?.formSchema || []).filter((f: any) => !knownKeys.includes(f.key));
  const endorseEntry = history.find((h: any) => h.action === 'endorsed' && h.signatureImage);

  return (
    <div className="a4-page">
      <div className="a4-title">{type?.headerTitle || 'บันทึกข้อความ'}</div>
      <div className="a4-school">{schoolName}</div>
      <div className="a4-topline">
        <span>ที่ {doc.docNumber || '-'} / {doc.docYear || '-'}</span>
        <span>วันที่ {fmtDateThai(doc.createdAt)}</span>
      </div>
      <div className="a4-row"><b>เรื่อง</b> {doc.subject || '-'}</div>
      {fieldsByKey.to && <div className="a4-row"><b>เรียน</b> {fieldsByKey.to}</div>}
      {extraFields.map((f: FormField) => (
        f.type === 'table'
          ? <TableFieldBlock key={f.key} f={f} rows={fieldsByKey[f.key]} />
          : <div className="a4-row" key={f.key}><b>{f.label}</b> {renderFieldValue(f, fieldsByKey[f.key])}</div>
      ))}
      {fieldsByKey.content && <div className="a4-content">{fieldsByKey.content}</div>}

      <div className="a4-signblock-right">
        <div className="a4-sigline"><SignatureMark value={doc.creatorSignature} /></div>
        <div>({fieldsByKey.signerName || doc.createdByName || '-'})</div>
        <div>ตำแหน่ง {fieldsByKey.signerPosition || doc.createdByPosition || '-'}</div>
      </div>
      {endorseEntry && (
        <div className="a4-signblock-left">
          {endorseEntry.note ? <div className="a4-note-lines">{endorseEntry.note}</div> : <div className="a4-note-lines">&nbsp;</div>}
          <div className="a4-sigline"><SignatureMark value={endorseEntry.signatureImage} /></div>
          <div>({endorseEntry.actorName})</div>
          <div>{fmtDateThai(endorseEntry.timestamp)}</div>
        </div>
      )}
    </div>
  );
}
