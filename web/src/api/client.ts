// src/api/client.ts
// ไคลเอนต์เรียก API หลังบ้าน — ใช้ cookie session (credentials: 'include') เหมือนระบบเดิม

const BASE = ''; // ใช้ path สัมพัทธ์ ผ่าน Vite proxy ตอน dev / เสิร์ฟจากพอร์ตเดียวกันตอน build จริง

async function request(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
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
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select';
  required?: boolean;
  default?: string;
  options?: string[];
  maxLength?: number;
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
