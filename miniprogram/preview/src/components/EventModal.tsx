import { useEffect, useState } from 'react';
import type { Event, EventDraft, Priority } from '../lib/types';
import { minutesToTime, timeToMinutes } from '../lib/date';

interface Props {
  open: boolean;
  date: string;
  initial?: Event;
  defaultStartMinutes?: number;
  onClose: () => void;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 1, label: 'P1 紧急' },
  { value: 2, label: 'P2 重要' },
  { value: 3, label: 'P3 一般' },
];

export default function EventModal({ open, date, initial, defaultStartMinutes, onClose, onSubmit, onDelete }: Props) {
  const isEdit = !!initial;
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [priority, setPriority] = useState<Priority>(2);
  const [note, setNote] = useState('');
  const [isTodo, setIsTodo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setTitle(initial.title);
      setStart(initial.start_time ?? '09:00');
      setEnd(initial.end_time ?? '10:00');
      setPriority(initial.priority);
      setNote(initial.note || '');
      setIsTodo(!!initial.is_todo);
    } else {
      setTitle('');
      const sMin = defaultStartMinutes ?? 9 * 60;
      setStart(minutesToTime(sMin));
      setEnd(minutesToTime(Math.min(24 * 60 - 1, sMin + 60)));
      setPriority(2);
      setNote('');
      setIsTodo(false);
    }
  }, [open, initial, defaultStartMinutes]);

  if (!open) return null;

  async function submit() {
    if (!title.trim()) {
      setError('请输入标题');
      return;
    }
    if (!isTodo && end <= start) {
      setError('结束时间需晚于开始时间');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const startTime = isTodo ? '00:00' : start;
      const endTime = isTodo ? '00:00' : end;
      await onSubmit({
        date,
        title: title.trim(),
        start_time: startTime,
        end_time: endTime,
        priority,
        note,
        isTodo,
      });
      onClose();
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function del() {
    if (!initial || !onDelete) return;
    if (!window.confirm('删除该事件？此操作不可撤销')) return;
    setSubmitting(true);
    try {
      await onDelete(initial.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <div className="modal__title">{isEdit ? '编辑事件' : '新建事件'}</div>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">
          <div className="auth-page__field">
            <label className="auth-page__label">标题</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="event-form__row">
            <div className="event-form__col">
              <label className="auth-page__label">开始</label>
              <input
                type="time"
                step="900"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (!isTodo && end <= e.target.value) {
                    setEnd(minutesToTime(timeToMinutes(e.target.value) + 60));
                  }
                }}
                disabled={isTodo}
              />
            </div>
            <div className="event-form__col">
              <label className="auth-page__label">结束</label>
              <input
                type="time"
                step="900"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={isTodo}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="auth-page__label">优先级</label>
            <div className="event-form__priority">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`event-form__pri priority-${p.value} ${priority === p.value ? 'is-active' : ''}`}
                  onClick={() => setPriority(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="event-form__switch">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a5266' }}>
              <input type="checkbox" checked={isTodo} onChange={(e) => setIsTodo(e.target.checked)} />
              <span>纯待办（无具体时间，只在"今日待办"列表中显示）</span>
            </label>
          </div>

          <div className="auth-page__field">
            <label className="auth-page__label">备注</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选"
            />
          </div>

          {error && <div className="page__error">{error}</div>}
        </div>
        <div className="modal__footer">
          {isEdit && onDelete && (
            <button className="btn-danger" disabled={submitting} onClick={del}>删除</button>
          )}
          <button className="btn-ghost" disabled={submitting} onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}