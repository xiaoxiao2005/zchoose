import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AdminTagCorrection.css';

const STORAGE_KEY = 'admin_tag_correction_secret';

interface Item {
  id: number;
  name: string;
  image_url?: string | null;
  style_tags?: string | null;
  need_points?: number;
}

interface ListResponse {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

function buildHeaders(secret: string, token: string | null): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Secret': secret,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export default function AdminTagCorrection() {
  const { token, handleUnauthorized } = useAuth();
  const [secret, setSecret] = useState(() => sessionStorage.getItem(STORAGE_KEY) || '');
  const [unlocked, setUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [q, setQ] = useState('');
  const [path, setPath] = useState('');
  const [sort, setSort] = useState<'id_asc' | 'id_desc' | 'created_desc'>('id_asc');
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [list, setList] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [editingTags, setEditingTags] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchTags, setBatchTags] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const tryUnlock = async () => {
    setUnlockError('');
    const s = secret.trim();
    if (!s) {
      setUnlockError('请输入 ADMIN_SECRET');
      return;
    }
    if (!token) {
      setUnlockError('请先登录');
      return;
    }
    try {
      const res = await fetch(`/api/admin/outfits?pageSize=1&page=1`, {
        headers: buildHeaders(s, token),
      });
      if (handleUnauthorized(res)) {
        setUnlockError('登录已过期，请重新登录');
        setUnlocked(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setUnlockError(data?.error || '后端未配置 ADMIN_SECRET');
        setUnlocked(false);
        return;
      }
      if (!res.ok) {
        setUnlockError(data?.error || '验证失败');
        setUnlocked(false);
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, s);
      setUnlocked(true);
    } catch {
      setUnlockError('网络错误');
      setUnlocked(false);
    }
  };

  useEffect(() => {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s && token) {
      setSecret(s);
      void (async () => {
        try {
          const res = await fetch(`/api/admin/outfits?pageSize=1&page=1`, {
            headers: buildHeaders(s, token),
          });
          if (handleUnauthorized(res)) {
            sessionStorage.removeItem(STORAGE_KEY);
            return;
          }
          if (res.ok) setUnlocked(true);
          else sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      })();
    }
  }, [token, handleUnauthorized]);

  const loadList = useCallback(async () => {
    const s = sessionStorage.getItem(STORAGE_KEY) || secret.trim();
    if (!s || !token) return;
    setLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (q.trim()) params.set('q', q.trim());
      if (path.trim()) params.set('path', path.trim());
      const res = await fetch(`/api/admin/outfits?${params}`, { headers: buildHeaders(s, token) });
      const data = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (handleUnauthorized(res)) {
        setListError('登录已过期，请重新登录');
        setList([]);
        return;
      }
      if (!res.ok) {
        setListError(data?.error || '加载失败');
        setList([]);
        if (res.status === 403 || res.status === 501) {
          setUnlocked(false);
          sessionStorage.removeItem(STORAGE_KEY);
        }
        return;
      }
      setList(data.items || []);
      setTotal(data.total ?? 0);
      setEditingTags((prev) => {
        const next = { ...prev };
        (data.items || []).forEach((it) => {
          if (next[it.id] === undefined) next[it.id] = it.style_tags ?? '';
        });
        return next;
      });
    } catch {
      setListError('网络错误');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, q, path, sort, secret, token, handleUnauthorized]);

  useEffect(() => {
    if (!unlocked) return;
    void loadList();
  }, [unlocked, loadList]);

  const saveOne = async (id: number) => {
    const s = sessionStorage.getItem(STORAGE_KEY) || secret.trim();
    if (!s || !token) return;
    setSavingId(id);
    setListError('');
    try {
      const res = await fetch(`/api/admin/outfits/${id}`, {
        method: 'PATCH',
        headers: buildHeaders(s, token),
        body: JSON.stringify({ style_tags: editingTags[id] ?? '' }),
      });
      if (handleUnauthorized(res)) {
        setListError('登录已过期，请重新登录');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(data?.error || '保存失败');
        return;
      }
      setList((prev) => prev.map((row) => (row.id === id ? { ...row, style_tags: data.style_tags } : row)));
    } catch {
      setListError('保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllOnPage = () => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map((x) => x.id)));
  };

  const applyBatch = async () => {
    const s = sessionStorage.getItem(STORAGE_KEY) || secret.trim();
    if (!s || !token || selected.size === 0) return;
    setBatchBusy(true);
    setListError('');
    try {
      const res = await fetch(`/api/admin/outfits/batch`, {
        method: 'PATCH',
        headers: buildHeaders(s, token),
        body: JSON.stringify({ ids: [...selected], style_tags: batchTags }),
      });
      if (handleUnauthorized(res)) {
        setListError('登录已过期，请重新登录');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(data?.error || '批量保存失败');
        return;
      }
      setSelected(new Set());
      void loadList();
    } catch {
      setListError('批量保存失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!unlocked) {
    return (
      <div className="admin-tags">
        <h1 className="admin-tags__title">衣库标签 · 人工校正</h1>
        <p className="admin-tags__hint">
          已登录账号可继续：请输入与后端 <code className="admin-tags__code">ADMIN_SECRET</code> 一致的密钥。密钥仅保存在本机浏览器{' '}
          <code className="admin-tags__code">sessionStorage</code>，关闭标签页后需重新输入。
        </p>
        <div className="admin-tags__unlock">
          <input
            type="password"
            className="admin-tags__input"
            placeholder="ADMIN_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
          <button type="button" className="admin-tags__btn" onClick={() => void tryUnlock()}>
            验证并进入
          </button>
        </div>
        {unlockError ? <p className="admin-tags__error">{unlockError}</p> : null}
      </div>
    );
  }

  return (
    <div className="admin-tags">
      <h1 className="admin-tags__title">衣库标签 · 人工校正</h1>
      <p className="admin-tags__hint">
        按行编辑 <code className="admin-tags__code">style_tags</code>（逗号分隔），保存后写入数据库并走与接口相同的清洗规则。支持按关键词或图片路径子串筛选、批量覆盖标签。
      </p>

      <div className="admin-tags__filters">
        <input
          className="admin-tags__input admin-tags__input--grow"
          placeholder="名称或标签包含…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="admin-tags__input admin-tags__input--grow"
          placeholder="图片路径包含（如目录名）"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="admin-tags__select"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="id_asc">id 升序</option>
          <option value="id_desc">id 降序</option>
          <option value="created_desc">创建时间降序</option>
        </select>
        <button type="button" className="admin-tags__btn admin-tags__btn--ghost" onClick={() => void loadList()}>
          刷新
        </button>
      </div>

      {listError ? <p className="admin-tags__error">{listError}</p> : null}

      <div className="admin-tags__toolbar">
        <label className="admin-tags__check-all">
          <input type="checkbox" checked={list.length > 0 && selected.size === list.length} onChange={selectAllOnPage} />
          本页全选
        </label>
        <span className="admin-tags__meta">
          共 {total} 条 · 第 {page} / {totalPages} 页
        </span>
        <div className="admin-tags__pager">
          <button
            type="button"
            className="admin-tags__btn admin-tags__btn--ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <button
            type="button"
            className="admin-tags__btn admin-tags__btn--ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="admin-tags__batch">
          <span className="admin-tags__batch-label">已选 {selected.size} 套，统一标签（覆盖）：</span>
          <input
            className="admin-tags__input admin-tags__input--grow"
            placeholder="例如：日常,女,25-29,春"
            value={batchTags}
            onChange={(e) => setBatchTags(e.target.value)}
          />
          <button
            type="button"
            className="admin-tags__btn"
            disabled={batchBusy}
            onClick={() => void applyBatch()}
          >
            {batchBusy ? '保存中…' : '批量应用'}
          </button>
        </div>
      ) : null}

      {loading ? <p className="admin-tags__empty">加载中…</p> : null}

      {!loading && list.length === 0 ? <p className="admin-tags__empty">没有匹配的搭配</p> : null}

      <ul className="admin-tags__list">
        {list.map((row) => (
          <li key={row.id} className="admin-tags__item">
            <label className="admin-tags__check">
              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
            </label>
            <div className="admin-tags__thumb-wrap">
              {row.image_url ? (
                <img className="admin-tags__thumb" src={row.image_url} alt="" loading="lazy" />
              ) : (
                <div className="admin-tags__thumb admin-tags__thumb--empty">无图</div>
              )}
            </div>
            <div className="admin-tags__body">
              <div className="admin-tags__row-title">
                <span className="admin-tags__id">#{row.id}</span>
                <span className="admin-tags__name">{row.name}</span>
              </div>
              <textarea
                className="admin-tags__textarea"
                rows={3}
                value={editingTags[row.id] ?? row.style_tags ?? ''}
                onChange={(e) =>
                  setEditingTags((prev) => ({
                    ...prev,
                    [row.id]: e.target.value,
                  }))
                }
                spellCheck={false}
              />
              <div className="admin-tags__actions">
                <button
                  type="button"
                  className="admin-tags__btn admin-tags__btn--small"
                  disabled={savingId === row.id}
                  onClick={() => void saveOne(row.id)}
                >
                  {savingId === row.id ? '保存中…' : '保存本行'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
