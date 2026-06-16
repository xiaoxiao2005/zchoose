"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const os_1 = __importDefault(require("os"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const init_1 = require("./db/init");
const health_1 = require("./routes/health");
const users_1 = require("./routes/users");
const bodyProfile_1 = require("./routes/bodyProfile");
const outfits_1 = require("./routes/outfits");
const upload_1 = require("./routes/upload");
const tryOn_1 = require("./routes/tryOn");
const points_1 = require("./routes/points");
const support_1 = require("./routes/support");
const submissions_1 = require("./routes/submissions");
const unlocks_1 = require("./routes/unlocks");
const likes_1 = require("./routes/likes");
const weather_1 = require("./routes/weather");
const recommend_1 = require("./routes/recommend");
const profile_1 = require("./routes/profile");
const douyin_1 = require("./routes/douyin");
const incentives_1 = require("./routes/incentives");
const resaleItems_1 = require("./routes/resaleItems");
const payments_1 = require("./routes/payments");
const wardrobe_1 = require("./routes/wardrobe");
const adminOutfits_1 = require("./routes/adminOutfits");
const imagesPath_1 = require("./imagesPath");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
// Stripe Webhook 须使用原始 body 校验签名，须放在 express.json() 之前
app.post('/api/payments/webhook', express_1.default.raw({ type: 'application/json' }), (req, res) => {
    void (0, payments_1.handleStripeWebhook)(req, res);
});
app.use(express_1.default.json());
// 衣库图片、预设背景图：供 tryon-service 通过 BASE_URL 拉取，指向 frontend 的 public/images
const imagesDir = (0, imagesPath_1.getImagesDir)();
console.log('衣库/图片静态目录:', imagesDir);
app.use('/images', express_1.default.static(imagesDir));
// 请求结束后可选：把 SQLite 写回文件（按需可改为定时或关键操作后）
app.use((_req, res, next) => {
    res.on('finish', () => (0, init_1.saveDb)());
    next();
});
app.use('/api/health', health_1.healthRouter);
app.use('/api/users', users_1.usersRouter);
app.use('/api/body-profile', bodyProfile_1.bodyProfileRouter);
app.use('/api/outfits', outfits_1.outfitsRouter);
app.use('/api/upload', upload_1.uploadRouter);
app.use('/api/try-on', tryOn_1.tryOnRouter);
app.use('/api/points', points_1.pointsRouter);
app.use('/api/support', support_1.supportRouter);
app.use('/api/submissions', submissions_1.submissionsRouter);
app.use('/api/unlocks', unlocks_1.unlocksRouter);
app.use('/api/likes', likes_1.likesRouter);
app.use('/api/weather', weather_1.weatherRouter);
app.use('/api/recommend', recommend_1.recommendRouter);
app.use('/api/profile', profile_1.profileRouter);
app.use('/api/douyin', douyin_1.douyinRouter);
app.use('/api/incentives', incentives_1.incentivesRouter);
app.use('/api/resale-items', resaleItems_1.resaleItemsRouter);
app.use('/api/payments', payments_1.paymentsRouter);
app.use('/api/wardrobe', wardrobe_1.wardrobeRouter);
app.use('/api/admin/outfits', adminOutfits_1.adminOutfitsRouter);
app.use((err, _req, res, _next) => {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(400).json({ error: '图片大小不能超过 10MB' });
        return res.status(400).json({ error: err.message });
    }
    if (err instanceof Error && err.message === '仅支持 JPG / PNG / WebP / GIF') {
        return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
});
async function start() {
    await (0, init_1.initDb)();
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`后端运行在 http://localhost:${PORT} (监听 0.0.0.0:${PORT})`);
        const ifaces = os_1.default.networkInterfaces();
        const addrs = [];
        for (const name of Object.keys(ifaces)) {
            const list = ifaces[name] || [];
            for (const iface of list) {
                if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal)
                    addrs.push(iface.address);
            }
        }
        if (addrs.length > 0) {
            console.log('局域网访问：同一 WiFi/内网用户可访问');
            addrs.forEach((ip) => console.log(`  - 前端: http://${ip}:5173（需先 cd frontend && npm run dev）`));
            addrs.forEach((ip) => console.log(`  - 后端: http://${ip}:${PORT}`));
        }
        if (!process.env.TRYON_API_URL) {
            console.log('试衣：未配置 TRYON_API_URL，虚拟试衣将返回占位图。在 backend/.env 中设置 TRYON_API_URL=http://localhost:8000/generate 并启动 tryon-service 可获得真实试穿效果。');
        }
        else {
            console.log('试衣：TRYON_API_URL 已配置，将请求真实试衣服务');
        }
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`端口 ${PORT} 已被占用，请关闭占用进程或修改 PORT 环境变量`);
        }
        else {
            console.error('服务监听失败', err);
        }
        process.exit(1);
    });
}
start().catch((e) => {
    console.error('启动失败', e);
    process.exit(1);
});
