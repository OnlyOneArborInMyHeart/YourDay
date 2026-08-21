import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from '../types';
import { durationMinutes, formatCompletedLabel, formatDateLong, shiftDay, toDateString } from '../utils/date';
import './EventList.css';

export type SortMode = 'time' | 'priority';

interface Props {
  date: string;
  /** 当前日期前后各 N 天的范围（默认 ±7，共 15 天可滑动） */
  windowDays?: number;
  eventsByDate: Record<string, Event[]>;
  onSelectDate: (next: string) => void;
  onSelectEvent: (event: Event) => void;
  onToggleDone: (event: Event, done: boolean) => void;
}

export function EventList({
  date,
  windowDays = 7,
  eventsByDate,
  onSelectDate,
  onSelectEvent,
  onToggleDone,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('time');

  const days = useMemo(() => {
    const list: string[] = [];
    for (let i = -windowDays; i <= windowDays; i++) list.push(shiftDay(date, i));
    return list;
  }, [date, windowDays]);

  const trackRef = useRef<HTMLDivElement>(null);

  // 当前日期变化时，把当天那页 snap 到视图中
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const idx = windowDays; // 当前日在中间
    const child = track.children[idx] as HTMLElement | undefined;
    if (child) {
      track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
  }, [date, windowDays]);

  // 监听 scroll，判断哪一页最接近中心，更新 onSelectDate
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const handle = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      let minDist = Infinity;
      Array.from(track.children).forEach((c, i) => {
        const el = c as HTMLElement;
        const mid = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(mid - center);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      });
      const newDate = days[nearest];
      if (newDate && newDate !== date) onSelectDate(newDate);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(handle);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [days, date, onSelectDate]);

  const today = toDateString(new Date());

  return (
    <div className="event-list" aria-label="按日期滑动的清单">
      <div className="event-list__toolbar">
        <div className="event-list__hint" aria-hidden>
          左右滑动切换日期 · 当前: {formatDateLong(date)}
        </div>
        <div className="sort-toggle" role="tablist" aria-label="清单排序方式">
          <button
            role="tab"
            aria-selected={sortMode === 'time'}
            className={`sort-toggle__btn ${sortMode === 'time' ? 'is-active' : ''}`}
            onClick={() => setSortMode('time')}
            title="按时间顺序"
          >
            <span className="sort-toggle__icon" aria-hidden>⏱</span>
            按时间
          </button>
          <button
            role="tab"
            aria-selected={sortMode === 'priority'}
            className={`sort-toggle__btn ${sortMode === 'priority' ? 'is-active' : ''}`}
            onClick={() => setSortMode('priority')}
            title="按优先级 P1→P2→P3"
          >
            <span className="sort-toggle__icon" aria-hidden>🔥</span>
            按优先级
          </button>
        </div>
      </div>

      <div className="event-list__track" ref={trackRef}>
        {days.map((d) => (
          <DayPanel
            key={d}
            date={d}
            events={(eventsByDate[d] || []).filter((e) => !e.isTodo)}
            isActive={d === date}
            isToday={d === today}
            sortMode={sortMode}
            onSelectEvent={onSelectEvent}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
    </div>
  );
}

interface DayPanelProps {
  date: string;
  events: Event[];
  isActive: boolean;
  isToday: boolean;
  sortMode: SortMode;
  onSelectEvent: (event: Event) => void;
  onToggleDone: (event: Event, done: boolean) => void;
}

function DayPanel({ date, events, isActive, isToday, sortMode, onSelectEvent, onToggleDone }: DayPanelProps) {
  const sorted = useMemo(() => {
    const list = Array.isArray(events) ? [...events] : [];
    if (sortMode === 'priority') {
      // P1 → P2 → P3，同优先级内按时间顺序
      list.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.start_time ?? '').localeCompare(b.start_time ?? '');
      });
    } else {
      list.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    }
    return list;
  }, [events, sortMode]);

  return (
    <section
      className={`day-panel ${isActive ? 'is-active' : ''} ${isToday ? 'is-today' : ''}`}
      aria-current={isActive ? 'date' : undefined}
    >
      <header className="day-panel__header">
        <div className="day-panel__title-wrap">
          <h3 className="day-panel__title">{formatDateLong(date)}</h3>
          {isToday && <span className="day-panel__today-badge">今天</span>}
        </div>
        <span className="day-panel__count">{sorted.length} 项</span>
      </header>

      {sorted.length === 0 ? (
        <div className="day-panel__empty">
          <div className="day-panel__empty-icon">🌿</div>
          <div>{isToday ? '今天没有安排，享受一份宁静吧' : '这一天还没有安排'}</div>
        </div>
      ) : (
        <ul className="day-panel__items">
          {sorted.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              onClick={() => onSelectEvent(e)}
              onToggleDone={(done) => onToggleDone(e, done)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface EventCardProps {
  event: Event;
  onClick: () => void;
  onToggleDone: (done: boolean) => void;
}

function EventCard({ event, onClick, onToggleDone }: EventCardProps) {
  // EventList 传给 EventCard 的都是非 isTodo 项，start_time/end_time 不为 null
  const dur = durationMinutes(event.start_time as string, event.end_time as string);
  // 直接由点击驱动，避免受 effect 时机或外部重挂影响
  const [burstKey, setBurstKey] = useState(0);

  const handleCheck = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    // 不管目标状态是什么，只要当前是未完成→就会变完成，触发动画
    const willBeDone = !event.done;
    onToggleDone(willBeDone);
    if (willBeDone) {
      setBurstKey((k) => k + 1);
    }
  };

  return (
    <li>
      <div
        className={`event-card event-card--p${event.priority} ${event.done ? 'is-done' : ''} ${
          event.background_image ? 'has-bg' : ''
        }`}
      >
        {event.background_image && (
          <div
            className="event-card__bg"
            style={{ backgroundImage: `url(${event.background_image.url})` }}
            aria-hidden
          />
        )}

        <button
          type="button"
          className={`event-card__check ${event.done ? 'is-checked' : ''}`}
          aria-pressed={event.done}
          aria-label={event.done ? '标记为未完成' : '标记为已完成'}
          onClick={handleCheck}
        >
          <svg
            className="event-card__check-icon"
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

        <button
          type="button"
          className="event-card__main"
          onClick={onClick}
        >
          <div className="event-card__time">
            <span className="event-card__time-start">{event.start_time}</span>
            <span className="event-card__time-sep">→</span>
            <span className="event-card__time-end">{event.end_time}</span>
            <span className="event-card__time-dur">{dur} 分钟</span>
          </div>
          <div className="event-card__body">
            <div className="event-card__title">{event.title}</div>
            {event.note && <div className="event-card__note">{event.note}</div>}
            {event.completed_at && (
              <div className="event-card__completed" title={event.completed_at}>
                ✓ {formatCompletedLabel(event.completed_at)}
              </div>
            )}
          </div>
          <span className={`event-card__chip event-card__chip--p${event.priority}`}>
            P{event.priority}
          </span>
        </button>

        {burstKey > 0 && (
          <div
            key={burstKey}
            className="event-card__accept"
            aria-hidden
          >
            <span className="event-card__accept-shimmer" />
            <span className="event-card__accept-text">Accepted!</span>
            <span className="event-card__accept-sub">已完成 ✓</span>
            <span className="event-card__confetti" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <i
                  key={i}
                  className="event-card__confetti-piece"
                  style={
                    {
                      '--angle': `${(360 / 14) * i}deg`,
                      '--hue': `${(360 / 14) * i + 120}`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}
