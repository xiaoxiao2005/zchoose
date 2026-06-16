import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MEMBERSHIP_TIERS } from '../data/membershipTiers';
import './Support.css';

interface Message {
  id: number;
  role: string;
  content: string | null;
  image_url: string | null;
  is_transfer_human: number;
  created_at: string;
}

export default function Support() {
  const { user, token, handleUnauthorized } = useAuth();
  const [history, setHistory] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // 投稿搭配
  const [subImageUrl, setSubImageUrl] = useState<string | null>(null);
  const [subImageFile, setSubImageFile] = useState<File | null>(null);
  const [subDesc, setSubDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  // 购买积分申请
  const [pointsRequesting, setPointsRequesting] = useState(false);
  const [pointsRequestDone, setPointsRequestDone] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  const loadHistory = () => {
    if (!user?.userId) return;
    fetch(`/api/support/history/${user.userId}?limit=50`)
      .then((res) => res.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    if (!user?.userId) {
      setHistory([]);
      return;
    }
    loadHistory();
  }, [user?.userId]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [history]);

  const sendMessage = async (transferHuman: boolean, contentOverride?: string): Promise<void> => {
    if (!user?.userId) return;
    let finalImageUrl = imageUrl;
    if (imageFile && !finalImageUrl?.startsWith('http') && !finalImageUrl?.startsWith('/')) {
      const form = new FormData();
      form.append('photo', imageFile);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const up = await fetch('/api/upload/photo', { method: 'POST', headers, body: form });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) {
        if (handleUnauthorized(up)) alert('登录已过期，请重新登录');
        return;
      }
      finalImageUrl = upData.photo_url ?? null;
    }
    const content = contentOverride ?? (transferHuman ? (text || '希望转人工客服') : text);
    if (!content && !finalImageUrl) return;

    if (transferHuman) setTransferring(true);
    else setSending(true);
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          text: content,
          image_url: contentOverride ? undefined : (finalImageUrl ?? undefined),
          transferHuman: transferHuman || undefined,
          leaveMessage: transferHuman ? content : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          alert('登录已过期，请重新登录');
          return;
        }
        throw new Error((data.error as string) || '发送失败');
      }
      loadHistory();
      if (!contentOverride) {
        setText('');
        setImageUrl(null);
        setImageFile(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '发送失败');
    } finally {
      setSending(false);
      setTransferring(false);
    }
  };

  const onImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const onSubImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubImageFile(file);
    setSubImageUrl(URL.createObjectURL(file));
  };

  const submitOutfit = async () => {
    if (!user?.userId) return;
    let url = subImageUrl;
    if (subImageFile && (!url || url.startsWith('blob:'))) {
      const form = new FormData();
      form.append('photo', subImageFile);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/upload/photo', { method: 'POST', headers, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          alert('登录已过期，请重新登录');
          return;
        }
        alert((data.error as string) || '上传失败');
        return;
      }
      url = data.photo_url;
    }
    if (!url) {
      alert('请先上传搭配图');
      return;
    }
    setSubmitting(true);
    setSubmitDone(false);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, image_url: url, description: subDesc || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      setSubImageUrl(null);
      setSubImageFile(null);
      setSubDesc('');
      setSubmitDone(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const requestPurchasePoints = async () => {
    if (!user?.userId || !token) return;
    setPointsRequesting(true);
    setPointsRequestDone(false);
    try {
      const res = await fetch('/api/support/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_type: 'points_or_membership',
          content: '我想购买积分/开通会员，请告知购买方式与价格。',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          alert('登录已过期，请重新登录');
          return;
        }
        throw new Error((data.error as string) || '提交失败');
      }
      setPointsRequestDone(true);
      await sendMessage(true, '我已提交购买积分/会员申请，请客服尽快联系我。');
    } finally {
      setPointsRequesting(false);
    }
  };

  if (!user) {
    return (
      <div className="support">
        <p className="support__login-hint">请先登录后使用客服功能</p>
        <div className="support__links">
          <Link to="/login">去登录</Link>
          <span>·</span>
          <Link to="/me?tab=submissions">投稿我的搭配（我的）</Link>
          <span>·</span>
          <Link to="/me?tab=douyin">抖音解锁说明（我的）</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="support">
      <h1 className="support__title">客服与帮助</h1>
      <p className="support__intro">您可以在此投稿搭配、申请购买积分，或联系客服处理其他问题。</p>

      {/* 投稿搭配 */}
      <section className="support__card">
        <h2 className="support__card-title">投稿搭配</h2>
        <p className="support__card-desc">上传您的穿搭图片与简要描述，审核采纳后将获得积分奖励，可用于解锁衣库中的专属搭配。</p>
        <div className="support__sub-form">
          <label className="support__upload-area">
            <input type="file" accept="image/*" onChange={onSubImageChange} />
            {subImageUrl ? (
              <img src={subImageUrl} alt="搭配预览" className="support__preview-img" />
            ) : (
              <span className="support__upload-placeholder">点击上传搭配图</span>
            )}
          </label>
          <input
            type="text"
            className="support__desc-input"
            placeholder="描述（选填，如场合、风格）"
            value={subDesc}
            onChange={(e) => setSubDesc(e.target.value)}
          />
          <div className="support__card-actions">
            <button
              type="button"
              className="support__btn support__btn--primary"
              disabled={submitting || !subImageUrl}
              onClick={submitOutfit}
            >
              {submitting ? '提交中...' : '提交投稿'}
            </button>
            <Link to="/me?tab=submissions" className="support__link">查看我的投稿</Link>
          </div>
        </div>
        {submitDone && <p className="support__success">投稿已提交，审核通过后将获得积分。</p>}
      </section>

      {/* 会员档位 */}
      <section className="support__card">
        <h2 className="support__card-title">会员档位</h2>
        <p className="support__card-desc">开通会员后，下载试衣图将<strong>不带水印</strong>。档位与价格如下：</p>
        <ul className="support__tiers">
          {MEMBERSHIP_TIERS.map((t) => (
            <li key={t.id} className="support__tier">
              <span className="support__tier-name">{t.name}</span>
              <span className="support__tier-price">{t.priceLabel}</span>
              <span className="support__tier-duration">（{t.duration}）</span>
            </li>
          ))}
        </ul>
        <p className="support__card-desc support__card-desc--small">月卡 10 元 · 季卡 35 元 · 年卡 100 元。点击下方按钮向客服申请开通。</p>
        <div className="support__card-actions">
          <button
            type="button"
            className="support__btn support__btn--secondary"
            disabled={pointsRequesting}
            onClick={requestPurchasePoints}
          >
            {pointsRequesting ? '提交中...' : '申请购买积分/开通会员'}
          </button>
        </div>
        {pointsRequestDone && <p className="support__success">已提交申请，客服将尽快联系您并告知购买方式与价格。</p>}
      </section>

      {/* 购买积分（与会员共用申请入口，保留说明） */}
      <section className="support__card">
        <h2 className="support__card-title">购买积分</h2>
        <p className="support__card-desc">积分用于解锁衣库中的<strong>星座专属穿搭</strong>等专属搭配。每日 50 试衣积分会清零，仅限当日试衣使用；投稿所得积分不会清零、可累积，用于解锁上述款式后试穿。如需仅购买积分（不开通会员），也可通过上方按钮联系客服。</p>
      </section>

      {/* 其他问题：展开聊天 */}
      <section className="support__card support__card--chat">
        <button
          type="button"
          className="support__toggle-chat"
          onClick={() => setShowChat(!showChat)}
        >
          {showChat ? '收起' : '其他问题？联系客服'}
        </button>
        {showChat && (
          <>
            <div className="support__list" ref={listRef}>
              {history.length === 0 && (
                <p className="support__empty">暂无消息，输入内容发送或点击「转人工」</p>
              )}
              {history.map((m) => (
                <div key={m.id} className={`support__msg support__msg--${m.role}`}>
                  {m.image_url && <img src={m.image_url} alt="" className="support__msg-img" />}
                  {m.content && <div className="support__msg-text">{m.content}</div>}
                  {m.is_transfer_human ? <span className="support__msg-tag">已转人工</span> : null}
                  <div className="support__msg-time">{m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}</div>
                </div>
              ))}
            </div>
            <div className="support__input">
              <label className="support__upload">
                <input type="file" accept="image/*" onChange={onImageChange} />
                {imageUrl ? '已选图' : '📷'}
              </label>
              <input
                type="text"
                className="support__text"
                placeholder="输入消息..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(false)}
              />
              <button
                type="button"
                className="support__send"
                disabled={sending || transferring}
                onClick={() => sendMessage(false)}
              >
                {sending ? '发送中...' : '发送'}
              </button>
              <button
                type="button"
                className="support__human"
                disabled={sending || transferring}
                onClick={() => sendMessage(true)}
              >
                {transferring ? '提交中...' : '转人工'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
