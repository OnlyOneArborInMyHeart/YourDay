import { useEffect, useRef, useState } from 'react';
import { musicApi, type MusicTrack } from '../api/music';
import { CoverCropper } from './CoverCropper';
import './CoverCropper.css';
import './SettingsModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 皮肤模式 */
  themeMode: 'default' | 'minecraft';
  onThemeModeChange: (mode: 'default' | 'minecraft') => void;
  /** 来自父组件的音乐库（唱片播放器也要用），方便外部状态实时同步 */
  library: MusicTrack[];
  /** modal 内部对曲目列表的修改会冒泡到父组件 */
  onLibraryChange: (next: MusicTrack[]) => void;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsModal({ open, onClose, themeMode, onThemeModeChange, library, onLibraryChange }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>(library);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  /** 裁剪模态：哪个曲目正在裁剪 + 选中的文件 */
  const [croppingFor, setCroppingFor] = useState<number | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  /** 每行一个隐藏的 file input，用于上传封面 */
  const coverInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  /** 每行一个隐藏的 file input，用于上传 LRC 歌词 */
  const lyricsInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  /** 本地列表变化时同步给父组件 */
  useEffect(() => {
    onLibraryChange(tracks);
  }, [tracks, onLibraryChange]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await musicApi.list();
      setTracks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载音乐库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (renamingId !== null) {
      // 等待 DOM 渲染完成后聚焦
      const t = window.setTimeout(() => renameInputRef.current?.select(), 30);
      return () => window.clearTimeout(t);
    }
  }, [renamingId]);

  // ESC 关闭弹窗
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const list = Array.from(files);
    const failures: string[] = [];
    for (const f of list) {
      try {
        const created = await musicApi.upload(f);
        setTracks((prev) => [created, ...prev]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '上传失败';
        failures.push(`${f.name}: ${msg}`);
      }
    }
    setUploading(false);
    if (failures.length > 0) setError(failures.join('；'));
  };

  /** 上传封面图（点击 ✎ 旁边的"唱片图片"按钮） */
  const handleCoverChange = async (track: MusicTrack, file: File) => {
    // 弹出裁剪模态；用户确认后再真正上传
    setCroppingFor(track.id);
    setCropFile(file);
  };

  /** 裁剪确认回调：上传 + 乐观更新 */
  const handleCropConfirm = async (
    track: MusicTrack,
    result: import('./CoverCropper').CropResult,
    file: File
  ) => {
    setCroppingFor(null);
    setCropFile(null);

    const oldCover = track.cover_url;
    const previewUrl = URL.createObjectURL(file);
    setTracks((list) =>
      list.map((t) => (t.id === track.id ? { ...t, cover_url: previewUrl } : t))
    );
    try {
      const updated = await musicApi.uploadCover(track.id, file, result);
      URL.revokeObjectURL(previewUrl);
      setTracks((list) => list.map((t) => (t.id === track.id ? updated : t)));
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setTracks((list) =>
        list.map((t) => (t.id === track.id ? { ...t, cover_url: oldCover } : t))
      );
      setError(err instanceof Error ? err.message : '上传封面失败');
    }
  };

  const handleCoverRemove = async (track: MusicTrack) => {
    const snapshot = track.cover_url;
    setTracks((list) =>
      list.map((t) => (t.id === track.id ? { ...t, cover_url: null, cover_filename: null } : t))
    );
    try {
      await musicApi.removeCover(track.id);
    } catch (err) {
      setTracks((list) =>
        list.map((t) => (t.id === track.id ? { ...t, cover_url: snapshot } : t))
      );
      setError(err instanceof Error ? err.message : '删除封面失败');
    }
  };

  /** 读取 LRC / TXT 文件内容上传为歌词 */
  const handleLyricsUpload = async (track: MusicTrack, file: File) => {
    try {
      const text = await file.text();
      const updated = await musicApi.uploadLyrics(track.id, text);
      setTracks((list) => list.map((t) => (t.id === track.id ? updated : t)));
    } catch {
      setError('上传歌词失败');
    }
  };

  /** 删除歌词 */
  const handleLyricsRemove = async (track: MusicTrack) => {
    const snapshot = track.lyrics;
    setTracks((list) =>
      list.map((t) => (t.id === track.id ? { ...t, lyrics: null } : t))
    );
    try {
      await musicApi.removeLyrics(track.id);
    } catch {
      setTracks((list) =>
        list.map((t) => (t.id === track.id ? { ...t, lyrics: snapshot } : t))
      );
      setError('删除歌词失败');
    }
  };

  const startRename = (track: MusicTrack) => {
    setRenamingId(track.id);
    setRenameDraft(track.title);
  };

  const commitRename = async () => {
    if (renamingId === null) return;
    const next = renameDraft.trim();
    if (!next) {
      setRenamingId(null);
      return;
    }
    const id = renamingId;
    const prev = tracks.find((t) => t.id === id);
    if (prev && prev.title === next) {
      setRenamingId(null);
      return;
    }
    setRenamingId(null);
    // 乐观更新
    setTracks((list) => list.map((t) => (t.id === id ? { ...t, title: next } : t)));
    try {
      const updated = await musicApi.rename(id, next);
      setTracks((list) => list.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      // 回滚
      if (prev) setTracks((list) => list.map((t) => (t.id === id ? prev : t)));
      setError(err instanceof Error ? err.message : '重命名失败');
    }
  };

  const cancelRename = () => setRenamingId(null);

  const handleDelete = async (id: number) => {
    const snapshot = tracks;
    setConfirmDeleteId(null);
    setTracks((list) => list.filter((t) => t.id !== id));
    try {
      await musicApi.remove(id);
    } catch (err) {
      setTracks(snapshot);
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (!open) return null;

  return (
    <div className="settings-modal__backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-modal__head">
          <h2 className="settings-modal__title">⚙ 设置</h2>
          <button
            type="button"
            className="settings-modal__close"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            ×
          </button>
        </header>

        {/* 换肤区 */}
        <section className="settings-modal__section settings-modal__theme-section">
          <div className="settings-modal__section-title">🎨 换肤</div>
          <div className="settings-modal__theme-options">
            <button
              type="button"
              className={`settings-modal__theme-btn ${themeMode === 'default' ? 'is-active' : ''}`}
              onClick={() => onThemeModeChange('default')}
            >
              <span className="settings-modal__theme-icon">🌸</span>
              <span className="settings-modal__theme-label">默认 · 清新紫</span>
            </button>
            <button
              type="button"
              className={`settings-modal__theme-btn ${themeMode === 'minecraft' ? 'is-active' : ''}`}
              onClick={() => onThemeModeChange('minecraft')}
            >
              <span className="settings-modal__theme-icon">⛏</span>
              <span className="settings-modal__theme-label">Minecraft</span>
            </button>
          </div>
        </section>

        <div className="settings-modal__divider" />

        {/* 音乐库区 */}
        <section className="settings-modal__section settings-modal__music-section">
          <div className="settings-modal__section-title">🎵 音乐库</div>

          {error && <div className="settings-modal__error">{error}</div>}

          <section className="settings-modal__upload">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
              multiple
              hidden
              onChange={(e) => {
                handleUploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="settings-modal__upload-btn"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title="选择本地音频文件上传到音乐库（mp3 / wav / ogg / m4a / flac）"
            >
              {uploading ? '上传中…' : '🎵 上传音乐'}
            </button>
            <p className="settings-modal__hint">
              支持 mp3 / wav / ogg / m4a / flac / aac，单文件最大 80 MB。
              上传后可在右侧唱片播放器里自动播放。
            </p>
          </section>

          <section className="settings-modal__list">
          {loading ? (
            <div className="settings-modal__loading">加载中…</div>
          ) : tracks.length === 0 ? (
            <div className="settings-modal__empty">
              <div className="settings-modal__empty-icon">🎼</div>
              <div>音乐库空空如也 —— 点上面按钮上传第一首吧</div>
            </div>
          ) : (
            <ul className="settings-modal__tracks">
              {tracks.map((t) => (
                <li
                  key={t.id}
                  className={`settings-modal__track ${confirmDeleteId === t.id ? 'is-confirming' : ''}`}
                >
                  <button
                    type="button"
                    className="settings-modal__cover"
                    onClick={() => coverInputRefs.current[t.id]?.click()}
                    title={t.cover_url ? '点击替换唱片图片' : '点击上传唱片图片'}
                    aria-label="上传唱片图片"
                  >
                    {t.cover_url ? (
                      <img src={t.cover_url} alt="cover" />
                    ) : (
                      <span className="settings-modal__cover-placeholder" aria-hidden>
                        🎨
                      </span>
                    )}
                    <span className="settings-modal__cover-badge" aria-hidden>
                      ✎
                    </span>
                  </button>
                  <input
                    ref={(el) => {
                      coverInputRefs.current[t.id] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCoverChange(t, f);
                      e.target.value = '';
                    }}
                  />
                  {renamingId === t.id ? (
                    <input
                      ref={renameInputRef}
                      className="settings-modal__rename-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      maxLength={80}
                    />
                  ) : (
                    <button
                      type="button"
                      className="settings-modal__track-title"
                      title={t.original_name}
                      onClick={() => startRename(t)}
                    >
                      {t.title}
                    </button>
                  )}
                  <span className="settings-modal__track-meta">{humanSize(t.size)}</span>
                  {t.lyrics ? (
                    <button
                      type="button"
                      className="settings-modal__lyrics-btn settings-modal__lyrics-btn--has"
                      onClick={() => handleLyricsRemove(t)}
                      title="点击删除歌词"
                    >
                      ✓ 已上传歌词
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="settings-modal__lyrics-btn"
                      onClick={() => lyricsInputRefs.current[t.id]?.click()}
                      title="上传 LRC 歌词文件"
                    >
                      + 歌词
                    </button>
                  )}
                  <input
                    ref={(el) => { lyricsInputRefs.current[t.id] = el; }}
                    type="file"
                    accept=".lrc,.txt,text/plain"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLyricsUpload(t, f);
                      e.target.value = '';
                    }}
                  />
                  {confirmDeleteId === t.id ? (
                    <>
                      <button
                        type="button"
                        className="settings-modal__btn settings-modal__btn--danger"
                        onClick={() => handleDelete(t.id)}
                        title="确认删除"
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        className="settings-modal__btn"
                        onClick={() => setConfirmDeleteId(null)}
                        title="取消删除"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      {t.cover_url && (
                        <button
                          type="button"
                          className="settings-modal__btn"
                          onClick={() => handleCoverRemove(t)}
                          title="删除唱片图片（仅删除封面，保留音频）"
                          aria-label="删除唱片图片"
                        >
                          🖼
                        </button>
                      )}
                      <button
                        type="button"
                        className="settings-modal__btn"
                        onClick={() => startRename(t)}
                        title="重命名"
                        aria-label="重命名"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="settings-modal__btn settings-modal__btn--danger"
                        onClick={() => setConfirmDeleteId(t.id)}
                        title="删除"
                        aria-label="删除"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        </section>
      </div>

      {croppingFor !== null && cropFile && (
        <CropperModal
          file={cropFile}
          track={tracks.find((t) => t.id === croppingFor) ?? null}
          onCancel={() => {
            setCroppingFor(null);
            setCropFile(null);
          }}
          onConfirm={(result, file) => {
            const t = tracks.find((x) => x.id === croppingFor);
            if (t) handleCropConfirm(t, result, file);
          }}
        />
      )}
    </div>
  );
}

/** 把 CoverCropper 包成最外层 modal：暗背景 + 点击空白关闭 */
function CropperModal({
  file,
  track,
  onCancel,
  onConfirm,
}: {
  file: File;
  track: MusicTrack | null;
  onCancel: () => void;
  onConfirm: (result: import('./CoverCropper').CropResult, file: File) => void;
}) {
  // 唱片是圆形，默认选 circle
  return (
    <div
      className="settings-modal__backdrop settings-modal__backdrop--cropper"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <CoverCropper
        file={file}
        initialShape="circle"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
      {track && (
        <div className="settings-modal__cropper-title">为「{track.title}」选择唱片区域</div>
      )}
    </div>
  );
}