import { useMemo, useState } from 'react';
import type { Event } from '../types';
import { eventsApi } from '../api/events';
import { durationMinutes, formatCompletedLabel } from '../utils/date';
import './TodoList.css';

interface Props {
  events: Event[];
  onToggleDone: (event: Event, done: boolean) => void;
  onSelectEvent: (event: Event) => void;
  /** 新建后通知父组件刷新 */
  onAdded: () => void;
  /** 当前展示的日期（用于默认时间） */
  date: string;
}

export function TodoList({ events, onToggleDone, onSelectEvent, onAdded, date }: Props) {
  const [addingOpen, setAddingOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addNote, setAddNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 显示纯待办项 + 当前日带时间的日程（统一标记为待办风格）
  const todoEvents = useMemo(() => {
    const list = events.filter((e) => e.isTodo || !!e.start_time);
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      // 有时间的排前面
      if (a.start_time && !b.start_time) return -1;
      if (!a.start_time && b.start_time) return 1;
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      return 0;
    });
    return list;
  }, [events]);

  const remaining = todoEvents.filter((e) => !e.done).length;

  const handleAdd = async () => {
    if (!addTitle.trim()) return;
    setSubmitting(true);
    try {
      await eventsApi.create({
        title: addTitle.trim(),
        note: addNote.trim(),
        date,
        priority: 2,
        background_image_id: null,
        isTodo: true,
      });
      setAddTitle('');
      setAddNote('');
      setAddingOpen(false);
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="todo-list" aria-label="待办清单">
      <header className="todo-list__head">
        <h3 className="todo-list__title">To‑do</h3>
        <span className="todo-list__count">
          {remaining} / {todoEvents.length} 待完成
        </span>
        {!addingOpen && (
          <button
            className="todo-list__add-btn"
            onClick={() => setAddingOpen(true)}
            title="添加任务"
          >
            +
          </button>
        )}
      </header>

      {addingOpen && (
        <div className="todo-list__add-form">
          <input
            autoFocus
            className="todo-list__add-title"
            placeholder="任务名称"
            value={addTitle}
            maxLength={80}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              else if (e.key === 'Escape') {
                setAddingOpen(false);
                setAddTitle('');
                setAddNote('');
              }
            }}
          />
          <textarea
            className="todo-list__add-note"
            placeholder="备注（可选）"
            rows={2}
            maxLength={300}
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAddingOpen(false);
                setAddTitle('');
                setAddNote('');
              }
            }}
          />
          <div className="todo-list__add-actions">
            <button
              className="ghost-btn ghost-btn--sm"
              onClick={() => {
                setAddingOpen(false);
                setAddTitle('');
                setAddNote('');
              }}
              disabled={submitting}
            >
              取消
            </button>
            <button
              className="primary-btn primary-btn--sm"
              onClick={handleAdd}
              disabled={submitting || !addTitle.trim()}
            >
              {submitting ? '添加…' : '添加'}
            </button>
          </div>
        </div>
      )}

      {todoEvents.length === 0 ? (
        <div className="todo-list__empty">
          <div className="todo-list__empty-icon">🌿</div>
          <div>今天还没有安排，享受一份宁静吧</div>
        </div>
      ) : (
        <ul className="todo-list__items">
          {todoEvents.map((e) => (
            <TodoItem
              key={e.id}
              event={e}
              onToggleDone={(evt, done) => onToggleDone(evt, done)}
              onClick={() => onSelectEvent(e)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function TodoItem({
  event,
  onToggleDone,
  onClick,
}: {
  event: Event;
  onToggleDone: (event: Event, done: boolean) => void;
  onClick: () => void;
}) {
  const dur = !event.isTodo ? durationMinutes(event.start_time as string, event.end_time as string) : null;
  return (
    <li
      className={`todo-item todo-item--p${event.priority} ${event.done ? 'is-done' : ''} ${
        event.background_image ? 'has-bg' : ''
      } ${event.isTodo ? 'is-todo' : ''}`}
    >
      {event.background_image && (
        <div
          className="todo-item__bg"
          style={{ backgroundImage: `url(${event.background_image.url})` }}
          aria-hidden
        />
      )}
      <button
        type="button"
        className={`todo-item__check ${event.done ? 'is-checked' : ''}`}
        aria-pressed={event.done}
        aria-label={event.done ? '标记为未完成' : '标记为已完成'}
        onClick={() => onToggleDone(event, !event.done)}
      >
        <svg
          className="todo-item__check-icon"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden
        >
          <path
            d="M3 8.5l3.2 3.2L13 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button type="button" className="todo-item__body" onClick={onClick}>
        {!event.isTodo && (
          <div className="todo-item__time">
            <span className="todo-item__time-start">{event.start_time}</span>
            <span className="todo-item__time-sep">→</span>
            <span className="todo-item__time-end">{event.end_time}</span>
            <span className="todo-item__time-dur">{dur} 分钟</span>
          </div>
        )}
        <div className="todo-item__title">
          {event.isTodo && <span className="todo-item__todo-badge">待办</span>}
          {event.title}
        </div>
        {event.note && <div className="todo-item__note">{event.note}</div>}
        {event.completed_at && (
          <div className="todo-item__completed" title={event.completed_at}>
              ✓ {formatCompletedLabel(event.completed_at)}
          </div>
        )}
      </button>

      <span className={`todo-item__chip todo-item__chip--p${event.priority}`}>
        P{event.priority}
      </span>
    </li>
  );
}
