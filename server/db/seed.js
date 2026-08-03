// db/seed.js - รันครั้งแรกเพื่อสร้างข้อมูลตั้งต้น (ผู้ใช้, แผนก, ประเภทเอกสาร)
const db = require('./sqliteStore');
const { hashPassword } = require('../lib/auth');

function seed() {
  if (db.users.all().length > 0) {
    console.log('มีข้อมูลอยู่แล้ว ข้ามการ seed');
    return;
  }

  // แผนก
  const depOffice = db.departments.insert({ name: 'สำนักงานผู้อำนวยการ' });
  const depFinance = db.departments.insert({ name: 'การเงิน' });
  const depRegistry = db.departments.insert({ name: 'ทะเบียน' });
  const depMaintenance = db.departments.insert({ name: 'งานอาคารสถานที่/ช่าง' });
  const depAcademic = db.departments.insert({ name: 'วิชาการ' });

  // ผู้ใช้เริ่มต้น (username/password สำหรับทดสอบ)
  const admin = db.users.insert({
    username: 'admin', passwordHash: hashPassword('admin1234'),
    fullName: 'ผู้ดูแลระบบ', position: 'Admin', role: 'admin', active: true,
    departmentIds: [depOffice.id]
  });
  const director = db.users.insert({
    username: 'director', passwordHash: hashPassword('director1234'),
    fullName: 'ผู้อำนวยการโรงเรียน', position: 'ผู้อำนวยการ', role: 'director', active: true,
    departmentIds: [depOffice.id]
  });
  const officeHead = db.users.insert({
    username: 'office', passwordHash: hashPassword('office1234'),
    fullName: 'หัวหน้าสำนักงาน', position: 'หัวหน้าสำนักงาน', role: 'office_head', active: true,
    departmentIds: [depOffice.id]
  });
  const finance = db.users.insert({
    username: 'finance', passwordHash: hashPassword('finance1234'),
    fullName: 'เจ้าหน้าที่การเงิน', position: 'เจ้าหน้าที่การเงิน', role: 'staff', active: true,
    departmentIds: [depFinance.id]
  });
  const registry = db.users.insert({
    username: 'registry', passwordHash: hashPassword('registry1234'),
    fullName: 'เจ้าหน้าที่ทะเบียน', position: 'เจ้าหน้าที่ทะเบียน', role: 'staff', active: true,
    departmentIds: [depFinance.id, depRegistry.id] // ตัวอย่าง: อยู่ 2 แผนก
  });
  const technician = db.users.insert({
    username: 'tech', passwordHash: hashPassword('tech1234'),
    fullName: 'ช่างซ่อมบำรุง', position: 'ช่าง', role: 'staff', active: true,
    departmentIds: [depMaintenance.id]
  });
  const teacher = db.users.insert({
    username: 'teacher', passwordHash: hashPassword('teacher1234'),
    fullName: 'ครูสมชาย ใจดี', position: 'ครู คศ.1', role: 'staff', active: true,
    departmentIds: [depAcademic.id]
  });
  const guard = db.users.insert({
    username: 'guard', passwordHash: hashPassword('guard1234'),
    fullName: 'นายมั่นคง ยามเฝ้า', position: 'ยาม (รปภ.)', role: 'guard', active: true,
    departmentIds: [depMaintenance.id]
  });

  db.departments.update(depOffice.id, { headUserId: officeHead.id });
  db.departments.update(depFinance.id, { headUserId: finance.id });
  db.departments.update(depRegistry.id, { headUserId: registry.id });
  db.departments.update(depMaintenance.id, { headUserId: technician.id });

  // ประเภทเอกสาร พร้อม formSchema แบบยืดหยุ่น (admin เพิ่ม/แก้ทีหลังได้)
  const types = [
    {
      name: 'หนังสือเข้าจากภายนอก', category: 'incoming', recipientMode: 'single', requiresScan: true,
      formSchema: [
        { key: 'fromOrg', label: 'จากหน่วยงาน/บุคคล', type: 'text', required: true },
        { key: 'refNumber', label: 'เลขที่หนังสือต้นทาง', type: 'text', required: false },
        { key: 'refDate', label: 'วันที่หนังสือต้นทาง', type: 'date', required: false },
        { key: 'summary', label: 'สรุปเรื่อง', type: 'textarea', required: true }
      ]
    },
    {
      name: 'หนังสือออกภายนอก', category: 'outgoing', recipientMode: 'single',
      formSchema: [
        { key: 'toOrg', label: 'เรียน (หน่วยงาน/บุคคลปลายทาง)', type: 'text', required: true },
        { key: 'content', label: 'เนื้อหา', type: 'textarea', required: true }
      ]
    },
    {
      name: 'บันทึกข้อความ (ถึง ผอ.)', category: 'memo_to_director', recipientMode: 'single',
      formSchema: [
        { key: 'to', label: 'เรียน', type: 'text', required: true, default: 'ผู้อำนวยการโรงเรียน' },
        { key: 'content', label: 'เนื้อหา/รายละเอียด', type: 'textarea', required: true },
        { key: 'signerName', label: 'ลงชื่อ', type: 'text', required: true },
        { key: 'signerPosition', label: 'ตำแหน่ง', type: 'text', required: true }
      ]
    },
    {
      name: 'บันทึกข้อความถึงครูทั้งโรงเรียน', category: 'memo_all', recipientMode: 'all',
      formSchema: [
        { key: 'to', label: 'เรียน', type: 'text', required: true, default: 'คณะครูทุกท่าน' },
        { key: 'content', label: 'เนื้อหา', type: 'textarea', required: true },
        { key: 'signerName', label: 'ลงชื่อ', type: 'text', required: true },
        { key: 'signerPosition', label: 'ตำแหน่ง', type: 'text', required: true }
      ]
    },
    {
      name: 'บันทึกข้อความถึงครูบางคน', category: 'memo_some', recipientMode: 'selected',
      formSchema: [
        { key: 'content', label: 'เนื้อหา', type: 'textarea', required: true },
        { key: 'signerName', label: 'ลงชื่อ', type: 'text', required: true },
        { key: 'signerPosition', label: 'ตำแหน่ง', type: 'text', required: true }
      ]
    },
    {
      name: 'ประกาศโรงเรียน', category: 'announcement', recipientMode: 'all',
      formSchema: [
        { key: 'content', label: 'เนื้อหาประกาศ', type: 'textarea', required: true }
      ]
    },
    {
      name: 'คำสั่งโรงเรียน (ทุกคน)', category: 'order_all', recipientMode: 'all',
      formSchema: [
        { key: 'content', label: 'เนื้อหาคำสั่ง', type: 'textarea', required: true }
      ]
    },
    {
      name: 'คำสั่งโรงเรียน (เฉพาะบางคน)', category: 'order_some', recipientMode: 'selected',
      formSchema: [
        { key: 'content', label: 'เนื้อหาคำสั่ง', type: 'textarea', required: true }
      ]
    },
    {
      name: 'ใบลา', category: 'leave', recipientMode: 'single',
      formSchema: [
        { key: 'leaveType', label: 'ประเภทการลา', type: 'select', options: ['ลาป่วย', 'ลากิจ', 'ลาพักผ่อน'], required: true },
        { key: 'startDate', label: 'ตั้งแต่วันที่', type: 'date', required: true },
        { key: 'endDate', label: 'ถึงวันที่', type: 'date', required: true },
        { key: 'reason', label: 'เหตุผล', type: 'textarea', required: true }
      ]
    }
  ];

  for (const t of types) db.documentTypes.insert(Object.assign({ active: true }, t));

  // รายการเช็คลิสต์เวรยามตัวอย่าง (ผู้อำนวยการ/แอดมิน แก้ไขเพิ่มเติมได้ภายหลัง)
  db.guardChecklistItems.insert({ title: 'ตรวจตราอาคารเรียน 1-2', description: 'ตรวจสอบประตู หน้าต่าง ไฟฟ้า และความเรียบร้อยทั่วไป', times: ['08:00', '20:00'], active: true, createdBy: admin.id, createdAt: new Date().toISOString() });
  db.guardChecklistItems.insert({ title: 'ตรวจประตูรั้วโรงเรียน', description: 'ตรวจสอบการล็อกประตูรั้วและแสงสว่างบริเวณทางเข้า', times: ['06:00', '18:00', '22:00'], active: true, createdBy: admin.id, createdAt: new Date().toISOString() });
  db.guardChecklistItems.insert({ title: 'ตรวจโรงอาหารและสนาม', description: 'ตรวจสอบความเรียบร้อย ไฟฟ้า และความปลอดภัยบริเวณโรงอาหาร/สนาม', times: ['12:00', '19:00'], active: true, createdBy: admin.id, createdAt: new Date().toISOString() });

  console.log('Seed ข้อมูลเริ่มต้นเรียบร้อย');
  console.log('บัญชีทดสอบ: admin/admin1234, director/director1234, office/office1234, finance/finance1234, registry/registry1234, tech/tech1234, teacher/teacher1234, guard/guard1234');
}

if (require.main === module) seed();
module.exports = seed;
