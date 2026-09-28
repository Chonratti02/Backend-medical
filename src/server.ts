import 'dotenv/config';
import app from './app';

const PORT: number = parseInt(process.env.PORT ?? '3000', 10);

// ตรวจสอบความปลอดภัยระดับ Production ก่อนเริ่มรับ Request
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.includes('change_this') || secret.length < 32) {
    console.error('\n🚨 [FATAL SECURITY ERROR] ไม่สามารถเริ่มเซิร์ฟเวอร์ในโหมด Production ได้:');
    console.error('   JWT_SECRET ยังเป็นค่าตัวอย่าง หรือมีความยาวสั้นกว่า 32 ตัวอักษร (256-bit)');
    console.error('   กรุณากำหนด Random Secret ที่ปลอดภัยใน .env ก่อนเริ่มใช้งานจริง\n');
    process.exit(1);
  }
}

app.listen(PORT, () => {
  console.log(`\n🌿 Smart Herbal Clinic Backend`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`─────────────────────────────────────\n`);
});
