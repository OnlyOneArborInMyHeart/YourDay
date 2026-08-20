import { useMemo } from 'react';
import type { Event } from '../types';
import { durationMinutes, formatCompletedLabel } from '../utils/date';
import './TodoList.css';

interface Props {
  events: Event[];
  onToggleDone: (event: Event, done: boolean) => void;
  onSelectEvent: (event: Event) => void;
}

export function TodoList({ events, onToggleDone, onSelectEvent }: Props) {
  const sorted = useMemo(() => {
    const list = Array.isArray(events) ? [...events] : [];
    // 未完成在前；按时间顺序
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.start_time.localeCompare(b.start_time);
    });
    return list;
  }, [events]);

  const remaining = sorted.filter((e) => !e.done).length;

  return (
    <aside className="todo-list" aria-label="待办清单">
      <header className="todo-list__head">
        <h3 className="todo-list__title">To‑do</h3>
        <span className="todo-list__count">
          {remaining} / {sorted.length} 待完成
        </span>
      </header>

      {sorted.length === 0 ? (
        <div className="todo-list__empty">
          <div className="todo-list__empty-icon">🌿</div>
          <div>今天还没有安排，享受一份宁静吧</div>
        </div>
      ) : (
        <ul className="todo-list__items">
          {sorted.map((e) => (
            <TodoItem
              key={e.id}
              event={e}
              onToggleDone={(done) => onToggleDone(e, done)}
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
  onToggleDone: (done: boolean) => void;
  onClick: () => void;
}) {
  const dur = durationMinutes(event.start_time, event.end_time);
  return (
    <li
      className={`todo-item todo-item--p${event.priority} ${event.done ? 'is-done' : ''} ${
        event.background_image ? 'has-bg' : ''
      }`}
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
        onClick={() => onToggleDone(!event.done)}
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
        <div className="todo-item__time">
          <span className="todo-item__time-start">{event.start_time}</span>
          <span className="todo-item__time-sep">→</span>
          <span className="todo-item__time-end">{event.end_time}</span>
          <span className="todo-item__time-dur">{dur} 分钟</span>
        </div>
        <div className="todo-item__title">{event.title}</div>
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
