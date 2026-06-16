"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const init_1 = require("../db/init");
const loginStreak_1 = require("../services/loginStreak");
const auth_1 = require("../middleware/auth");
const uploadAccess_1 = require("../services/uploadAccess");
const membership_1 = require("../services/membership");
exports.usersRouter = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
const CODE_EXPIRE_MINUTES = 5;
function isReviewer(userId) {
    const ids = (process.env.REVIEWER_USER_IDS || '')
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0);
    if (ids.includes(userId))
        return true;
    const phones = (process.env.REVIEWER_PHONES || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    if (phones.length === 0)
        return false;
    const user = init_1.db.prepare('SELECT phone FROM users WHERE id = ?').get(userId);
    return !!(user?.phone && phones.includes(user.phone));
}
function randomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
// 发送验证码：仅手机号。当前未接短信服务时，响应中返回 code 供测试。
exports.usersRouter.post('/send-code', (req, res) => {
    const { phone } = req.body || {};
    const target = phone != null ? String(phone).trim() : '';
    if (!target) {
        return res.status(400).json({ error: '请输入手机号' });
    }
    if (!/^1\d{10}$/.test(target)) {
        return res.status(400).json({ error: '请输入正确的 11 位手机号' });
    }
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000).toISOString();
    init_1.db.prepare('DELETE FROM verification_codes WHERE target = ? AND type = ?').run(target, 'phone');
    init_1.db.prepare('INSERT INTO verification_codes (target, type, code, expires_at) VALUES (?, ?, ?, ?)').run(target, 'phone', code, expiresAt);
    res.json({ message: '验证码已发送', code: process.env.NODE_ENV !== 'production' ? code : undefined });
});
// 注册：手机号 + 验证码 + 密码，返回 JWT
exports.usersRouter.post('/register', (req, res) => {
    try {
        const { phone, code, password } = req.body || {};
        const target = phone != null ? String(phone).trim() : '';
        if (!target || !code || !password) {
            return res.status(400).json({ error: '请提供手机号、验证码和密码（至少 6 位）' });
        }
        if (!/^1\d{10}$/.test(target)) {
            return res.status(400).json({ error: '请输入正确的 11 位手机号' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ error: '密码至少 6 位字符' });
        }
        const row = init_1.db.prepare('SELECT code, expires_at FROM verification_codes WHERE target = ? AND type = ? ORDER BY id DESC LIMIT 1').get(target, 'phone');
        if (!row || row.code !== String(code).trim()) {
            return res.status(400).json({ error: '验证码错误' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(400).json({ error: '验证码已过期，请重新获取' });
        }
        const password_hash = bcryptjs_1.default.hashSync(String(password), 10);
        init_1.db.prepare('DELETE FROM verification_codes WHERE target = ? AND type = ?').run(target, 'phone');
        const stmt = init_1.db.prepare('INSERT INTO users (phone, email, password_hash) VALUES (?, NULL, ?)');
        const result = stmt.run(target, password_hash);
        const id = Number(result.lastInsertRowid);
        const token = jsonwebtoken_1.default.sign({ userId: id, phone: target }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
        const { streakDays, energyAdded } = (0, loginStreak_1.recordLogin)(id);
        return res.status(201).json({ token, userId: id, phone: target, role: 'user', streakDays, energyAdded });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE') || msg.includes('constraint')) {
            return res.status(409).json({ error: '该手机号已注册' });
        }
        console.error('register error', e);
        return res.status(500).json({ error: '注册失败，请稍后再试' });
    }
});
// 登录：手机号 + 密码，返回 JWT
exports.usersRouter.post('/login', (req, res) => {
    const { phone, password } = req.body;
    const target = phone != null ? String(phone).trim() : '';
    if (!target || !password) {
        return res.status(400).json({ error: '请提供手机号和密码' });
    }
    const row = init_1.db.prepare('SELECT id, password_hash, phone, role FROM users WHERE phone = ?').get(target);
    if (!row) {
        return res.status(401).json({ error: '账号或密码错误' });
    }
    const ok = bcryptjs_1.default.compareSync(String(password), row.password_hash);
    if (!ok) {
        return res.status(401).json({ error: '账号或密码错误' });
    }
    const token = jsonwebtoken_1.default.sign({ userId: row.id, phone: row.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    const { streakDays, energyAdded } = (0, loginStreak_1.recordLogin)(row.id);
    const role = row.role === 'merchant' ? 'merchant' : 'user';
    return res.json({ token, userId: row.id, phone: row.phone, role, streakDays, energyAdded });
});
/** 获取用户资料（昵称、头像）；本人请求且头像为上传文件时附带可访问 URL 以保护隐私 */
exports.usersRouter.get('/:userId/profile', auth_1.optionalAuth, (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: '无效的 userId' });
    }
    const row = init_1.db
        .prepare('SELECT nickname, avatar_url, preferred_gender, preferred_age, role, is_member, member_expires_at, member_tier, member_free_unlocks_remaining FROM users WHERE id = ?')
        .get(userId);
    if (!row) {
        return res.status(404).json({ error: '用户不存在' });
    }
    const avatar_url = row.avatar_url ?? '';
    const role = row.role === 'merchant' ? 'merchant' : 'user';
    const verifyRow = init_1.db.prepare('SELECT status FROM merchant_verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    const merchantVerificationStatus = verifyRow?.status === 'approved'
        ? 'approved'
        : verifyRow?.status === 'rejected'
            ? 'rejected'
            : verifyRow?.status === 'pending'
                ? 'pending'
                : 'none';
    const membershipActive = (0, membership_1.isMembershipActive)(userId);
    const out = {
        userId,
        nickname: row.nickname ?? '',
        avatar_url,
        preferred_gender: row.preferred_gender ?? '',
        preferred_age: row.preferred_age ?? '',
        role,
        is_member: row.is_member === 1,
        membership_active: membershipActive,
        member_expires_at: row.member_expires_at ?? null,
        member_tier: row.member_tier ?? null,
        member_free_unlocks_remaining: Math.max(0, Number(row.member_free_unlocks_remaining) || 0),
        merchant_verification_status: merchantVerificationStatus,
    };
    // 头像为上传路径时返回公开展示 URL（头像不做隐私保护，任何人可访问）
    const isUploadAvatar = avatar_url && (avatar_url.startsWith('/uploads/') || avatar_url.includes('/uploads/'));
    if (isUploadAvatar) {
        const filename = (0, uploadAccess_1.filenameFromPath)(avatar_url);
        if (filename) {
            out.avatar_display_url = `/api/upload/avatar/${encodeURIComponent(filename)}`;
        }
    }
    res.json(out);
});
/** 用户提交商家资质申请：通过后才可升级为商家 */
exports.usersRouter.post('/:userId/merchant-verification', auth_1.requireAuth, (req, res) => {
    const userId = Number(req.params.userId);
    const requesterId = Number(req.user?.userId || 0);
    if (!Number.isInteger(userId) || userId <= 0)
        return res.status(400).json({ error: '无效的 userId' });
    if (requesterId !== userId)
        return res.status(403).json({ error: '无权操作' });
    const exists = init_1.db.prepare('SELECT id, phone, nickname FROM users WHERE id = ?').get(userId);
    if (!exists)
        return res.status(404).json({ error: '用户不存在' });
    const { company_name, license_no, contact_name, contact_phone } = req.body || {};
    const companyName = String(company_name || '').trim().slice(0, 100);
    const licenseNo = String(license_no || '').trim().slice(0, 100);
    const contactName = String(contact_name || exists.nickname || '').trim().slice(0, 50);
    const contactPhone = String(contact_phone || exists.phone || '').trim().slice(0, 20);
    if (!companyName || !licenseNo) {
        return res.status(400).json({ error: '请填写公司名称与资质编号' });
    }
    const latest = init_1.db.prepare('SELECT id, status FROM merchant_verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    if (latest?.status === 'pending') {
        init_1.db.prepare(`UPDATE merchant_verification_requests
       SET company_name = ?, license_no = ?, contact_name = ?, contact_phone = ?, updated_at = datetime('now')
       WHERE id = ?`).run(companyName, licenseNo, contactName || null, contactPhone || null, latest.id);
    }
    else {
        init_1.db.prepare(`INSERT INTO merchant_verification_requests
       (user_id, company_name, license_no, contact_name, contact_phone, status, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`).run(userId, companyName, licenseNo, contactName || null, contactPhone || null);
    }
    // 审核通过前保持普通用户身份
    init_1.db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
    const row = init_1.db.prepare('SELECT id, user_id, company_name, license_no, contact_name, contact_phone, status, created_at, updated_at FROM merchant_verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    res.status(201).json(row);
});
/** 审核员查看商家资质申请 */
exports.usersRouter.get('/merchant-verification/review/list', auth_1.requireAuth, (req, res) => {
    const reviewerId = Number(req.user?.userId || 0);
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const status = String(req.query.status || 'pending').trim();
    const sql = status === 'all'
        ? `SELECT r.*, u.phone, u.nickname FROM merchant_verification_requests r
       LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC`
        : `SELECT r.*, u.phone, u.nickname FROM merchant_verification_requests r
       LEFT JOIN users u ON u.id = r.user_id WHERE r.status = ? ORDER BY r.id DESC`;
    const rows = status === 'all' ? init_1.db.prepare(sql).all() : init_1.db.prepare(sql).all(status);
    res.json(rows);
});
/** 审核员通过商家资质 */
exports.usersRouter.post('/merchant-verification/:id/approve', auth_1.requireAuth, (req, res) => {
    const reviewerId = Number(req.user?.userId || 0);
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const id = Number(req.params.id);
    const row = init_1.db.prepare('SELECT id, user_id, status, company_name, license_no FROM merchant_verification_requests WHERE id = ?').get(id);
    if (!row)
        return res.status(404).json({ error: '申请不存在' });
    if (row.status !== 'pending')
        return res.status(400).json({ error: '该申请已处理' });
    init_1.db.prepare(`UPDATE merchant_verification_requests
     SET status = 'approved', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`).run(reviewerId, String(req.body?.note || '').trim() || null, id);
    init_1.db.prepare("UPDATE users SET role = 'merchant' WHERE id = ?").run(row.user_id);
    const merchantName = String(row.company_name || '').trim() || `商家-${row.user_id}`;
    const companyName = String(row.company_name || '').trim() || null;
    const licenseNo = String(row.license_no || '').trim() || null;
    const existingMerchant = init_1.db.prepare('SELECT id FROM merchants WHERE owner_user_id = ? LIMIT 1').get(row.user_id);
    if (existingMerchant) {
        init_1.db.prepare(`UPDATE merchants
       SET name = ?, company_name = ?, license_no = ?, verification_status = 'approved', verified_at = datetime('now')
       WHERE id = ?`).run(merchantName, companyName, licenseNo, existingMerchant.id);
    }
    else {
        init_1.db.prepare(`INSERT INTO merchants (name, owner_user_id, company_name, license_no, verification_status, verified_at)
       VALUES (?, ?, ?, ?, 'approved', datetime('now'))`).run(merchantName, row.user_id, companyName, licenseNo);
    }
    const updated = init_1.db.prepare('SELECT * FROM merchant_verification_requests WHERE id = ?').get(id);
    res.json(updated);
});
/** 审核员拒绝商家资质 */
exports.usersRouter.post('/merchant-verification/:id/reject', auth_1.requireAuth, (req, res) => {
    const reviewerId = Number(req.user?.userId || 0);
    if (!reviewerId || !isReviewer(reviewerId))
        return res.status(403).json({ error: '无审核权限' });
    const id = Number(req.params.id);
    const row = init_1.db.prepare('SELECT id, user_id, status FROM merchant_verification_requests WHERE id = ?').get(id);
    if (!row)
        return res.status(404).json({ error: '申请不存在' });
    if (row.status !== 'pending')
        return res.status(400).json({ error: '该申请已处理' });
    init_1.db.prepare(`UPDATE merchant_verification_requests
     SET status = 'rejected', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`).run(reviewerId, String(req.body?.note || '').trim() || null, id);
    init_1.db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(row.user_id);
    init_1.db.prepare("UPDATE merchants SET verification_status = 'rejected' WHERE owner_user_id = ?").run(row.user_id);
    const updated = init_1.db.prepare('SELECT * FROM merchant_verification_requests WHERE id = ?').get(id);
    res.json(updated);
});
/** 开通会员（买了积分后由客服/管理或支付回调调用）。Body: { adminSecret }，需与环境变量 ADMIN_SECRET 一致 */
exports.usersRouter.post('/:userId/set-member', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: '无效的 userId' });
    }
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        return res.status(501).json({ error: '未配置 ADMIN_SECRET，无法开通会员' });
    }
    const { adminSecret } = req.body || {};
    if (adminSecret !== secret) {
        return res.status(403).json({ error: '密钥错误' });
    }
    const exists = init_1.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!exists) {
        return res.status(404).json({ error: '用户不存在' });
    }
    init_1.db.prepare('UPDATE users SET is_member = 1 WHERE id = ?').run(userId);
    res.json({ ok: true, message: '已开通会员，下载试衣图将不再带水印' });
});
/** 更新用户资料（昵称、头像 URL） */
exports.usersRouter.put('/:userId/profile', (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: '无效的 userId' });
    }
    const { nickname, avatar_url, preferred_gender, preferred_age, role: roleBody } = req.body || {};
    const nicknameStr = nickname != null ? String(nickname).trim().slice(0, 32) : null;
    const avatarStr = avatar_url != null ? String(avatar_url).trim().slice(0, 512) : null;
    const genderStr = preferred_gender != null ? String(preferred_gender).trim() : null;
    const ageStr = preferred_age != null ? String(preferred_age).trim() : null;
    const roleStr = roleBody === 'merchant' ? 'merchant' : roleBody === 'user' ? 'user' : null;
    const exists = init_1.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!exists) {
        return res.status(404).json({ error: '用户不存在' });
    }
    if (roleStr !== null) {
        if (roleStr === 'merchant') {
            const approved = init_1.db.prepare("SELECT id FROM merchant_verification_requests WHERE user_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1").get(userId);
            if (!approved) {
                init_1.db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
            }
            else {
                init_1.db.prepare("UPDATE users SET role = 'merchant' WHERE id = ?").run(userId);
            }
        }
        else {
            init_1.db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
        }
    }
    init_1.db.prepare('UPDATE users SET nickname = ?, avatar_url = ?, preferred_gender = ?, preferred_age = ? WHERE id = ?').run(nicknameStr ?? null, avatarStr || null, (genderStr === '男' || genderStr === '女' ? genderStr : null), (ageStr && ['少年', '青年', '中年', '老年'].includes(ageStr) ? ageStr : null), userId);
    const row = init_1.db.prepare('SELECT nickname, avatar_url, preferred_gender, preferred_age, role FROM users WHERE id = ?').get(userId);
    const role = row.role === 'merchant' ? 'merchant' : 'user';
    const out = {
        userId,
        nickname: row.nickname ?? '',
        avatar_url: row.avatar_url ?? '',
        preferred_gender: row.preferred_gender ?? '',
        preferred_age: row.preferred_age ?? '',
        role,
    };
    if (row.avatar_url && (row.avatar_url.startsWith('/uploads/') || row.avatar_url.includes('/uploads/'))) {
        const filename = (0, uploadAccess_1.filenameFromPath)(row.avatar_url);
        if (filename) {
            out.avatar_display_url = `/api/upload/avatar/${encodeURIComponent(filename)}`;
        }
    }
    res.json(out);
});
