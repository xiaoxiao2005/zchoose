"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
exports.handleStripeWebhook = handleStripeWebhook;
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const membership_1 = require("../services/membership");
exports.paymentsRouter = (0, express_1.Router)();
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
function getStripe() {
    if (!STRIPE_SECRET)
        return null;
    return new stripe_1.default(STRIPE_SECRET);
}
/** 支付成功后的幂等处理 */
function processPaidSession(stripeSessionId) {
    const order = init_1.db
        .prepare('SELECT id, user_id, tier, status FROM payment_orders WHERE stripe_session_id = ?')
        .get(stripeSessionId);
    if (!order) {
        return { ok: false, message: '订单不存在' };
    }
    if (order.status === 'paid') {
        return { ok: true, message: '已处理过' };
    }
    (0, membership_1.activateMembershipAfterPayment)(order.user_id, order.tier);
    init_1.db.prepare(`UPDATE payment_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(order.id);
    return { ok: true };
}
/**
 * 创建 Stripe Checkout 会话（需配置 STRIPE_SECRET_KEY）
 */
exports.paymentsRouter.post('/create-checkout-session', auth_1.requireAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
        return res.status(503).json({
            error: '未配置 Stripe 密钥',
            hint: '在 backend/.env 设置 STRIPE_SECRET_KEY，或使用 POST /api/payments/mock-pay（仅开发）',
        });
    }
    const tier = (req.body?.tier ?? '');
    if (!(0, membership_1.isValidTier)(tier)) {
        return res.status(400).json({ error: 'tier 须为 monthly | quarterly | yearly' });
    }
    const userId = req.user.userId;
    const cfg = membership_1.TIER_CONFIG[tier];
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'cny',
                        product_data: {
                            name: `Zchoose ${cfg.label}会员`,
                            description: `当期可额外免费解锁 ${cfg.quota} 套积分解锁衣物，并赠送 ${cfg.bonusPoints} 积分`,
                        },
                        unit_amount: cfg.amountCents,
                    },
                    quantity: 1,
                },
            ],
            success_url: `${FRONTEND_URL}/me?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/me?payment=cancel`,
            metadata: {
                userId: String(userId),
                tier,
            },
        });
        if (!session.id || !session.url) {
            return res.status(500).json({ error: '创建支付会话失败' });
        }
        init_1.db.prepare(`INSERT INTO payment_orders (user_id, tier, amount_cents, stripe_session_id, status) VALUES (?, ?, ?, ?, 'pending')`).run(userId, tier, cfg.amountCents, session.id);
        res.json({ url: session.url, sessionId: session.id });
    }
    catch (e) {
        console.error('Stripe checkout error', e);
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ error: '支付创建失败', detail: msg });
    }
});
/**
 * 前端支付成功回跳后：主动确认会话（Webhook 未到时补单）
 */
exports.paymentsRouter.get('/complete-session', auth_1.requireAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
        return res.status(503).json({ error: '未配置 Stripe' });
    }
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
        return res.status(400).json({ error: '缺少 session_id' });
    }
    const userId = req.user.userId;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.metadata?.userId !== String(userId)) {
            return res.status(403).json({ error: '会话与当前用户不匹配' });
        }
        if (session.payment_status !== 'paid') {
            return res.json({ ok: false, payment_status: session.payment_status });
        }
        const result = processPaidSession(sessionId);
        return res.json({ ok: result.ok, message: result.message });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: '查询支付状态失败' });
    }
});
/**
 * 开发环境模拟支付成功（无需 Stripe）
 */
exports.paymentsRouter.post('/mock-pay', auth_1.requireAuth, (req, res) => {
    const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_PAYMENT_MOCK === '1';
    if (!allow) {
        return res.status(403).json({ error: '仅开发环境可用模拟支付' });
    }
    const tier = (req.body?.tier ?? '');
    if (!(0, membership_1.isValidTier)(tier)) {
        return res.status(400).json({ error: 'tier 须为 monthly | quarterly | yearly' });
    }
    const userId = req.user.userId;
    const cfg = membership_1.TIER_CONFIG[tier];
    const sid = `mock_${Date.now()}_${userId}`;
    init_1.db.prepare(`INSERT INTO payment_orders (user_id, tier, amount_cents, stripe_session_id, status, paid_at) VALUES (?, ?, ?, ?, 'paid', datetime('now'))`).run(userId, tier, cfg.amountCents, sid);
    (0, membership_1.activateMembershipAfterPayment)(userId, tier);
    res.json({ ok: true, message: '模拟支付成功，会员已开通', tier });
});
/** Stripe Webhook（需在 Stripe Dashboard 配置 endpoint，并设置 STRIPE_WEBHOOK_SECRET） */
async function handleStripeWebhook(req, res) {
    const stripe = getStripe();
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!stripe || !whSecret) {
        res.status(503).send('Webhook 未配置');
        return;
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
        res.status(400).send('缺少签名');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
    }
    catch (err) {
        console.error('Webhook signature error', err);
        res.status(400).send('签名无效');
        return;
    }
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.id && session.payment_status === 'paid') {
            processPaidSession(session.id);
        }
    }
    res.json({ received: true });
}
