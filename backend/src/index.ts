import 'dotenv/config';
import path from 'path';
import os from 'os';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initDb, saveDb } from './db/init';
import { healthRouter } from './routes/health';
import { usersRouter } from './routes/users';
import { bodyProfileRouter } from './routes/bodyProfile';
import { outfitsRouter } from './routes/outfits';
import { uploadRouter } from './routes/upload';
import { tryOnRouter } from './routes/tryOn';
import { pointsRouter } from './routes/points';
import { supportRouter } from './routes/support';
import { submissionsRouter } from './routes/submissions';
import { unlocksRouter } from './routes/unlocks';
import { likesRouter } from './routes/likes';
import { weatherRouter } from './routes/weather';
import { recommendRouter } from './routes/recommend';
import { profileRouter } from './routes/profile';
import { douyinRouter } from './routes/douyin';
import { incentivesRouter } from './routes/incentives';
import { resaleItemsRouter } from './routes/resaleItems';
import { paymentsRouter, handleStripeWebhook } from './routes/payments';
import { wardrobeRouter } from './routes/wardrobe';
import { adminOutfitsRouter } from './routes/adminOutfits';
import { getImagesDir } from './imagesPath';
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Stripe Webhook 须使用原始 body 校验签名，须放在 express.json() 之前
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  void handleStripeWebhook(req, res);
});
app.use(express.json());

// 衣库图片、预设背景图：供 tryon-service 通过 BASE_URL 拉取，指向 frontend 的 public/images
const imagesDir = getImagesDir();
console.log('衣库/图片静态目录:', imagesDir);
app.use('/images', express.static(imagesDir));

// 请求结束后可选：把 SQLite 写回文件（按需可改为定时或关键操作后）
app.use((_req, res, next) => {
  res.on('finish', () => saveDb());
  next();
});

app.use('/api/health', healthRouter);
app.use('/api/users', usersRouter);
app.use('/api/body-profile', bodyProfileRouter);
app.use('/api/outfits', outfitsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/try-on', tryOnRouter);
app.use('/api/points', pointsRouter);
app.use('/api/support', supportRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/unlocks', unlocksRouter);
app.use('/api/likes', likesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/profile', profileRouter);
app.use('/api/douyin', douyinRouter);
app.use('/api/incentives', incentivesRouter);
app.use('/api/resale-items', resaleItemsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/wardrobe', wardrobeRouter);
app.use('/api/admin/outfits', adminOutfitsRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '图片大小不能超过 10MB' });
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof Error && err.message === '仅支持 JPG / PNG / WebP / GIF') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

async function start() {
  await initDb();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`后端运行在 http://localhost:${PORT} (监听 0.0.0.0:${PORT})`);
    const ifaces = os.networkInterfaces();
    const addrs: string[] = [];
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name] || [];
      for (const iface of list) {
        if ((iface.family === 'IPv4' || (iface as { family: number }).family === 4) && !iface.internal) addrs.push(iface.address);
      }
    }
    if (addrs.length > 0) {
      console.log('局域网访问：同一 WiFi/内网用户可访问');
      addrs.forEach((ip) => console.log(`  - 前端: http://${ip}:5173（需先 cd frontend && npm run dev）`));
      addrs.forEach((ip) => console.log(`  - 后端: http://${ip}:${PORT}`));
    }
    if (!process.env.TRYON_API_URL) {
      console.log('试衣：未配置 TRYON_API_URL，虚拟试衣将返回占位图。在 backend/.env 中设置 TRYON_API_URL=http://localhost:8000/generate 并启动 tryon-service 可获得真实试穿效果。');
    } else {
      console.log('试衣：TRYON_API_URL 已配置，将请求真实试衣服务');
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用，请关闭占用进程或修改 PORT 环境变量`);
    } else {
      console.error('服务监听失败', err);
    }
    process.exit(1);
  });
}

start().catch((e) => {
  console.error('启动失败', e);
  process.exit(1);
});
