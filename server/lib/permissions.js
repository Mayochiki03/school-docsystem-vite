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
    // งานที่มอบหมายถึง "แผนก" (ไม่ใช่รายบุคคล) ให้เห็น/ทำได้เฉพาะ "หัวหน้าแผนก" นั้นเท่านั้น ตรงตามที่ตกลงกันไว้
    // (หัวหน้าแผนกเป็นผู้ตัดสินใจส่งต่อ/มอบหมายต่อให้ลูกน้องคนไหนอีกทีผ่านปุ่ม "มอบหมายต่อ")
    // ห้ามใช้ user.departmentIds (สมาชิกแผนก) แทน เพราะ 1 คนอยู่ได้หลายแผนก (เช่น หัวหน้าทะเบียนที่ทำงานร่วมกับ
    // แผนกการเงินด้วย และมีการเงินอยู่ใน departmentIds ของตัวเอง) — ถ้าเช็คแค่ "เป็นสมาชิกแผนกนี้" คนที่สังกัด
    // สองแผนกจะเห็น/ทำงานแทนหัวหน้าแผนกอื่นได้ทันทีโดยที่หัวหน้าแผนกตัวจริงยังไม่ได้ส่งต่อให้เลย (บั๊กที่เจอจริง)
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
