// src/components/ErrorBoundary.tsx
// เดิม: ถ้าหน้าไหนพัง (error ตอน render จริงๆ ในโค้ด React) จอจะกลายเป็น "หน้าเปล่าสีขาว" เฉยๆ
// ไม่มีข้อความอะไรเลย ทั้งที่ Network tab อาจโชว์ว่า API เรียกสำเร็จ (200 OK) ปกติ เพราะปัญหาจริงเกิด
// "หลังจาก" ได้ข้อมูลมาแล้ว ตอน React พยายาม render ออกมา ต่างหาก — ทำให้ดูสับสนว่า "ทำไม API ปกติ
// แต่งานไม่ขึ้น" คอมโพเนนต์นี้ดักจับ error แบบนั้นไว้ แสดงข้อความอธิบาย + ปุ่มลองใหม่/กลับหน้าหลัก
// แทนจอเปล่า และเก็บรายละเอียด error ไว้ให้กดดูได้ (ช่วยแจ้งแอดมินตอนเจอปัญหาจริง)
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; info: ErrorInfo | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // เก็บ log ไว้ที่ฝั่งเบราว์เซอร์เผื่อเปิด console ดูย้อนหลังได้
    console.error('[ErrorBoundary] หน้านี้เกิดข้อผิดพลาดระหว่างแสดงผล:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto text-center py-16 px-4">
          <p className="text-4xl mb-3">⚠️</p>
          <h2 className="text-lg font-semibold mb-2">หน้านี้แสดงผลไม่สำเร็จ</h2>
          <p className="text-sm text-slate-500 mb-4">
            ข้อมูลอาจโหลดสำเร็จ แต่เกิดข้อผิดพลาดตอนแสดงผลหน้านี้ ลองกดปุ่มด้านล่าง ถ้ายังเจอปัญหาซ้ำ
            กรุณาแจ้งแอดมินพร้อมข้อความด้านล่าง (แคปหน้าจอนี้ส่งได้เลย)
          </p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <button onClick={() => { this.setState({ error: null, info: null }); window.location.reload(); }}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">โหลดหน้านี้ใหม่</button>
            <button onClick={() => { window.location.href = '/dashboard'; }}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium">กลับหน้าหลัก</button>
          </div>
          <details className="text-left text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
            <summary className="cursor-pointer select-none">รายละเอียดทางเทคนิค (สำหรับแจ้งแอดมิน)</summary>
            <pre className="whitespace-pre-wrap break-words mt-2">{this.state.error.message}{'\n'}{this.state.info?.componentStack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
