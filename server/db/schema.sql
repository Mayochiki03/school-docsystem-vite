-- schema.sql
-- โครงสร้างตารางอ้างอิงสำหรับ SQL Server (ใช้ตอนย้ายจาก JSON store ไปเป็นของจริง)
-- ชื่อตาราง/คอลัมน์ ตรงกับ field ใน db/store.js (JSON) เพื่อให้ map กันง่าย

CREATE TABLE Departments (
    Id NVARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    HeadUserId NVARCHAR(50) NULL,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE TABLE Users (
    Id NVARCHAR(50) PRIMARY KEY,
    Username NVARCHAR(100) UNIQUE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName NVARCHAR(200) NOT NULL,
    Position NVARCHAR(200) NULL,
    Role NVARCHAR(50) NOT NULL, -- admin, director, office_head, staff, guard
    Active BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- ความสัมพันธ์ user <-> department แบบ many-to-many (คนหนึ่งอยู่ได้หลายแผนก)
CREATE TABLE UserDepartments (
    UserId NVARCHAR(50) NOT NULL,
    DepartmentId NVARCHAR(50) NOT NULL,
    IsPrimary BIT DEFAULT 0,
    PRIMARY KEY (UserId, DepartmentId),
    FOREIGN KEY (UserId) REFERENCES Users(Id),
    FOREIGN KEY (DepartmentId) REFERENCES Departments(Id)
);

CREATE TABLE DocumentTypes (
    Id NVARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Category NVARCHAR(50) NOT NULL, -- incoming/outgoing/memo/announcement/order/leave/other
    RecipientMode NVARCHAR(20) NOT NULL, -- all / selected / single
    FormSchemaJson NVARCHAR(MAX) NOT NULL, -- เก็บ field definitions เป็น JSON
    Active BIT DEFAULT 1
);

CREATE TABLE Documents (
    Id NVARCHAR(50) PRIMARY KEY,
    DocNumber NVARCHAR(100) NULL,      -- เลขที่ (กรอกเอง)
    DocYear NVARCHAR(10) NULL,          -- ปี (กรอกเอง)
    TypeId NVARCHAR(50) NOT NULL,
    Subject NVARCHAR(500) NOT NULL,
    FieldsJson NVARCHAR(MAX) NOT NULL, -- ข้อมูลตาม formSchema ของประเภทเอกสาร
    Confidential BIT DEFAULT 0,
    Status NVARCHAR(50) NOT NULL DEFAULT 'pending', -- pending/endorsed/in_progress/completed/rejected/returned
    CreatedBy NVARCHAR(50) NOT NULL,
    DueDate DATE NULL,
    CreatorSignature NVARCHAR(MAX) NULL, -- ลายเซ็นผู้จัดทำ เก็บเป็น base64 image (แนะนำย้ายไปเก็บเป็นไฟล์แยกตอนใช้งานจริง)
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (TypeId) REFERENCES DocumentTypes(Id),
    FOREIGN KEY (CreatedBy) REFERENCES Users(Id)
);

CREATE TABLE Tasks (
    Id NVARCHAR(50) PRIMARY KEY,
    DocumentId NVARCHAR(50) NOT NULL,
    AssignedToUserId NVARCHAR(50) NULL,
    AssignedToDeptId NVARCHAR(50) NULL,
    AssignedBy NVARCHAR(50) NOT NULL,
    Instructions NVARCHAR(1000) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'pending', -- pending/acknowledged/done
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    CompletedAt DATETIME2 NULL,
    FOREIGN KEY (DocumentId) REFERENCES Documents(Id)
);

CREATE TABLE History (
    Id NVARCHAR(50) PRIMARY KEY,
    DocumentId NVARCHAR(50) NOT NULL,
    ActorId NVARCHAR(50) NOT NULL,
    Action NVARCHAR(100) NOT NULL, -- created/forwarded/endorsed/assigned/acknowledged/completed/rejected/returned
    Note NVARCHAR(1000) NULL,
    SignatureName NVARCHAR(200) NULL,
    SignatureImage NVARCHAR(MAX) NULL, -- ลายเซ็นกำกับ (base64 image)
    Timestamp DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (DocumentId) REFERENCES Documents(Id)
);

CREATE TABLE Attachments (
    Id NVARCHAR(50) PRIMARY KEY,
    DocumentId NVARCHAR(50) NOT NULL,
    TaskId NVARCHAR(50) NULL,
    FileName NVARCHAR(300) NOT NULL,
    FilePath NVARCHAR(500) NOT NULL,
    UploadedBy NVARCHAR(50) NOT NULL,
    UploadedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (DocumentId) REFERENCES Documents(Id)
);

CREATE TABLE Notifications (
    Id NVARCHAR(50) PRIMARY KEY,
    UserId NVARCHAR(50) NOT NULL,
    DocumentId NVARCHAR(50) NULL,
    Message NVARCHAR(500) NOT NULL,
    IsRead BIT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (UserId) REFERENCES Users(Id)
);

CREATE TABLE AuditLog (
    Id NVARCHAR(50) PRIMARY KEY,
    DocumentId NVARCHAR(50) NULL,
    UserId NVARCHAR(50) NOT NULL,
    Action NVARCHAR(200) NOT NULL,
    Detail NVARCHAR(1000) NULL,
    Timestamp DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- ระบบเช็คลิสต์เวรยาม (Guard Checklist)
CREATE TABLE GuardChecklistItems (
    Id NVARCHAR(50) PRIMARY KEY,
    Title NVARCHAR(300) NOT NULL,
    Description NVARCHAR(1000) NULL,
    TimesJson NVARCHAR(500) NOT NULL, -- เก็บช่วงเวลาตรวจต่อวันเป็น JSON array เช่น ["08:00","20:00"]
    Active BIT DEFAULT 1,
    CreatedBy NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE TABLE GuardLogs (
    Id NVARCHAR(50) PRIMARY KEY,
    ItemId NVARCHAR(50) NOT NULL,
    ScheduledTime NVARCHAR(10) NOT NULL, -- เช่น "08:00"
    LogDate DATE NOT NULL,
    GuardUserId NVARCHAR(50) NOT NULL,
    Note NVARCHAR(1000) NULL,
    PhotoPathsJson NVARCHAR(MAX) NULL, -- เก็บ path ของรูปภาพ (ประทับวันที่-เวลาแล้ว) เป็น JSON array
    SubmittedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (ItemId) REFERENCES GuardChecklistItems(Id),
    FOREIGN KEY (GuardUserId) REFERENCES Users(Id)
);

-- ตั้งค่าระบบ (ชื่อโรงเรียนใช้แสดงบนหัวเอกสารเวลาพิมพ์ ฯลฯ) เก็บเป็นแถวเดียว Id='main'
CREATE TABLE Settings (
    Id NVARCHAR(50) PRIMARY KEY,
    SchoolName NVARCHAR(300) NULL,
    GuardChecklistEnabled BIT DEFAULT 0 -- ปิดโดยค่าเริ่มต้น แอดมินเปิดใช้งานเมื่อพร้อม
);

-- ประกาศระบบจากไอที (แสดงเป็นแถบแจ้งเตือนบนสุดของทุกบัญชี)
CREATE TABLE Announcements (
    Id NVARCHAR(50) PRIMARY KEY,
    Message NVARCHAR(1000) NOT NULL,
    StartAt DATETIME2 NOT NULL,
    EndAt DATETIME2 NULL, -- NULL = แสดงจนกว่าจะปิดเอง
    Active BIT DEFAULT 1,
    CreatedBy NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- สิทธิ์เพิ่มเติมเฉพาะบุคคล (capability-based, มอบสิทธิ์เฉพาะจุดได้โดยไม่ต้องเปลี่ยนบทบาท)
CREATE TABLE UserExtraPermissions (
    UserId NVARCHAR(50) NOT NULL,
    Capability NVARCHAR(100) NOT NULL, -- เช่น edit_doc_number, manage_teacher_duty, view_guard_oversight
    GrantedBy NVARCHAR(50) NOT NULL,
    GrantedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (UserId, Capability),
    FOREIGN KEY (UserId) REFERENCES Users(Id)
);

-- บันทึกรถเข้า-ออกโรงเรียน (ยามบันทึก)
CREATE TABLE VehicleLogs (
    Id NVARCHAR(50) PRIMARY KEY,
    Direction NVARCHAR(5) NOT NULL, -- 'in' หรือ 'out'
    PhotosJson NVARCHAR(MAX) NULL, -- path รูปภาพที่ประทับวันที่-เวลาแล้ว เก็บเป็น JSON array
    PlateNumber NVARCHAR(50) NULL, -- กรอกภายหลังได้ (ไม่บังคับตอนถ่าย)
    SubmittedAt DATETIME2 NOT NULL,
    ByUserId NVARCHAR(50) NOT NULL,
    FOREIGN KEY (ByUserId) REFERENCES Users(Id)
);
-- ระบบเวรครู (Teacher Duty) พร้อมการส่งมอบเวรชั่วคราว
CREATE TABLE DutyTypes (
    Id NVARCHAR(50) PRIMARY KEY,
    Title NVARCHAR(300) NOT NULL,
    TimesJson NVARCHAR(500) NOT NULL, -- ช่วงเวลาต่อวัน เช่น ["07:30","12:00","16:30"]
    DaysOfWeekJson NVARCHAR(100) NOT NULL, -- วันในสัปดาห์ที่มีเวรนี้ เช่น [3] = เฉพาะวันพุธ, [1,2,3,4,5] = จันทร์-ศุกร์ (1=จันทร์...7=อาทิตย์)
    PrimaryUserId NVARCHAR(50) NOT NULL, -- เจ้าของเวรหลัก
    Active BIT DEFAULT 1,
    CreatedBy NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (PrimaryUserId) REFERENCES Users(Id)
);

-- หัวหน้าเวรประจำแต่ละวันของสัปดาห์ (มีสิทธิ์ส่งมอบเวรแทนให้ทีมของวันนั้นได้)
CREATE TABLE DutyHeads (
    Id NVARCHAR(50) PRIMARY KEY,
    DayOfWeek INT NOT NULL, -- 1=จันทร์ ... 7=อาทิตย์
    HeadUserId NVARCHAR(50) NOT NULL,
    Active BIT DEFAULT 1,
    FOREIGN KEY (HeadUserId) REFERENCES Users(Id)
);

CREATE TABLE DutyCoverage (
    Id NVARCHAR(50) PRIMARY KEY,
    DutyTypeId NVARCHAR(50) NOT NULL,
    FromDate DATE NOT NULL,
    ToDate DATE NOT NULL,
    OriginalUserId NVARCHAR(50) NOT NULL,
    RequestedBy NVARCHAR(50) NOT NULL, -- ผู้ริเริ่มคำขอ (หัวหน้าเวรของวันนั้น หรือหัวหน้าสำนักงาน/แอดมิน)
    SubstituteUserId NVARCHAR(50) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / accepted / declined
    CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    RespondedAt DATETIME2 NULL,
    FOREIGN KEY (DutyTypeId) REFERENCES DutyTypes(Id)
);

CREATE TABLE DutyLogs (
    Id NVARCHAR(50) PRIMARY KEY,
    DutyTypeId NVARCHAR(50) NOT NULL,
    ScheduledTime NVARCHAR(10) NOT NULL,
    LogDate DATE NOT NULL,
    ActingUserId NVARCHAR(50) NOT NULL, -- เจ้าของเวรหรือผู้รับมอบที่บันทึกจริง
    Note NVARCHAR(1000) NOT NULL, -- บังคับกรอกรายละเอียด
    Ok BIT DEFAULT 1, -- true = ไม่มีอะไรผิดปกติ
    PhotoPathsJson NVARCHAR(MAX) NULL, -- ไม่บังคับแนบรูป
    SubmittedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (DutyTypeId) REFERENCES DutyTypes(Id)
);
