// src/api/client.ts
// ไคลเอนต์เรียก API หลังบ้าน — ใช้ cookie session (credentials: 'include') เหมือนระบบเดิม

const BASE = ''; // ใช้ path สัมพัทธ์ ผ่าน Vite proxy ตอน dev / เสิร์ฟจากพอร์ตเดียวกันตอน build จริง

// เวลาที่รอ response สูงสุดก่อนจะยกเลิกคำขอเอง (กันเคสมือถือเพิ่งตื่นจาก background เช่น
// กดเข้าแอพผ่าน push notification แล้วซิกแนลเน็ต/ไวไฟยังไม่กลับมาเต็มที่ — ถ้าไม่มี timeout
// fetch จะค้างเงียบๆ ได้เป็นนาที ทำให้แอพดูเหมือน "โหลดไม่ขึ้น")
const REQUEST_TIMEOUT_MS = 15000;

async function request(method: string, path: string, body?: any): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err: any = new Error('การเชื่อมต่อช้าเกินไป กรุณาลองใหม่อีกครั้ง');
      err.status = 0;
      err.isTimeout = true;
      throw err;
    }
    const err: any = new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    err.status = 0;
    err.isNetworkError = true;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  let data: any = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err: any = new Error((data && data.error) || `เกิดข้อผิดพลาด (HTTP ${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: any) => request('POST', path, body ?? {}),
  put: (path: string, body?: any) => request('PUT', path, body ?? {}),
  del: (path: string) => request('DELETE', path)
};

// ---------- Types ----------
export interface User {
  id: string;
  username: string;
  fullName: string;
  position: string;
  role: 'admin' | 'director' | 'office_head' | 'staff' | 'guard';
  active: boolean;
  departmentIds: string[];
  extraPermissions?: string[];
}

export interface Department {
  id: string;
  name: string;
  headUserId?: string | null;
}

export interface DocumentType {
  id: string;
  name: string;
  category: string;
  recipientMode: string;
  requiresScan?: boolean;
  active: boolean;
  formSchema: FormField[];
  headerTitle?: string;
  // เวิร์กโฟลว์การอนุมัติ — 'standard' (ค่าเริ่มต้น): ผ่านหัวหน้าสำนักงานตรวจกรองแล้วส่งต่อ ผอ. เกษียนตามปกติ
  // 'direct_to_dept': ข้ามหัวหน้าสำนักงานและ ผอ. ไปเลย ส่งตรงถึงหัวหน้าแผนกที่กำหนด (เช่น หัวหน้าการเงิน/ทะเบียน/พัสดุ)
  workflowMode?: 'standard' | 'direct_to_dept';
  fixedDeptId?: string | null; // ใช้กับ direct_to_dept — ถ้าไม่ตั้งไว้ ผู้จัดทำเอกสารจะเลือกแผนกปลายทางเองตอนสร้าง
  // ชนิดฟอร์ม — 'digital' (ค่าเริ่มต้น): กรอกในระบบตามปกติ 'static_pdf': ยังไม่รองรับกรอกดิจิทัล
  // แสดงเป็นไฟล์ PDF ให้ดาวน์โหลด/พรีวิว/สั่งพิมพ์แทน (ดู server/static-forms/README.md)
  formKind?: 'digital' | 'static_pdf';
  staticPdfFileName?: string | null;
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'number' | 'time' | 'checkbox' | 'radio' | 'table';
  required?: boolean;
  default?: string;
  options?: string[]; // ใช้กับ select และ radio
  maxLength?: number;
  columns?: TableColumn[]; // ใช้กับ type: 'table' เท่านั้น — นิยามคอลัมน์ของตารางรายการ (แถวเพิ่ม/ลบได้เองตอนกรอก)
}

// คอลัมน์ของฟิลด์ตาราง (type: 'table') — รองรับเฉพาะข้อความ/ตัวเลขต่อช่อง เพื่อให้พิมพ์ง่ายและพรีวิวได้ไว
export interface TableColumn {
  key: string;
  label: string;
  type: 'text' | 'number';
}

export interface Attachment {
  id: string;
  documentId: string;
  taskId?: string | null;
  fileName: string;
  filePath: string;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface DocDoc {
  id: string;
  docNumber: string;
  docYear: string;
  typeId: string;
  typeName?: string;
  subject: string;
  fields: Record<string, any>;
  confidential: boolean;
  status: string;
  createdBy: string;
  createdByName?: string;
  dueDate: string | null;
  createdAt: string;
  officeComment?: string;
  creatorSignature?: string | null;
}

export interface Capability {
  key: string;
  label: string;
}
