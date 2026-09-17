// lib/auth.js
const crypto = require('crypto');
const db = require('../db/sqliteStore');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

// เก็บ session ใน SQLite (ตาราง sessions) แทนตัวแปร in-memory เดิม
// เดิมเก็บใน Map ในหน่วยความจำล้วนๆ ทำให้ "ทุกครั้งที่โปรเซส Node รีสตาร์ท" (deploy อัปเดตระบบ, เครื่องรีบูต,
// โปรเซสล่มแล้ว PM2/NSSM เด้งขึ้นใหม่ให้อัตโนมัติ ฯลฯ) session ทุกคนหายพร้อมกันทันที ทั้งที่ cookie ในเบราว์เซอร์
// ยังไม่หมดอายุเลย ผู้ใช้ทุกคนเลยโดนบังคับ logout พร้อมกันโดยไม่รู้ตัว จนกว่าจะ login เองอีกครั้งถึงจะเห็นงานใหม่
// ย้ายมาเก็บใน SQLite ให้ข้อมูล session อยู่รอดข้ามการรีสตาร์ทได้ เหมือนข้อมูลอื่นๆ ในระบบ
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;   // ไม่มีการใช้งาน 8 ชั่วโมง -> หมดอายุ
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // อายุสูงสุดของ session 24 ชั่วโมง แม้จะใช้งานต่อเนื่อง

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.sessions.insert({ id: token, userId, createdAt: now, lastActive: now });
  return token;
}

// คืนค่า session ถ้ายังไม่หมดอายุ และต่ออายุการใช้งาน (sliding expiration)
function getSession(token) {
  const s = db.sessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastActive > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) {
    db.sessions.remove(token);
    return null;
  }
  // อัปเดต lastActive แบบ throttle (ไม่เขียนทุกคำขอ) — เขียนแค่เมื่อห่างจากครั้งก่อนเกิน 1 นาที พอเพียงต่อ
  // sliding expiration ที่หน่วยเป็นชั่วโมงอยู่แล้ว และลดจำนวนครั้งเขียนดิสก์ต่อวินาทีลงมากในเครื่องที่มีคนใช้พร้อมกันเยอะ
  if (now - s.lastActive > 60 * 1000) {
    db.sessions.update(token, { lastActive: now });
  }
  return s;
}

function destroySession(token) {
  db.sessions.remove(token);
}

function destroyAllSessionsForUser(userId) {
  db.sessions.find(s => s.userId === userId).forEach(s => db.sessions.remove(s.id));
}

// ล้าง session ที่หมดอายุทิ้งเป็นระยะ กันตารางบวมไปเรื่อยๆ (เดิมไม่มีปัญหานี้เพราะเป็น Map ที่หายไปเองตอน restart)
function cleanupExpiredSessions() {
  const now = Date.now();
  db.sessions.find(s => now - s.lastActive > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS)
    .forEach(s => db.sessions.remove(s.id));
}
setInterval(cleanupExpiredSessions, 30 * 60 * 1000).unref();
cleanupExpiredSessions();

module.exports = { hashPassword, verifyPassword, createSession, getSession, destroySession, destroyAllSessionsForUser };
