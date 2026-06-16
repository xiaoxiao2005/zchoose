import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db/init';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { activateMembershipAfterPayment, isValidTier, TIER_CONFIG } from '../services/membership';

export const paymentsRouter = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET) return null;
  return new Stripe(STRIPE_SECRET);
}

/** 支付成功后的幂等处理 */
function processPaidSession(stripeSessionId: string): { ok: boolean; message?: string } {
  const order = db
    .prepare('SELECT id, user_id, tier, status FROM payment_orders WHERE stripe_session_id = ?')
    .get(stripeSessionId) as { id: number; user_id: number; tier: string; status: string } | undefined;

  if (!order) {
    return { ok: false, message: '订单不存在' };
  }
  if (order.status === 'paid') {
    return { ok: true, message: '已处理过' };
  }

  activateMembershipAfterPayment(order.user_id, order.tier);
  db.prepare(
    `UPDATE payment_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?`
  ).run(order.id);
  return { ok: true };
}

/**
 * 创建 Stripe Checkout 会话（需配置 STRIPE_SECRET_KEY）
 */
paymentsRouter.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: '未配置 Stripe 密钥',
      hint: '在 backend/.env 设置 STRIPE_SECRET_KEY，或使用 POST /api/payments/mock-pay（仅开发）',
    });
  }

  const tier = (req.body?.tier ?? '') as string;
  if (!isValidTier(tier)) {
    return res.status(400).json({ error: 'tier 须为 monthly | quarterly | yearly' });
  }

  const userId = req.user!.userId;
  const cfg = TIER_CONFIG[tier];

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

    db.prepare(
      `INSERT INTO payment_orders (user_id, tier, amount_cents, stripe_session_id, status) VALUES (?, ?, ?, ?, 'pending')`
    ).run(userId, tier, cfg.amountCents, session.id);

    res.json({ url: session.url, sessionId: session.id });
  } catch (e: unknown) {
    console.error('Stripe checkout error', e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: '支付创建失败', detail: msg });
  }
});

/**
 * 前端支付成功回跳后：主动确认会话（Webhook 未到时补单）
 */
paymentsRouter.get('/complete-session', requireAuth, async (req: AuthRequest, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: '未配置 Stripe' });
  }

  const sessionId = String(req.query.session_id || '').trim();
  if (!sessionId) {
    return res.status(400).json({ error: '缺少 session_id' });
  }

  const userId = req.user!.userId;

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
  } catch (e: unknown) {
    console.error(e);
    return res.status(500).json({ error: '查询支付状态失败' });
  }
});

/**
 * 开发环境模拟支付成功（无需 Stripe）
 */
paymentsRouter.post('/mock-pay', requireAuth, (req: AuthRequest, res: Response) => {
  const allow =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_PAYMENT_MOCK === '1';
  if (!allow) {
    return res.status(403).json({ error: '仅开发环境可用模拟支付' });
  }

  const tier = (req.body?.tier ?? '') as string;
  if (!isValidTier(tier)) {
    return res.status(400).json({ error: 'tier 须为 monthly | quarterly | yearly' });
  }

  const userId = req.user!.userId;
  const cfg = TIER_CONFIG[tier];

  const sid = `mock_${Date.now()}_${userId}`;
  db.prepare(
    `INSERT INTO payment_orders (user_id, tier, amount_cents, stripe_session_id, status, paid_at) VALUES (?, ?, ?, ?, 'paid', datetime('now'))`
  ).run(userId, tier, cfg.amountCents, sid);

  activateMembershipAfterPayment(userId, tier);

  res.json({ ok: true, message: '模拟支付成功，会员已开通', tier });
});

/** Stripe Webhook（需在 Stripe Dashboard 配置 endpoint，并设置 STRIPE_WEBHOOK_SECRET） */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, whSecret);
  } catch (err: unknown) {
    console.error('Webhook signature error', err);
    res.status(400).send('签名无效');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id && session.payment_status === 'paid') {
      processPaidSession(session.id);
    }
  }

  res.json({ received: true });
}
