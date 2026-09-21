import { useEffect, useRef, useState } from 'react';
import { diariesApi } from '../lib/domain';
import type { Diary } from '../lib/types';
import { renderMarkdown } from '../lib/markdown';

interface Props {
  open: boolean;
  date: string;
  theme: string;
  onThemeChange: (next: string) => void;
  onClose: () => void;
  onChange: (next: Diary | null) => void;
}

export default function DiaryModal({ open, date, theme, onThemeChange, onClose, onChange }: Props) {
  const [title, setTitle] = useState(theme);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Diary['attachments']>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(theme);
    setLoading(true);
    diariesApi.get(date)
      .then((d) => {
        setContent(d.markdown_content || '');
        setTitle(theme || d.title || '');
        setAttachments(d.attachments || []);
      })
      .catch((e) => setError(e?.payload?.error || e?.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [open, date, theme]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    try {
      const saved = await diariesApi.upsert(date, { title: title.trim(), markdown_content: content });
      onThemeChange(title.trim());
      onChange(saved);
      onClose();
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm('删除该日记？此操作不可撤销')) return;
    try {
      await diariesApi.remove(date);
      onChange(null);
      onClose();
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || '删除失败');
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await diariesApi.upload(date, file);
      setAttachments((prev) => [...(prev || []), att]);
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || '上传失败');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAttachment(id: number) {
    try {
      await diariesApi.removeAttachment(id);
      setAttachments((prev) => (prev || []).filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || '删除失败');
    }
  }

  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <div className="modal__title">日记 · {date}</div>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">
          {loading && <div className="page__loading">加载中…</div>}

          <div className="auth-page__field">
            <label className="auth-page__label">标题（同时作为"今日主题"）</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
              placeholder="例如：项目 A 启动日"
            />
          </div>

          <label className="auth-page__label">Markdown 正文</label>
          <div className="diary-modal__split">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# 今天&#10;- 第一件事&#10;- 第二件事"
            />
            <div className="diary-modal__preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          </div>

          <div className="diary-modal__attachments">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>
              <span className="auth-page__label" style={{ margin: 0 }}>附件</span>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? '上传中…' : '+ 添加'}
              </button>
              <input
                ref={fileRef}
                type="file"
                style={{ display: 'none' }}
                accept="image/*,video/*,audio/*"
                onChange={onUpload}
              />
            </div>
            {(attachments || []).length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: '4px 0' }}>暂无附件</div>
            )}
            {(attachments || []).map((a) => (
              <div key={a.id} className="diary-modal__attachment">
                <span style={{ flex: 1 }}>
                  {a.kind === 'image' && '🖼 '}
                  {a.kind === 'video' && '🎬 '}
                  {a.kind === 'audio' && '🎵 '}
                  {a.original_name} · {Math.round(a.size / 1024)}KB
                </span>
                {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', fontSize: 11 }}>查看</a>}
                <button onClick={() => removeAttachment(a.id)}>删除</button>
              </div>
            ))}
          </div>

          {error && <div className="page__error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn-ghost" onClick={remove} disabled={saving}>删除</button>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}