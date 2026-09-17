// src/utils/richText.ts
// ตัวช่วยสำหรับฟิลด์ชนิด "ข้อความอิสระ" (richtext) — เอกสารที่เนื้อหาไม่ตายตัวเป็นย่อหน้าอิสระแบบ Word
// (เช่น คำสั่งโรงเรียน) ต่างจากฟิลด์อื่นที่กรอกเป็นช่องๆ ค่าที่เก็บคือ HTML string
//
// ต้องแซนิไทซ์ทั้ง "ก่อนบันทึก" (ตอนพิมพ์/วางในตัวแก้ไข) และ "ก่อนแสดงผล" (ตอนพิมพ์เอกสารจริง/พรีวิว)
// เพราะข้อมูลที่อ่านจาก API ควรถือเป็นข้อมูลที่ยังไม่น่าเชื่อถือเสมอ ไม่ว่าจะมาจากไหน

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'UL', 'OL', 'LI', 'DIV', 'SPAN', 'H3', 'H4', 'BLOCKQUOTE', 'SUB', 'SUP',
]);
// อนุญาตเฉพาะ style ที่เกิดจากปุ่มจัดรูปแบบในตัวแก้ไขเอง (จัดหน้า/เยื้อง) — ตัดพวก mso-* จาก Word,
// background/position/behavior ที่อาจใช้โจมตี หรือทำให้ผังหน้ากระดาษ A4 เพี้ยน
const ALLOWED_STYLE_PROPS = new Set(['text-align', 'font-weight', 'text-decoration', 'margin-left', 'padding-left']);
// เอกสารที่วางมาจาก Word/Google Docs มักมี margin เป็นนิ้ว (เช่น 1.5in) ซ้อนกันหลายชั้น ทำให้เยื้องเพี้ยน
// เกินจริงเวลาแสดงในหน้า A4 ของเรา — แปลงหน่วยเป็น px แล้วจำกัดเพดานไว้ไม่ให้เยื้องเกิน ~3 ระดับ
const MAX_INDENT_PX = 120;
function normalizeIndentValue(val: string): string | null {
  const m = /^(-?[\d.]+)(px|in|pt|em|cm|mm)$/.exec(val.trim());
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2];
  const pxPerUnit: Record<string, number> = { px: 1, in: 96, pt: 96 / 72, em: 16, cm: 96 / 2.54, mm: 96 / 25.4 };
  let px = num * (pxPerUnit[unit] ?? 1);
  px = Math.max(0, Math.min(MAX_INDENT_PX, px));
  return `${Math.round(px)}px`;
}

function filterStyle(styleText: string): string {
  const out: string[] = [];
  styleText.split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx === -1) return;
    const prop = rule.slice(0, idx).trim().toLowerCase();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    if (!ALLOWED_STYLE_PROPS.has(prop) || /url\(|expression\(|javascript:/i.test(val)) return;
    if (prop === 'margin-left' || prop === 'padding-left') {
      const normalized = normalizeIndentValue(val);
      if (normalized) out.push(`${prop}: ${normalized}`);
      return;
    }
    out.push(`${prop}: ${val}`);
  });
  return out.join('; ');
}

// เอกสารที่วางมาจาก Word มักซ้อน <blockquote> หลายสิบชั้นจากการเยื้องซ้ำๆ ในต้นฉบับ — จำกัดความลึกไว้กันเพี้ยน
const MAX_BLOCKQUOTE_DEPTH = 3;
function capBlockquoteDepth(container: HTMLElement) {
  const walk = (node: Node, depth: number) => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      let nextDepth = depth;
      if (el.tagName === 'BLOCKQUOTE') {
        nextDepth = depth + 1;
        if (nextDepth > MAX_BLOCKQUOTE_DEPTH) {
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
          }
          walk(node, depth); // ตัวเองถูกดึงออกแล้ว วนซ้ำที่ระดับเดิมกับลูกที่ย้ายขึ้นมา
          return;
        }
      }
      walk(el, nextDepth);
    });
  };
  walk(container, 0);
}

function sanitizeNode(node: Node) {
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === Node.COMMENT_NODE) {
      node.removeChild(child);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return; // text node — เก็บไว้ตามเดิม
    const el = child as HTMLElement;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // แท็กที่ไม่อนุญาต (script, style, img, a, font ของ Word/Google Docs ฯลฯ) — ดึงเนื้อหาข้างในออกมา
      // แทนที่ตัวแท็ก แทนที่จะลบทิ้งทั้งหมด กันข้อความที่ผู้ใช้พิมพ์/วางมาหายไปโดยไม่รู้ตัว
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      return;
    }
    Array.from(el.attributes).forEach(attr => {
      if (attr.name === 'style') {
        const filtered = filterStyle(attr.value);
        if (filtered) el.setAttribute('style', filtered);
        else el.removeAttribute('style');
      } else {
        el.removeAttribute(attr.name);
      }
    });
    sanitizeNode(el);
  });
}

function collapseExcessNbsp(container: HTMLElement) {
  // Word มักใช้ &nbsp; รัวๆ สิบกว่าตัวแทนการเยื้องย่อหน้า ทำให้ดูเป็นช่องว่างยาวผิดปกติ — เหลือไว้พอเป็นสัญลักษณ์เยื้อง
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) texts.push(n as Text);
  texts.forEach(t => {
    if (t.nodeValue && /\u00A0{3,}/.test(t.nodeValue)) {
      t.nodeValue = t.nodeValue.replace(/\u00A0{3,}/g, '\u00A0\u00A0');
    }
  });
}

function collapseEmptyParagraphs(container: HTMLElement) {
  // Word มักวาง <p>&nbsp;</p> ว่างๆ ติดกันหลายบรรทัดแทนการเว้นวรรค ทำให้เกิดช่องว่างเป็นตับเวลาแปะเข้ามา
  const isEmptyBlock = (el: Element) => (el.tagName === 'P' || el.tagName === 'DIV')
    && (el.textContent || '').replace(/\u00A0/g, '').trim() === '' && !el.querySelector('br');
  const children = Array.from(container.children);
  let consecutiveEmpty = 0;
  children.forEach(el => {
    if (isEmptyBlock(el)) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty > 1) el.remove();
    } else {
      consecutiveEmpty = 0;
    }
  });
}

export function sanitizeRichHtml(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  sanitizeNode(container);
  capBlockquoteDepth(container);
  collapseExcessNbsp(container);
  collapseEmptyParagraphs(container);
  return container.innerHTML;
}

// นับความยาวข้อความล้วน (ไม่รวมแท็ก) — ใช้เช็คฟิลด์บังคับกรอกของ richtext เพราะ contentEditable
// ไม่มี attribute "required" ให้เบราว์เซอร์เช็คให้อัตโนมัติเหมือน input/textarea ปกติ
export function plainTextLength(html?: string | null): number {
  if (!html) return 0;
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim().length;
}

function looksLikeHtml(raw: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(raw);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// แปลงค่าฟิลด์เนื้อหาให้เป็น HTML ปลอดภัยสำหรับแสดงผล ใช้ได้ทั้งสองแบบ:
//  - ข้อความธรรมดาจากฟิลด์ textarea แบบเดิม (ขึ้นบรรทัดใหม่ด้วย \n) — เอกสารเก่าที่เคยสร้างไว้แล้ว
//  - HTML จริงจากตัวแก้ไขข้อความอิสระ (richtext) — เอกสารที่สร้าง/แก้ไขใหม่
// ทำให้เปลี่ยนชนิดฟิลด์ของประเภทเอกสารเดิมจาก textarea เป็น richtext ภายหลังได้ โดยเอกสารเก่ายังแสดงผลถูกต้อง
export function renderMemoContentHtml(raw?: string | null): string {
  if (!raw) return '';
  if (looksLikeHtml(raw)) return sanitizeRichHtml(raw);
  return escapeHtml(raw).replace(/\n/g, '<br>');
}
