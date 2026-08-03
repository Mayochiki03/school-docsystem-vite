// lib/permissions.js
const db = require('../db/sqliteStore');

// ผู้ใช้คนหนึ่งมองเห็นเอกสารได้หรือไม่
function canView(user, doc) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'director') return true;
  if (user.role === 'office_head') return true; // หัวหน้า สนง. เห็นทุกเรื่องที่ผ่านมือ
  if (hasCapability(user, 'review_documents')) return true; // บุคคลที่สามที่ได้รับมอบสิทธิ์ตรวจกรองเอกสาร
  if (doc.createdBy === user.id) return true;

  const myTasks = db.tasks.find(t => t.documentId === doc.id);
  for (const t of myTasks) {
    if (t.assignedToUserId === user.id) return true;
    // สำคัญ: งานที่ส่งถึง "แผนก" ให้เห็นเฉพาะหัวหน้าแผนกเท่านั้น ไม่ใช่สมาชิกทุกคนในแผนก
    // (หัวหน้าแผนกเป็นผู้ตัดสินใจว่าจะมอบหมายต่อให้ใครในแผนกอีกที ผ่านการ "มอบหมายงานต่อในสังกัด"
    // ซึ่งตอนนั้นจะสร้าง assignedToUserId ให้บุคคลนั้นโดยเฉพาะ แล้วเขาถึงจะเห็นได้)
    if (t.assignedToDeptId && isDeptHeadOf(user, t.assignedToDeptId)) return true;
  }
  return false;
}

function isDeptHeadOf(user, deptId) {
  const dept = db.departments.get(deptId);
  return dept && dept.headUserId === user.id;
}

// ---- ระบบสิทธิ์แบบยืดหยุ่น (capability-based) ----
// บทบาทหลักแต่ละอันมีสิทธิ์ติดตัวตามนี้ นอกจากนี้ผู้มีสิทธิ์ manage_permissions
// (office_head/admin/director โดย default) สามารถมอบสิทธิ์เพิ่มเติมเป็นรายบุคคลได้ผ่าน user.extraPermissions
const ROLE_DEFAULT_CAPS = {
  admin: ['*'],
  director: ['*'],
  office_head: ['edit_doc_number', 'manage_teacher_duty', 'view_guard_oversight', 'manage_document_types', 'manage_users_basic', 'manage_permissions', 'review_documents', 'manage_feature_toggles', 'manage_backups_nas'],
};
const ALL_CAPABILITIES = [
  { key: 'edit_doc_number', label: 'แก้ไขเลขที่/ปีของหนังสือ' },
  { key: 'manage_teacher_duty', label: 'จัดการเวรครู (กำหนดตาราง/มอบหมาย)' },
  { key: 'view_guard_oversight', label: 'ดูรายงานเวรยามทั้งหมด' },
  { key: 'manage_document_types', label: 'จัดการประเภทเอกสาร' },
  { key: 'manage_users_basic', label: 'แก้ไขข้อมูลผู้ใช้งาน/แผนก' },
  { key: 'manage_permissions', label: 'มอบสิทธิ์ให้ผู้อื่น (ระวัง: สิทธิ์ระดับสูง)' },
  { key: 'review_documents', label: 'ตรวจกรองเอกสารก่อนถึง ผอ. (อนุมัติ/ตีกลับ/ไม่อนุมัติ)' },
  { key: 'manage_feature_toggles', label: 'เปิด/ปิดเมนูฟังก์ชันของระบบ' },
  { key: 'manage_backups_nas', label: 'จัดการสำรองข้อมูล/การเชื่อมต่อ NAS' },
  { key: 'guard_duty_access', label: 'เข้าถึงเช็คลิสต์เวรยาม/บันทึกรถเข้า-ออก (สำหรับผู้ที่ไม่ใช่ยามแต่ต้องช่วยเวร)' },
];

function hasCapability(user, cap) {
  if (!user) return false;
  const roleCaps = ROLE_DEFAULT_CAPS[user.role] || [];
  if (roleCaps.includes('*') || roleCaps.includes(cap)) return true;
  return (user.extraPermissions || []).includes(cap);
}

module.exports = { canView, isDeptHeadOf, hasCapability, ALL_CAPABILITIES, ROLE_DEFAULT_CAPS };
