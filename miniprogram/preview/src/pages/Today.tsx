import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Event } from '../lib/types';

export default function Today({ onLogout }: { onLogout: () => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draftTheme, setDraftTheme] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [list, themes] = await Promise.all([
        api.get<Event[]>(`/api/events?date=${today}`),
        api.get<{ date: string; title: string }[]>(`/api/themes?date=${today}`).catch(() => []),
      ]);
      setEvents(list);
      const t = Array.isArray(themes) && themes.length > 0 ? themes[0].title : '';
      setTheme(t);
      setDraftTheme(t);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function toggleDone(e: Event) {
    try {
      await api.put(`/api/events/${e.id}`, { done: !e.done ? 1 : 0 });
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, done: x.done ? 0 : 1 } : x)));
    } catch (err: any) {
      setErr(err?.message || '更新失败');
    }
  }

  async function saveTheme() {
    setEditing(false);
    try {
      await api.put(`/api/themes/${today}`, { title: draftTheme });
      setTheme(draftTheme);
    } catch (e: any) {
      setErr(e?.message || '保存失败');
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page__title">{today}</h1>
        <button
          onClick={onLogout}
          style={{
            background: 'transparent', border: '1px solid #d8dde6', borderRadius: 14,
            padding: '4px 10px', fontSize: 12, color: '#6b7588', cursor: 'pointer',
          }}
        >
          退出
        </button>
      </div>

      {/* 主题块 */}
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span style={{ fontSize: 13, color: '#6b7588' }}>今日主题</span>
        {editing ? (
          <>
            <input
              autoFocus
              value={draftTheme}
              onChange={(e) => setDraftTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTheme(); if (e.key === 'Escape') setEditing(false); }}
              style={{ flex: 1, border: '1px solid #d8dde6', borderRadius: 8, padding: '4px 8px', outline: 'none' }}
            />
            <button onClick={saveTheme} className="auth-page__btn" style={{ width: 'auto', padding: '4px 12px' }}>保存</button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontWeight: 600 }}>{theme || '（点击右边的笔添加）'}</span>
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}
              aria-label="编辑主题"
            >✏️</button>
          </>
        )}
      </div>

      {loading && <div className="page__loading">加载中…</div>}
      {err && <div className="page__error">{err}</div>}
      {events.length === 0 && !loading && !err && (
        <div className="page__hint">今天还没有安排哦</div>
      )}
      {events.map((e) => (
        <div
          key={e.id}
          className="event-card"
          onClick={() => toggleDone(e)}
          style={{ opacity: e.done ? 0.55 : 1, cursor: 'pointer' }}
        >
          <span className="event-card__title">
            <span className={`priority-dot priority-${e.priority}`} />
            {e.done ? '✓ ' : ''}{e.title}
          </span>
          {e.start_time && (
            <span className="event-card__time">
              {e.start_time}{e.end_time ? `–${e.end_time}` : ''}
            </span>
          )}
          {e.note && <div style={{ color: '#4a5266', fontSize: 13, marginTop: 4 }}>{e.note}</div>}
        </div>
      ))}
    </div>
  );
}