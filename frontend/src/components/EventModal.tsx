import { useEffect, useRef, useState } from 'react';
import type { Event, EventBackground, EventDraft, Priority } from '../types';
import { minutesToTime, timeToMinutes } from '../utils/date';
import { eventBackgroundsApi } from '../api/eventBackgrounds';
import { ImageCropper } from './ImageCropper';
import './EventModal.css';

interface Props {
  open: boolean;
  date: string;
  initial?: Event;
  defaultStartMinutes?: number;
  /**
   * 由其它模块预填的字段（例：把一个 todo 拆解到时间轴时带入 title/note/priority）。
   * 不会覆盖用户传入的 `initial`（编辑现有事件时优先用 initial）。
   */
  prefill?: { title: string; priority: Priority; note: string };
  onClose: () => void;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

const PRIORITY_OPTIONS: { value: Priority; label: string; hint: string }[] = [
  { value: 1, label: 'P1 · 重要且紧急', hint: '需优先处理' },
  { value: 2, label: 'P2 · 重要但不紧急', hint: '规划好时间推进' },
  { value: 3, label: 'P3 · 一般事项', hint: '灵活安排即可' },
];

function defaultEndFor(start: string): string {
  const m = timeToMinutes(start);
  return minutesToTime(Math.min(24 * 60 - 1, m + 60));
}

export function EventModal({
  open,
  date,
  initial,
  defaultStartMinutes,
  prefill,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const isEdit = !!initial;

  const [title, setTitle] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [priority, setPriority] = useState<Priority>(2);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 背景图相关：
  // - background: 当前事件实际绑定的背景图（用于显示缩略图）
  // - cropSrc: 弹裁剪器时填入的图片 URL（一般用 File 的 objectURL）
  // - uploadingBg: 上传中（裁剪完到服务器返回的过渡态），按钮 disable 期间
  // - pendingRemove: 用户点了"移除背景"，下一次保存时把 background_image_id 置 null
  const [background, setBackground] = useState<EventBackground | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 卸载时清理 objectURL，避免内存泄漏
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
    // 只在卸载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPendingRemove(false);
    setCropSrc(null);
    if (initial) {
      setTitle(initial.title);
      setStart(initial.start_time);
      setEnd(initial.end_time);
      setPriority(initial.priority);
      setNote(initial.note || '');
      setBackground(initial.background_image || null);
    } else if (prefill) {
      const startMin = defaultStartMinutes ?? 9 * 60;
      const s = minutesToTime(startMin);
      setTitle(prefill.title);
      setStart(s);
      setEnd(defaultEndFor(s));
      setPriority(prefill.priority);
      setNote(prefill.note || '');
      setBackground(null);
    } else {
      const startMin = defaultStartMinutes ?? 9 * 60;
      const s = minutesToTime(startMin);
      setTitle('');
      setStart(s);
      setEnd(defaultEndFor(s));
      setPriority(2);
      setNote('');
      setBackground(null);
    }
  }, [open, initial, defaultStartMinutes, prefill]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleStartChange = (v: string) => {
    setStart(v);
    if (timeToMinutes(v) >= timeToMinutes(end)) {
      setEnd(defaultEndFor(v));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('请填写事项名称');
      return;
    }
    if (timeToMinutes(start) >= timeToMinutes(end)) {
      setError('开始时间必须早于结束时间');
      return;
    }
    setSubmitting(true);
    try {
      const draft: EventDraft = {
        date,
        title: title.trim(),
        start_time: start,
        end_time: end,
        priority,
        note: note.trim(),
      };
      // 背景图语义：
      // - 有 background + 没 pendingRemove → 传 background.id
      // - pendingRemove → 显式传 null，让后端清空关联
      // - 没有 background 且没 pendingRemove → 不传 background_image_id（保持不变或首次创建时为 null）
      if (background && !pendingRemove) {
        draft.background_image_id = background.id;
      } else if (pendingRemove && initial?.background_image) {
        draft.background_image_id = null;
      }
      await onSubmit(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 选了本地图片 → 立刻弹出裁剪器。
   * 流程：File → objectURL → ImageCropper → 确认后拿到 dataURL → 转 File → 上传 → 写回 background state
   */
  const handleFileChosen = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    const url = URL.createObjectURL(file);
    // 释放上一个（如果有）
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(url);
  };

  const handleCropConfirm = async (dataUrl: string) => {
    if (!cropSrc) return;
    setUploadingBg(true);
    setError(null);
    try {
      // dataURL → Blob → File
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `event-bg-${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await eventBackgroundsApi.upload(file);
      setBackground(uploaded);
      setPendingRemove(false);
      // 关闭裁剪器，清理 objectURL
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '背景图上传失败');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    // 取消后让 file input 能再次选同一张图
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveBackground = () => {
    setBackground(null);
    setPendingRemove(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReCrop = () => {
    if (!background) return;
    // 已有背景图时按"重新裁剪"处理：复用当前 url
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(background.url);
  };

  const handleDelete = async () => {
    if (!initial || !onDelete) return;
    if (!window.confirm(`确定删除「${initial.title}」吗？`)) return;
    setSubmitting(true);
    try {
      await onDelete(initial.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 裁剪器优先级最高：在 cropSrc 存在时单独 full-screen 渲染，
  // 背景 modal 仍保留以便 cancel 后回到原状态
  if (cropSrc) {
    return (
      <ImageCropper
        src={cropSrc}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2 className="modal__title">
            {isEdit ? '编辑事项' : prefill ? '拆解到时间轴' : '新建事项'}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">事项名称</span>
            <input
              className="field__input"
              autoFocus
              maxLength={80}
              placeholder="例如：晨跑、写周报"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">开始时间</span>
              <input
                className="field__input"
                type="time"
                step={900}
                value={start}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">结束时间</span>
              <input
                className="field__input"
                type="time"
                step={900}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <span className="field__label">优先级</span>
            <div className="priority-group">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`priority-chip priority-chip--p${opt.value} ${
                    priority === opt.value ? 'is-active' : ''
                  }`}
                  onClick={() => setPriority(opt.value)}
                >
                  <span className="priority-chip__label">{opt.label}</span>
                  <span className="priority-chip__hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">备注（可选）</span>
            <textarea
              className="field__input field__textarea"
              maxLength={500}
              placeholder="补充一些细节…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>

          <div className="field">
            <span className="field__label">背景图（可选）</span>
            {background ? (
              <div className="bg-uploader__preview">
                <img
                  className="bg-uploader__img"
                  src={background.url}
                  alt={background.original_name || '背景图'}
                />
                <div className="bg-uploader__actions">
                  <button
                    type="button"
                    className="ghost-btn ghost-btn--sm"
                    onClick={handleReCrop}
                    disabled={uploadingBg}
                    title="重新选择并裁剪"
                  >
                    ✂ 重新裁剪
                  </button>
                  <button
                    type="button"
                    className="ghost-btn ghost-btn--sm bg-uploader__remove"
                    onClick={handleRemoveBackground}
                    disabled={uploadingBg}
                    title="移除背景图"
                  >
                    🗑 移除
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="bg-uploader__trigger"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingBg}
              >
                {uploadingBg ? '上传中…' : '🖼 上传并裁剪背景图'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
            <span className="bg-uploader__hint">
              支持 PNG / JPG / WEBP / GIF。上传后可自由裁剪要展示的部分。
            </span>
          </div>

          {error && <div className="modal__error">{error}</div>}

          <div className="modal__footer">
            {isEdit && onDelete && (
              <button
                type="button"
                className="danger-btn"
                onClick={handleDelete}
                disabled={submitting}
              >
                删除
              </button>
            )}
            <div className="modal__footer-right">
              <button
                type="button"
                className="ghost-btn ghost-btn--lg"
                onClick={onClose}
                disabled={submitting}
              >
                取消
              </button>
              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? '保存中…' : isEdit ? '保存修改' : prefill ? '加入时间轴' : '创建事项'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
