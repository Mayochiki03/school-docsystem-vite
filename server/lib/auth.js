// lib/auth.js
const crypto = require('crypto');

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

// เก็บ session ใน memory: token -> { userId, createdAt, lastActive }
const sessions = new Map();
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;   // ไม่มีการใช้งาน 8 ชั่วโมง -> หมดอายุ
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // อายุสูงสุดของ session 24 ชั่วโมง แม้จะใช้งานต่อเนื่อง

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, { userId, createdAt: now, lastActive: now });
  return token;
}

// คืนค่า session ถ้ายังไม่หมดอายุ และต่ออายุการใช้งาน (sliding expiration)
function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastActive > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) {
    sessions.delete(token);
    return null;
  }
  s.lastActive = now;
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

function destroyAllSessionsForUser(userId) {
  for (const [token, s] of sessions.entries()) {
    if (s.userId === userId) sessions.delete(token);
  }
}

module.exports = { hashPassword, verifyPassword, createSession, getSession, destroySession, destroyAllSessionsForUser };
