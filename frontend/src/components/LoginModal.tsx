import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, REMEMBER_KEY, type RememberedCredentials } from '../contexts/AuthContext';
import { writeTryonPersonalInfoConsent } from './TryOnPersonalInfoConsent';
import './LoginModal.css';

type Tab = 'login' | 'register';

interface Props {
  onClose: () => void;
}

const CODE_COOLDOWN_SEC = 60;

export default function LoginModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showRememberPrompt, setShowRememberPrompt] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** 注册：同意隐私政策与个人信息处理规则（《个保法》告知同意） */
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeTryonConsent, setAgreeTryonConsent] = useState(false);
  const { login, register } = useAuth();

  // 预填已记住的手机号与密码
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as RememberedCredentials;
      if (saved.account) {
        setPhone(saved.account);
        setPassword(saved.password || '');
        setRememberPassword(!!saved.password);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const t = setInterval(() => setCodeCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [codeCooldown]);

  const handleSendCode = async () => {
    setError('');
    const p = phone.trim();
    if (!p) {
      setError('请先输入手机号');
      return;
    }
    if (!/^1\d{10}$/.test(p)) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/users/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '发送失败');
      setCodeCooldown(CODE_COOLDOWN_SEC);
      if (data.code) setCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const saveRemember = (acc: string, pwd: string) => {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ account: acc, password: pwd, type: 'phone' as const }));
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const p = phone.trim();
    if (!p) {
      setError('请填写手机号');
      return;
    }
    if (!/^1\d{10}$/.test(p)) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (!agreeTryonConsent) {
      setError('请先勾选同意试衣个人信息处理规则');
      return;
    }
    if (tab === 'register') {
      if (!code.trim()) {
        setError('请先获取并填写验证码');
        return;
      }
      if (password.length < 6) {
        setError('密码至少 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
      if (!agreePrivacy) {
        setError('请阅读并勾选同意《隐私政策》中的个人信息处理规则');
        return;
      }
    } else {
      if (!password) {
        setError('请填写密码');
        return;
      }
    }
    setLoading(true);
    setError('');
    // 让「提交中...」先渲染出来再发请求，避免手机端看起来像没反应
    await new Promise((r) => setTimeout(r, 0));
    try {
      if (tab === 'login') {
        await login(p, password);
        writeTryonPersonalInfoConsent(true);
        if (rememberPassword) saveRemember(p, password);
        onClose();
      } else {
        await register(p, code.trim(), password);
        writeTryonPersonalInfoConsent(true);
        if (rememberPassword) saveRemember(p, password);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal__backdrop" onClick={onClose} role="presentation">
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal__header">
          <span className="login-modal__title">Zchoose</span>
          <button type="button" className="login-modal__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="login-modal__tabs">
          <button
            type="button"
            className={tab === 'login' ? 'login-modal__tab login-modal__tab--active' : 'login-modal__tab'}
            onClick={() => {
              setTab('login');
              setAgreePrivacy(false);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={tab === 'register' ? 'login-modal__tab login-modal__tab--active' : 'login-modal__tab'}
            onClick={() => setTab('register')}
          >
            注册
          </button>
        </div>
        <form onSubmit={handleSubmit} className="login-modal__form">
          <label className="login-modal__label">
            手机号
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="请输入 11 位手机号"
              className="login-modal__input"
              autoComplete="tel"
              maxLength={11}
            />
          </label>
          {tab === 'register' && (
            <label className="login-modal__label login-modal__label--row">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="验证码"
                className="login-modal__input login-modal__input--code"
                maxLength={6}
              />
              <button
                type="button"
                className="login-modal__code-btn"
                onClick={handleSendCode}
                disabled={loading || codeCooldown > 0}
              >
                {codeCooldown > 0 ? `${codeCooldown}s 后重发` : '获取验证码'}
              </button>
            </label>
          )}
          <label className="login-modal__label">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => tab === 'register' && setShowRememberPrompt(true)}
              placeholder={tab === 'register' ? '至少 6 位' : '请输入密码'}
              className="login-modal__input"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {tab === 'register' && (
            <>
              <label className="login-modal__label">
                确认密码
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  className="login-modal__input"
                  autoComplete="new-password"
                />
              </label>
              {(showRememberPrompt || rememberPassword) && (
                <label className="login-modal__remember">
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(e) => setRememberPassword(e.target.checked)}
                  />
                  <span>是否记住密码？下次可在登录页直接登录</span>
                </label>
              )}
              <label className="login-modal__remember login-modal__remember--privacy">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                />
                <span>
                  我已阅读并同意
                  <Link to="/privacy?from=auth" className="login-modal__privacy-link" onClick={(e) => e.stopPropagation()}>
                    《隐私政策》
                  </Link>
                  ，知晓平台将按该政策处理我的手机号码等个人信息，用于注册、登录与安全验证。
                </span>
              </label>
            </>
          )}
          {tab === 'login' && (
            <>
              <label className="login-modal__remember">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                <span>记住密码，下次直接登录</span>
              </label>
              <label className="login-modal__remember login-modal__remember--privacy">
                <input
                  type="checkbox"
                  checked={agreeTryonConsent}
                  onChange={(e) => setAgreeTryonConsent(e.target.checked)}
                />
                <span>
                  我已阅读并同意
                  <Link to="/privacy?from=auth#试穿与体型数据" className="login-modal__privacy-link" onClick={(e) => e.stopPropagation()}>
                    《试衣个人信息处理规则》
                  </Link>
                </span>
              </label>
            </>
          )}
          {tab === 'register' && (
            <label className="login-modal__remember login-modal__remember--privacy">
              <input
                type="checkbox"
                checked={agreeTryonConsent}
                onChange={(e) => setAgreeTryonConsent(e.target.checked)}
              />
              <span>
                我已阅读并同意
                <Link to="/privacy?from=auth#试穿与体型数据" className="login-modal__privacy-link" onClick={(e) => e.stopPropagation()}>
                  《试衣个人信息处理规则》
                </Link>
              </span>
            </label>
          )}
          {error && <p className="login-modal__error">{error}</p>}
          <button type="submit" className="login-modal__submit" disabled={loading}>
            {loading ? '提交中...' : tab === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>
  );
}
