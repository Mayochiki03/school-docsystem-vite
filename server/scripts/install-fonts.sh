#!/bin/bash
# install-fonts.sh — ติดตั้งไฟล์ฟอนต์ทั้งหมดใน server/fonts/ ลงเครื่อง Linux/Mac (ระดับ user ปัจจุบัน)
# ให้ LibreOffice มองเห็นตอนแปลง Word -> PDF (ฟิลด์ "แนบไฟล์เอกสาร")
#
# วิธีใช้:
#   cd server/scripts
#   ./install-fonts.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONTS_SRC="$SCRIPT_DIR/../fonts"

shopt -s nullglob
FONT_FILES=("$FONTS_SRC"/*.ttf "$FONTS_SRC"/*.otf "$FONTS_SRC"/*.ttc)

if [ ${#FONT_FILES[@]} -eq 0 ]; then
  echo "ไม่พบไฟล์ฟอนต์ใน $FONTS_SRC"
  echo "กรุณาคัดลอกไฟล์ .ttf/.otf ของฟอนต์ราชการ (เช่น TH Sarabun New) มาไว้ที่โฟลเดอร์นี้ก่อน — ดู server/fonts/README.md"
  exit 1
fi

if [ "$(uname)" == "Darwin" ]; then
  TARGET_DIR="$HOME/Library/Fonts"
else
  TARGET_DIR="$HOME/.local/share/fonts"
fi
mkdir -p "$TARGET_DIR"

for f in "${FONT_FILES[@]}"; do
  echo "กำลังติดตั้ง: $(basename "$f")"
  cp -f "$f" "$TARGET_DIR/"
done

# fc-cache รีเฟรช font cache ของ fontconfig ให้ LibreOffice (ใช้ fontconfig บน Linux) เห็นฟอนต์ใหม่ทันที
if command -v fc-cache >/dev/null 2>&1; then
  fc-cache -f "$TARGET_DIR" >/dev/null
fi

echo ""
echo "ติดตั้งฟอนต์เสร็จแล้ว (${#FONT_FILES[@]} ไฟล์) ที่ $TARGET_DIR"
echo "ตรวจสอบด้วย: fc-list | grep -i sarabun"
echo "แนะนำให้รีสตาร์ทเซิร์ฟเวอร์ Node อีกครั้งก่อนทดสอบแนบไฟล์ Word"
