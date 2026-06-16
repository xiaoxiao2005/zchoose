import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './SubmissionReview.css';

type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'all';

interface SubmissionItem {
  id: number;
  user_id: number;
  image_url?: string | null;
  image_access_url?: string | null;
  description?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at?: string;
}

export default function SubmissionReview() {
  const { token, handleUnauthorized } = useAuth();
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [list, setList] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<number | null>(null);

  const loadList = async () => {
    if (!token) {
      setError('请先登录');
      setList([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/submissions/review/list?status=${encodeURIComponent(status)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res)) {
        setError('登录已过期，请重新登录');
        setList([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '加载审核列表失败');
        setList([]);
        return;
      }
      setList(Array.isArray(data) ? data : []);
    } catch {
      setError('加载失败，请检查网络');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [status, token]);

  const review = async (id: number, action: 'accept' | 'reject') => {
    if (!token) return;
    setActingId(id);
    setError('');
    try {
      const res = await fetch(`/api/submissions/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res)) {
        setError('登录已过期，请重新登录');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `${action === 'accept' ? '通过' : '拒绝'}失败`);
        return;
      }
      await loadList();
    } catch {
      setError('操作失败，请稍后重试');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="submission-review">
      <h2 className="submission-review__title">投稿审核</h2>
      <div className="submission-review__filters">
        {(['pending', 'accepted', 'rejected', 'all'] as ReviewStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            className={status === s ? 'submission-review__tag submission-review__tag--active' : 'submission-review__tag'}
            onClick={() => setStatus(s)}
          >
            {s === 'pending' ? '待审核' : s === 'accepted' ? '已通过' : s === 'rejected' ? '已拒绝' : '全部'}
          </button>
        ))}
      </div>

      {error && <p className="submission-review__error">{error}</p>}
      {loading ? (
        <p className="submission-review__empty">加载中...</p>
      ) : list.length === 0 ? (
        <p className="submission-review__empty">暂无记录</p>
      ) : (
        <ul className="submission-review__list">
          {list.map((item) => (
            <li key={item.id} className="submission-review__item">
              {(item.image_access_url || item.image_url) ? (
                <img
                  src={(item.image_access_url || item.image_url) as string}
                  alt=""
                  className="submission-review__thumb"
                />
              ) : (
                <div className="submission-review__thumb submission-review__thumb--empty">无图</div>
              )}
              <div className="submission-review__meta">
                <p>投稿ID：{item.id} · 用户：{item.user_id}</p>
                <p>状态：{item.status === 'pending' ? '待审核' : item.status === 'accepted' ? '已通过' : '已拒绝'}</p>
                <p>{item.description || '无描述'}</p>
                {item.status === 'pending' && (
                  <div className="submission-review__actions">
                    <button
                      type="button"
                      className="submission-review__btn submission-review__btn--ok"
                      disabled={actingId === item.id}
                      onClick={() => void review(item.id, 'accept')}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      className="submission-review__btn submission-review__btn--reject"
                      disabled={actingId === item.id}
                      onClick={() => void review(item.id, 'reject')}
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

