import { useEffect, useMemo, useRef, useState } from 'react';
import { diariesApi, type Diary, type DiaryAttachment } from '../api/diaries';
import { uploadsApi } from '../api/uploads';
import { renderMarkdown } from '../utils/markdown';
import './DiaryModal.css';

interface Props {
  open: boolean;
  date: string;
  /** 已有日记（可能未加载完，传 undefined 时弹窗内自己拉一次） */
  diary?: Diary;
  /** 当日"今日主题"——与时间轴视图、日历单元格共享 */
  theme: string;
  /** 编辑主题（写入主题缓存，与 day_themes 联动） */
  onThemeChange: (next: string) => void;
  onClose: () => void;
  /** 保存/删除后回调：传新值（含删空时传 null） */
  onChange: (next: Diary | null) => void;
}

/**
 * 日记编辑弹窗：双击日历格子后弹出。
 * - 顶部：日期 + 主题输入 + 上传/取消/保存
 * - 左侧 Markdown 编辑 + 右侧实时预览
 * - 底部：附件列表（可删除）
 */
export function DiaryModal({ open, date, diary: initDiary, theme, onThemeChange, onClose, onChange }: Props) {
  const [diary, setDiary] = useState<Diary | undefined>(initDiary);
  // 主题与父组件共享：父组件持有真实值（themeCache），这里只持有编辑中的草稿，
  // 关闭弹窗/失焦时再回传，避免每次按键都触发网络请求。
  const [titleDraft, setTitleDraft] = useState(theme);
  const [content, setContent] = useState(initDiary?.markdown_content ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 进入弹窗时记录的"初始内容"，用来判定是否脏
  const initialRef = useRef({ theme: '', content: '' });
  useEffect(() => {
    if (open) {
      setTitleDraft(theme);
      initialRef.current = { theme, content: '' };
    }
  }, [open, date, theme]);

  // 当前内容是否有未保存的修改（主题或正文相对打开初值有变）
  const isDirty = useMemo(() => {
    return (
      titleDraft !== initialRef.current.theme || content !== initialRef.current.content
    );
  }, [titleDraft, content]);

  // 打开时拉取最新日记（即使父组件给了快照，也以服务端为准）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    diariesApi
      .get(date)
      .then((d) => {
        if (cancelled) return;
        setDiary(d);
        setContent(d.markdown_content ?? '');
        // 服务端最新数据到达后，重置"初始值"，避免误判为脏
        initialRef.current = { theme, content: d.markdown_content ?? '' };
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, theme]);

  // ESC 关闭（用 ref 拿到最新 tryClose，避免每次重渲都重绑监听）
  const tryCloseRef = useRef<() => void>(() => {});
  tryCloseRef.current = () => {
    if (saving) return;
    if (isDirty && !window.confirm('当前修改尚未保存，确定关闭并丢弃吗？')) return;
    onClose();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tryCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const previewHtml = useMemo(() => renderMarkdown(content), [content]);

  // 关闭弹窗前检查是否有未保存修改（保存中时不允许关闭，防止竞态丢失）
  const tryClose = () => {
    if (saving) return;
    if (isDirty && !window.confirm('当前修改尚未保存，确定关闭并丢弃吗？')) return;
    onClose();
  };

  const save = async () => {
    const nextTitle = titleDraft.trim().slice(0, 40);
    const nextContent = content.slice(0, 64 * 1024);
    // 主题变化 → 同步到主题缓存（与时间轴/日历共享一份数据）
    if (nextTitle !== theme) {
      onThemeChange(nextTitle);
    }
    // 日记正文没变且主题也已同步 → 关闭即可
    if (
      nextContent === (diary?.markdown_content ?? '')
    ) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await diariesApi.upsert(date, {
        title: nextTitle, // 兼容旧字段：把主题也写到 diary.title，避免老数据展示断层
        markdown_content: nextContent,
      });
      const merged: Diary = { ...(diary || { date, attachments: [] }), ...saved };
      setDiary(merged);
      onChange(merged);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const lines: string[] = [];
      const newAttachments: DiaryAttachment[] = [];
      for (const file of Array.from(files)) {
        const att = await uploadsApi.upload(date, file);
        newAttachments.push(att);
        lines.push(buildMarkdownInsertion(att));
      }
      const insertion = lines.join('\n\n');
      setContent((prev) => (prev.length === 0 ? insertion : `${prev}\n\n${insertion}`));
      if (diary) {
        const next: Diary = {
          ...diary,
          attachments: [...(diary.attachments || []), ...newAttachments],
        };
        setDiary(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (att: DiaryAttachment) => {
    try {
      await uploadsApi.remove(att.id);
      if (diary) {
        const next: Diary = {
          ...diary,
          attachments: (diary.attachments || []).filter((a) => a.id !== att.id),
        };
        setDiary(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!open) return null;

  const attachments = diary?.attachments || [];

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal--diary"
        role="dialog"
        aria-modal="true"
        aria-label={`${date} 日记`}
      >
        <div className="modal__header">
          <div className="modal__title diary-modal__title">
            <span className="diary-modal__date">📓 {date}</span>
            <input
              className="diary-modal__title-input"
              maxLength={40}
              placeholder="今日主题（选填，与时间轴同步）"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
          </div>
          <button className="icon-btn" onClick={tryClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="modal__body diary-modal__body">
          {error && <div className="modal__error">{error}</div>}
          <div className="diary-editor__split">
            <div className="diary-editor__pane">
              <div className="diary-editor__pane-label">Markdown</div>
              <textarea
                className="diary-editor__textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# 标题&#10;&#10;支持 **加粗**、*斜体*、`代码`、列表、链接…&#10;&#10;上传文件后会自动追加到下方。&#10;![图片描述](/api/uploads/xxxx.jpg)&#10;<audio controls src='/api/uploads/xxxx.mp3'></audio>&#10;<video controls src='/api/uploads/xxxx.mp4'></video>"
                spellCheck={false}
              />
            </div>
            <div className="diary-editor__pane">
              <div className="diary-editor__pane-label">预览</div>
              <div
                className="diary-editor__preview"
                dangerouslySetInnerHTML={{
                  __html: previewHtml || '<p class="diary-editor__empty">（暂无内容）</p>',
                }}
              />
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="diary-editor__attachments">
              <div className="diary-editor__attachments-label">已上传的附件：</div>
              <div className="diary-editor__attachments-list">
                {attachments.map((att) => (
                  <div key={att.id} className={`diary-attach diary-attach--${att.kind}`}>
                    <span className="diary-attach__kind">
                      {att.kind === 'image' ? '🖼' : att.kind === 'video' ? '🎬' : '🎵'}
                    </span>
                    <span className="diary-attach__name" title={att.original_name}>
                      {att.original_name || att.filename}
                    </span>
                    <span className="diary-attach__size">{formatSize(att.size)}</span>
                    <button
                      className="ghost-btn diary-attach__del"
                      onClick={() => removeAttachment(att)}
                      title="删除附件"
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <div className="modal__footer-left">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="上传图片 / 视频 / 音频"
            >
              {uploading ? '上传中…' : '📎 上传文件'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          <div className="modal__footer-right">
            <button type="button" className="ghost-btn ghost-btn--lg" onClick={tryClose} disabled={saving}>
              取消
            </button>
            <button type="button" className="primary-btn" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 把 attachment 渲染成对应的 Markdown / HTML 片段
 */
function buildMarkdownInsertion(att: DiaryAttachment): string {
  const url = uploadsApi.url(att.filename);
  if (att.kind === 'image') return `![](${url})`;
  if (att.kind === 'video') return `<video controls src="${url}"></video>`;
  return `<audio controls src="${url}"></audio>`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
