import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Diary } from '../lib/types';

export default function DiaryList() {
  const [items, setItems] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 默认查近 60 天
  function rangeLastDays(n: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - n);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(from), to: fmt(to) };
  }

  useEffect(() => {
    setLoading(true);
    const { from, to } = rangeLastDays(60);
    api
      .get<Diary[]>(`/api/diaries?from=${from}&to=${to}`)
      .then(setItems)
      .catch((e: any) => setErr(e?.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 className="page__title">最近日记</h1>
      {loading && <div className="page__loading">加载中…</div>}
      {err && <div className="page__error">{err}</div>}
      {items.length === 0 && !loading && !err && (
        <div className="page__hint">还没有写过日记</div>
      )}
      {items.map((d) => (
        <div key={d.date} className="diary-card">
          <span className="diary-card__date">{d.date}</span>
          <span className="diary-card__title">{d.title || '（无标题）'}</span>
          {d.markdown_content && (
            <div className="diary-card__preview">
              {d.markdown_content.replace(/[#*_`>\-\[\]]/g, '').slice(0, 80)}
              {d.markdown_content.length > 80 ? '…' : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}