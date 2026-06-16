import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './SupportReview.css';

type ReqStatus = 'pending' | 'contacted' | 'completed' | 'closed' | 'all';

interface SupportRequestItem {
  id: number;
  user_id: number;
  user_phone?: string | null;
  request_type: string;
  content?: string | null;
  status: 'pending' | 'contacted' | 'completed' | 'closed';
  handle_note?: string | null;
  created_at?: string;
}

export default function SupportReview() {
  const { token, handleUnauthorized } = useAuth();
  const [status, setStatus] = useState<ReqStatus>('pending');
  const [list, setList] = useState<SupportRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<number | null>(null);

  const loadList = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/support/requests/review?status=${encodeURIComponent(status)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res)) {
        setError('登录已过期，请重新登录');
        setList([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '加载失败');
        setList([]);
        return;
      }
      setList(Array.isArray(data) ? data : []);
    } catch {
      setError('网络错误，请稍后重试');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [status, token]);

  const updateStatus = async (id: number, nextStatus: 'contacted' | 'completed' | 'closed') => {
    if (!token) return;
    setActingId(id);
    setError('');
    try {
      const res = await fetch(`/api/support/requests/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (handleUnauthorized(res)) {
        setError('登录已过期，请重新登录');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '更新状态失败');
        return;
      }
      await loadList();
    } catch {
      setError('更新失败，请稍后重试');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="support-review">
      <h2 className="support-review__title">客服工单</h2>
      <div className="support-review__filters">
        {(['pending', 'contacted', 'completed', 'closed', 'all'] as ReqStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            className={status === s ? 'support-review__tag support-review__tag--active' : 'support-review__tag'}
            onClick={() => setStatus(s)}
          >
            {s === 'pending' ? '待处理' : s === 'contacted' ? '已联系' : s === 'completed' ? '已完成' : s === 'closed' ? '已关闭' : '全部'}
          </button>
        ))}
      </div>
      {error && <p className="support-review__error">{error}</p>}
      {loading ? (
        <p className="support-review__empty">加载中...</p>
      ) : list.length === 0 ? (
        <p className="support-review__empty">暂无工单</p>
      ) : (
        <ul className="support-review__list">
          {list.map((item) => (
            <li key={item.id} className="support-review__item">
              <div className="support-review__meta">
                <p>工单#{item.id} · 用户ID {item.user_id}{item.user_phone ? ` · 手机 ${item.user_phone}` : ''}</p>
                <p>类型：{item.request_type}</p>
                <p>状态：{item.status}</p>
                <p>{item.content || '无内容'}</p>
              </div>
              <div className="support-review__actions">
                <button type="button" disabled={actingId === item.id} onClick={() => void updateStatus(item.id, 'contacted')}>标记已联系</button>
                <button type="button" disabled={actingId === item.id} onClick={() => void updateStatus(item.id, 'completed')}>标记已完成</button>
                <button type="button" disabled={actingId === item.id} onClick={() => void updateStatus(item.id, 'closed')}>关闭</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

