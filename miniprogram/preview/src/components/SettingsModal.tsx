import { useRef, useState } from 'react';
import { musicApi } from '../lib/domain';
import type { MusicTrack } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  library: MusicTrack[];
  onChange: (next: MusicTrack[]) => void;
}

export default function SettingsModal({ open, onClose, library, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const [lyricsId, setLyricsId] = useState<number | null>(null);
  const [lyricsDraft, setLyricsDraft] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const coverRefs = useRef<Record<number, HTMLInputElement | null>>({});

  if (!open) return null;

  async function upload(file: File) {
    setBusy(true);
    try {
      const t = await musicApi.upload(file);
      onChange([t, ...library]);
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '上传失败');
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!editing) return;
    try {
      const t = await musicApi.rename(editing.id, editing.title);
      onChange(library.map((x) => (x.id === t.id ? t : x)));
      setEditing(null);
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '重命名失败');
    }
  }

  async function remove(id: number) {
    if (!window.confirm('删除该曲目？')) return;
    try {
      await musicApi.remove(id);
      onChange(library.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '删除失败');
    }
  }

  async function uploadCover(id: number, file: File) {
    try {
      const t = await musicApi.uploadCover(id, file);
      onChange(library.map((x) => (x.id === t.id ? t : x)));
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '封面上传失败');
    }
  }

  async function removeCover(id: number) {
    try {
      await musicApi.removeCover(id);
      onChange(library.map((x) => (x.id === id ? { ...x, cover_filename: null, cover_url: null } : x)));
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '删除封面失败');
    }
  }

  async function saveLyrics() {
    if (lyricsId == null) return;
    try {
      const t = await musicApi.uploadLyrics(lyricsId, lyricsDraft);
      onChange(library.map((x) => (x.id === t.id ? t : x)));
      setLyricsId(null);
      setLyricsDraft('');
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '保存歌词失败');
    }
  }

  async function removeLyrics(id: number) {
    try {
      await musicApi.removeLyrics(id);
      onChange(library.map((x) => (x.id === id ? { ...x, lyrics: null } : x)));
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '删除歌词失败');
    }
  }

  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <div className="modal__title">设置 · 音乐库</div>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '上传中…' : '+ 上传音乐'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
          </div>

          {err && <div className="page__error">{err}</div>}

          {library.length === 0 && <div className="page__hint">还没有曲目，先上传一首吧</div>}

          <ul className="music-list">
            {library.map((t) => (
              <li key={t.id} className="music-list__item">
                <div className="music-list__cover">
                  {t.cover_url
                    ? <img src={t.cover_url} alt="cover" />
                    : <span>♪</span>}
                </div>
                <div className="music-list__meta">
                  {editing?.id === t.id ? (
                    <input
                      value={editing.title}
                      autoFocus
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      onBlur={rename}
                      onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
                      style={{ width: '100%', padding: '2px 6px', borderRadius: 4, border: '1px solid #c7d2fe', fontSize: 12 }}
                    />
                  ) : (
                    <div className="music-list__title" onDoubleClick={() => setEditing({ id: t.id, title: t.title })}>
                      {t.title}
                    </div>
                  )}
                  <div className="music-list__sub">
                    {t.original_name} · {Math.round(t.size / 1024)}KB
                    {t.lyrics && ' · 🎤 已配歌词'}
                  </div>
                  {lyricsId === t.id && (
                    <textarea
                      autoFocus
                      rows={4}
                      value={lyricsDraft}
                      onChange={(e) => setLyricsDraft(e.target.value)}
                      placeholder="[00:00.00] 歌词"
                      style={{ width: '100%', marginTop: 4, fontSize: 11, padding: 4, borderRadius: 4, border: '1px solid #c7d2fe' }}
                    />
                  )}
                  {lyricsId === t.id && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button className="todo-card__btn" onClick={saveLyrics}>保存</button>
                      <button className="todo-card__btn" onClick={() => { setLyricsId(null); setLyricsDraft(''); }}>取消</button>
                    </div>
                  )}
                </div>
                <div className="music-list__btns">
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={(el) => { coverRefs.current[t.id] = el; }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadCover(t.id, f);
                      if (coverRefs.current[t.id]) (coverRefs.current[t.id] as HTMLInputElement).value = '';
                    }}
                  />
                  <button onClick={() => coverRefs.current[t.id]?.click()}>封面</button>
                  {t.cover_url && <button onClick={() => removeCover(t.id)}>×封面</button>}
                  <button onClick={() => { setLyricsId(t.id); setLyricsDraft(t.lyrics || ''); }}>歌词</button>
                  {t.lyrics && <button onClick={() => removeLyrics(t.id)}>×歌词</button>}
                  <button onClick={() => setEditing({ id: t.id, title: t.title })}>改名</button>
                  <button className="danger" onClick={() => remove(t.id)}>删</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal__footer">
          <button className="btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}