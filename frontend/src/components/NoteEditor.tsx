import { useEffect, useRef, useState } from 'react';
import type { TodoNoteImage } from '../types';
import { todoAttachmentsApi } from '../api/todoAttachments';

/**
 * 解析 note 文本里的 `![todo-img:ID](caption)` token，得到 [ {id, caption} ]。
 * 顺序与 note 中出现顺序一致。
 */
const NOTE_IMG_RE = /!\[todo-img:(\d+)\]\(([^)]*)\)/g;

export interface EmbeddedImageRef {
  id: number;
  caption: string;
}

export function parseNoteImages(note: string): EmbeddedImageRef[] {
  const out: EmbeddedImageRef[] = [];
  if (!note) return out;
  NOTE_IMG_RE.lastIndex = 0;
  let m;
  while ((m = NOTE_IMG_RE.exec(note)) !== null) {
    const id = Number(m[1]);
    if (Number.isInteger(id) && id > 0) out.push({ id, caption: m[2] });
  }
  return out;
}

/**
 * 把 note 文本里的所有 `![todo-img:ID](...)` 段落移除。
 * 如果指定 id，则只移除该 id 的段落；否则移除全部。
 */
export function stripNoteImages(note: string, id?: number): string {
  if (!note) return '';
  const re = id === undefined
    ? new RegExp(NOTE_IMG_RE.source, NOTE_IMG_RE.flags)
    : new RegExp(`!\\[todo-img:${id}\\]\\([^)]*\\)`, 'g');
  return note.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /**
   * 已知 note 实际引用的图片（来自后端 note_images）。
   * 这里拿来展示预览，避免重复上传；同时确保删除按钮可触发真正的清理。
   */
  noteImages: TodoNoteImage[];
  /**
   * 当用户在预览里删掉某张图时调用。
   * 父组件应同步把 note 文本里对应的 `![todo-img:ID]` 段落移除，
   * 并（如果该图不再被任何 note 引用）调用 todoAttachmentsApi.remove。
   */
  onImageRemoved: (id: number) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

/**
 * 备注编辑器：
 * - 左侧 textarea，markdown 风格文本
 * - 下方一行"图片缩略图"：列出 note 中已嵌入的图片，每张右上角可单独删除
 * - 右下角"插入图片"按钮：调起文件选择器，上传后在光标位置追加 markdown token
 */
export function NoteEditor({
  value,
  onChange,
  noteImages,
  onImageRemoved,
  placeholder = '备注（可选）',
  rows = 2,
  maxLength = 500,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 卸载时清理已生成的 objectURL（upload 时的本地预览）
  const localPreviewUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
      localPreviewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      localPreviewUrlsRef.current = [];
    };
  }, []);

  const handleInsertImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('请选择图片文件');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('图片大小不能超过 20MB');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded = await todoAttachmentsApi.upload(file);
      const token = `![todo-img:${uploaded.id}](${uploaded.original_name || 'image'})`;
      const ta = textareaRef.current;
      let next: string;
      if (ta) {
        // 把 token 插入到当前光标位置
        const start = ta.selectionStart ?? value.length;
        const end = ta.selectionEnd ?? value.length;
        next = value.slice(0, start) + token + value.slice(end);
        // 等下一帧再恢复焦点 + 把光标移到 token 末尾
        requestAnimationFrame(() => {
          ta.focus();
          const cursor = start + token.length;
          ta.setSelectionRange(cursor, cursor);
        });
      } else {
        next = value ? `${value}\n${token}` : token;
      }
      onChange(next);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="note-editor">
      <textarea
        ref={textareaRef}
        className="field__input field__textarea"
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {noteImages.length > 0 && (
        <div className="note-editor__preview">
          {noteImages.map((img) => (
            <div key={img.id} className="note-editor__thumb" title={img.original_name}>
              <img src={img.url} alt={img.original_name} loading="lazy" />
              <button
                type="button"
                className="note-editor__thumb-remove"
                aria-label="从备注中移除此图"
                title="移除"
                onClick={() => onImageRemoved(img.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="note-editor__toolbar">
        <button
          type="button"
          className="ghost-btn ghost-btn--sm"
          onClick={handleInsertImageClick}
          disabled={uploading}
        >
          {uploading ? '上传中…' : '📎 插入图片'}
        </button>
        {uploadError && <span className="note-editor__error">{uploadError}</span>}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFileChosen(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}