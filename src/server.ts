import 'dotenv/config';
import app from './app';

const PORT: number = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.log(`\n🌿 Smart Herbal Clinic Backend`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`─────────────────────────────────────\n`);
});
