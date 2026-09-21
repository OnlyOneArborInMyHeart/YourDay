import { useEffect, useMemo, useState } from 'react';
import { diariesApi } from '../lib/domain';
import { renderMarkdown } from '../lib/markdown';
import type { Diary } from '../lib/types';
import { lastOfMonth, firstOfMonth, shiftMonth, shiftDay, toDateString } from '../lib/date';

interface Props {
  open: boolean;
  onClose: () => void;
  themeCache: Record<string, string>;
}

export default function BatchExportDialog({ open, onClose, themeCache }: Props) {
  const [range, setRange] = useState<'week' | 'month' | 'custom'>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = toDateString(new Date());
    if (range === 'week') {
      setFrom(shiftDay(today, -7));
      setTo(today);
    } else if (range === 'month') {
      setFrom(firstOfMonth(today));
      setTo(lastOfMonth(today));
    }
  }, [open, range]);

  useEffect(() => {
    if (!open || !from || !to) return;
    setLoading(true);
    diariesApi.listRange(from, to)
      .then((rs) => setItems(rs.filter((r) => r.markdown_content || r.title)))
      .catch((e) => setErr(e?.payload?.error || e?.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [open, from, to]);

  const preview = useMemo(() => {
    return items.map((d) => `# ${d.date} · ${d.title || themeCache[d.date] || '(无标题)'}\n\n${d.markdown_content || ''}`).join('\n\n---\n\n');
  }, [items, themeCache]);

  function downloadMd() {
    const blob = new Blob([preview], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yourday-${from}_${to}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyText() {
    navigator.clipboard.writeText(preview).catch(() => { /* ignore */ });
  }

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <div className="modal__title">批量导出</div>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['week', 'month', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={range === r ? 'btn-primary' : 'btn-ghost'}
              >
                {r === 'week' ? '近 7 天' : r === 'month' ? '本月' : '自定义'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="date"
              value={from}
              onChange={(e) => { setRange('custom'); setFrom(e.target.value); }}
              style={{ flex: 1, padding: 6, fontSize: 12 }}
            />
            <span style={{ alignSelf: 'center', color: '#94a3b8' }}>→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => { setRange('custom'); setTo(e.target.value); }}
              style={{ flex: 1, padding: 6, fontSize: 12 }}
            />
          </div>

          {loading && <div className="page__loading">加载中…</div>}
          {err && <div className="page__error">{err}</div>}
          {!loading && items.length === 0 && (
            <div className="export-empty">该范围内没有日记</div>
          )}

          {items.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                共 {items.length} 篇 · {Math.round(preview.length / 1024)}KB
              </div>
              <div
                className="export-preview"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.slice(0, 4000) + (preview.length > 4000 ? '\n\n...（已截断预览）' : '')) }}
              />
            </>
          )}
        </div>
        <div className="modal__footer">
          <button className="btn-ghost" onClick={copyText} disabled={!preview}>复制 Markdown</button>
          <button className="btn-primary" onClick={downloadMd} disabled={!preview}>下载 .md</button>
        </div>
      </div>
    </div>
  );
}