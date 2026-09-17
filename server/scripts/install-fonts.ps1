# install-fonts.ps1
# ติดตั้งไฟล์ฟอนต์ทั้งหมดใน server/fonts/ ลงเครื่อง Windows (ระดับระบบ) ให้ LibreOffice มองเห็นตอนแปลง
# Word -> PDF (ฟิลด์ "แนบไฟล์เอกสาร") ใช้วิธีเดียวกับตอนดับเบิลคลิกไฟล์ฟอนต์แล้วกด "Install" เอง
# (ผ่าน Shell COM object ที่ Windows Explorer ใช้ภายใน) เพื่อให้ registry/Fonts folder ถูกอัปเดตถูกต้อง
#
# วิธีใช้: เปิด PowerShell แบบ "Run as Administrator" แล้วรัน:
#   cd server\scripts
#   .\install-fonts.ps1

$ErrorActionPreference = 'Stop'

$fontsDir = Join-Path $PSScriptRoot '..\fonts'
$fontFiles = Get-ChildItem -Path $fontsDir -Include *.ttf, *.otf, *.ttc -Recurse -ErrorAction SilentlyContinue

if (-not $fontFiles -or $fontFiles.Count -eq 0) {
    Write-Host "ไม่พบไฟล์ฟอนต์ใน $fontsDir" -ForegroundColor Yellow
    Write-Host "กรุณาคัดลอกไฟล์ .ttf/.otf ของฟอนต์ราชการ (เช่น TH Sarabun New) มาไว้ที่โฟลเดอร์นี้ก่อน — ดู server/fonts/README.md" -ForegroundColor Yellow
    exit 1
}

# ต้องรันแบบ Administrator เพราะเป็นการติดตั้งฟอนต์ระดับระบบ (ทุก user เห็น รวมถึง service ที่รัน Node ด้วย)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "สคริปต์นี้ต้องรันแบบ Administrator (คลิกขวา PowerShell > Run as Administrator แล้วรันใหม่)" -ForegroundColor Red
    exit 1
}

$shellApp = New-Object -ComObject Shell.Application
$fontsNamespace = $shellApp.Namespace(0x14) # 0x14 = CSIDL_FONTS (โฟลเดอร์ Fonts พิเศษของ Windows)

foreach ($font in $fontFiles) {
    Write-Host "กำลังติดตั้ง: $($font.Name)"
    # flag 0x10 = ไม่ต้องโชว์ progress dialog — CopyHere ไปยังโฟลเดอร์ Fonts พิเศษนี้ Windows จะจัดการ
    # ลงทะเบียนใน registry (HKLM\...\Fonts) และคัดลอกไฟล์เข้า C:\Windows\Fonts\ ให้เองอัตโนมัติ
    $fontsNamespace.CopyHere($font.FullName, 0x10)
}

Write-Host ""
Write-Host "ติดตั้งฟอนต์เสร็จแล้ว ($($fontFiles.Count) ไฟล์)" -ForegroundColor Green
Write-Host "ตรวจสอบได้ที่ Settings > Personalization > Fonts แล้วค้นหาชื่อฟอนต์"
Write-Host "แนะนำให้รีสตาร์ทเซิร์ฟเวอร์ Node (หรือรีสตาร์ทเครื่อง) อีกครั้งก่อนทดสอบแนบไฟล์ Word"
