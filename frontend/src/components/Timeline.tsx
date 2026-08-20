import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Event } from '../types';
import {
  HOURS,
  formatCompletedTime,
  minutesToTime,
  timeToMinutes,
} from '../utils/date';
import './Timeline.css';

interface Props {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  onAddAt: (startMinutes: number) => void;
  onToggleDone: (event: Event, done: boolean) => void;
  /** 拖动 / 拉伸结束后回调（以分钟为单位） */
  onUpdateEventTime: (
    event: Event,
    next: { startMinutes: number; endMinutes: number },
  ) => void;
}

const ROW_HEIGHT = 56; // 每小时高度（px）
const TOTAL_MINUTES = 24 * 60;
const SNAP_MIN = 15; // 拖动 / 拉伸都按 15 分钟对齐
const MIN_DURATION = 15; // 最短事件 15 分钟

interface LaidOutEvent {
  event: Event;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
}

function layoutEvents(events: Event[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) =>
    a.start_time === b.start_time ? a.end_time.localeCompare(b.end_time) : a.start_time.localeCompare(b.start_time),
  );

  interface Pending {
    event: Event;
    end: number;
    lane: number;
  }

  const result: LaidOutEvent[] = [];
  let cluster: Pending[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const totalLanes = Math.max(...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => {
      const start = timeToMinutes(c.event.start_time);
      const end = timeToMinutes(c.event.end_time);
      result.push({
        event: c.event,
        top: (start / 60) * ROW_HEIGHT,
        height: Math.max(28, ((end - start) / 60) * ROW_HEIGHT - 2),
        lane: c.lane,
        totalLanes,
      });
    });
    cluster = [];
  };

  sorted.forEach((event) => {
    const start = timeToMinutes(event.start_time);
    const end = timeToMinutes(event.end_time);
    if (start >= clusterEnd) flush();

    let lane = 0;
    while (cluster.some((c) => c.lane === lane && c.end > start)) lane++;
    cluster.push({ event, end, lane });
    clusterEnd = Math.max(clusterEnd, end);
  });
  flush();

  return result;
}

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

type DragMode = 'move' | 'resize-top' | 'resize-bottom';

export function Timeline({
  events,
  onSelectEvent,
  onAddAt,
  onToggleDone,
  onUpdateEventTime,
}: Props) {
  const laid = useMemo(() => layoutEvents(events), [events]);

  const totalHours = HOURS.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  /** 每次 events 更新时（切换日期）：自动滚动到第一个任务的开始时间 */
  useEffect(() => {
    if (events.length === 0) {
      canvasWrapRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const firstStart = events.reduce((min, e) => {
      const m = timeToMinutes(e.start_time);
      return m < min ? m : min;
    }, Infinity);
    if (!Number.isFinite(firstStart)) return;
    const targetTop = (firstStart / 60) * ROW_HEIGHT;
    // 给 canvas 一帧渲染时间再 scroll，避免 DOM 还没 paint 时 scroll 无效
    const raf = requestAnimationFrame(() => {
      canvasWrapRef.current?.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [events]);

  const handleScroll = () => {
    const canvas = canvasWrapRef.current;
    const hours = scrollRef.current;
    if (canvas && hours) {
      hours.style.transform = `translateY(-${canvas.scrollTop}px)`;
    }
  };

  const contentHeight = totalHours * ROW_HEIGHT;

  const [draggingId, setDraggingId] = useState<number | null>(null);

  return (
    <div className="timeline" role="grid" aria-label="24 小时时间表">
      <div className="timeline__hours">
        <div
          className="timeline__hours-inner"
          ref={scrollRef}
          style={{ height: contentHeight }}
        >
          {HOURS.map((h) => (
            <div key={h} className="timeline__hour-row" style={{ height: ROW_HEIGHT }}>
              <span className="timeline__hour-label">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="timeline__canvas-wrap"
        ref={canvasWrapRef}
        onScroll={handleScroll}
      >
        <div
          className="timeline__canvas"
          style={{ height: totalHours * ROW_HEIGHT }}
          onDoubleClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const minutes = Math.max(0, Math.min(TOTAL_MINUTES - 30, Math.round((offsetY / ROW_HEIGHT) * 60 / 15) * 15));
            onAddAt(minutes);
          }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="timeline__grid-row"
              style={{ top: h * ROW_HEIGHT, height: ROW_HEIGHT }}
            />
          ))}
          {HOURS.map((h) => (
            <div
              key={`half-${h}`}
              className="timeline__grid-row timeline__grid-row--half"
              style={{ top: h * ROW_HEIGHT + ROW_HEIGHT / 2, height: 0 }}
            />
          ))}

          <CurrentTimeLine />

          {laid.map((node) => (
            <EventBlock
              key={node.event.id}
              lane={node.lane}
              totalLanes={node.totalLanes}
              event={node.event}
              dragging={draggingId === node.event.id}
              onSelect={() => onSelectEvent(node.event)}
              onToggleDone={(done) => onToggleDone(node.event, done)}
              onDragStart={() => setDraggingId(node.event.id)}
              onDragEnd={() => setDraggingId(null)}
              onCommit={(startMin, endMin) => {
                onUpdateEventTime(node.event, {
                  startMinutes: startMin,
                  endMinutes: endMin,
                });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60) * ROW_HEIGHT;
  return (
    <div className="timeline__now" style={{ top }}>
      <span className="timeline__now-dot" />
    </div>
  );
}

interface EventBlockProps {
  lane: number;
  totalLanes: number;
  event: Event;
  dragging: boolean;
  onSelect: () => void;
  onToggleDone: (done: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCommit: (startMinutes: number, endMinutes: number) => void;
}

function EventBlock({
  lane,
  totalLanes,
  event,
  dragging,
  onSelect,
  onToggleDone,
  onDragStart,
  onDragEnd,
  onCommit,
}: EventBlockProps) {
  const widthPct = 100 / totalLanes;
  const leftPct = lane * widthPct;

  // 拖动期间为 true，pointerup 后用微任务延迟清掉，避免浏览器把 mouseup 派生为 click 误触打开详情
  const wasDraggingRef = useRef(false);
  // 卸载时如果有挂起的 reset timer，清掉避免 setState on unmounted
  const dragResetTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current !== null) {
        window.clearTimeout(dragResetTimerRef.current);
        dragResetTimerRef.current = null;
      }
    };
  }, []);

  // 受控的"草稿"时间：拖动 / 拉伸期间实时更新样式，松开再提交
  const [draft, setDraft] = useState<{
    startMin: number;
    endMin: number;
  } | null>(null);

  const originStart = timeToMinutes(event.start_time);
  const originEnd = timeToMinutes(event.end_time);

  const startMin = draft ? draft.startMin : originStart;
  const endMin = draft ? draft.endMin : originEnd;

  const renderTop = (startMin / 60) * ROW_HEIGHT + 1;
  const renderHeight = Math.max(28, ((endMin - startMin) / 60) * ROW_HEIGHT - 2);
  const dur = Math.max(0, endMin - startMin);
  const startTimeStr = minutesToTime(startMin);
  const endTimeStr = minutesToTime(endMin);

  const classes = [
    'event-block',
    `event-block--p${event.priority}`,
    event.done ? 'is-done' : '',
    dragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const [burstKey, setBurstKey] = useState(0);

  const handleCheck = (ev: ReactMouseEvent) => {
    ev.stopPropagation();
    const willBeDone = !event.done;
    onToggleDone(willBeDone);
    if (willBeDone) setBurstKey((k) => k + 1);
  };

  /**
   * 拖动 / 拉伸核心逻辑。
   * 用 Pointer Events，捕获 cursor 在 canvas 内的 Y 坐标，
   * 换算成分钟数，对齐到 SNAP_MIN；最少 15 分钟；边界 [0, 1430]。
   */
  const startDrag = (
    ev: ReactPointerEvent<HTMLDivElement>,
    mode: DragMode,
  ) => {
    // 防止按钮区域触发（check 按钮自己 stopPropagation 已经够了，这里再保险一次）
    const target = ev.target as HTMLElement;
    if (target.closest('button')) return;
    ev.stopPropagation();
    ev.preventDefault();

    const pointerStartY = ev.clientY;
    const start0 = originStart;
    const end0 = originEnd;
    let moved = false;

    // 用 ref 保存最后一次草稿：onUp 同步取值，避免依赖 React state 异步更新
    let lastDraft = { startMin: start0, endMin: end0 };

    onDragStart();
    setDraft({ startMin: start0, endMin: end0 });

    const onMove = (e: PointerEvent) => {
      const deltaMin = ((e.clientY - pointerStartY) / ROW_HEIGHT) * 60;
      if (Math.abs(deltaMin) > 0.5) moved = true;

      let nextStart = start0;
      let nextEnd = end0;
      if (mode === 'move') {
        let s = snap(start0 + deltaMin);
        const length = end0 - start0;
        s = Math.max(0, Math.min(TOTAL_MINUTES - length, s));
        nextStart = s;
        nextEnd = s + length;
      } else if (mode === 'resize-top') {
        let s = snap(start0 + deltaMin);
        s = Math.max(0, Math.min(end0 - MIN_DURATION, s));
        nextStart = s;
        nextEnd = end0;
      } else {
        let en = snap(end0 + deltaMin);
        en = Math.max(start0 + MIN_DURATION, Math.min(TOTAL_MINUTES, en));
        nextStart = start0;
        nextEnd = en;
      }
      lastDraft = { startMin: nextStart, endMin: nextEnd };
      setDraft({ startMin: nextStart, endMin: nextEnd });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      onDragEnd();
      const final = lastDraft;
      setDraft(null);
      if (moved) {
        // 这次操作是拖动 / 拉伸：标记为 dragging，下一次合成 click 必须忽略，避免打开详情弹窗
        wasDraggingRef.current = true;
        if (dragResetTimerRef.current !== null) {
          window.clearTimeout(dragResetTimerRef.current);
        }
        dragResetTimerRef.current = window.setTimeout(() => {
          wasDraggingRef.current = false;
          dragResetTimerRef.current = null;
        }, 0);
        if (final.startMin !== originStart || final.endMin !== originEnd) {
          onCommit(final.startMin, final.endMin);
        }
        return;
      }
      // 没产生位移 → 视为点击，交给 onSelect 打开 modal
      onSelect();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={classes + (event.background_image ? ' has-bg' : '')}
      style={
        {
          top: renderTop,
          height: renderHeight,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
        } as CSSProperties
      }
      title={`${event.title} · ${startTimeStr} – ${endTimeStr}`}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        onSelect();
      }}
    >
      {event.background_image && (
        <div
          className="event-block__bg"
          style={{ backgroundImage: `url(${event.background_image.url})` }}
          aria-hidden
        />
      )}

      <div
        className="event-block__resize event-block__resize--top"
        onPointerDown={(ev) => startDrag(ev, 'resize-top')}
        aria-label="调整开始时间"
      />
      <div
        className="event-block__resize event-block__resize--bottom"
        onPointerDown={(ev) => startDrag(ev, 'resize-bottom')}
        aria-label="调整结束时间"
      />

      <button
        type="button"
        className={`event-block__check ${event.done ? 'is-checked' : ''}`}
        aria-pressed={event.done}
        aria-label={event.done ? '标记为未完成' : '标记为已完成'}
        onClick={handleCheck}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        <svg
          className="event-block__check-icon"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden
        >
          <path
            d="M3 8.5l3.2 3.2L13 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className="event-block__main"
        role="button"
        tabIndex={0}
        onClick={(ev) => {
          // 拖动刚结束 → 浏览器会把 pointerup 派发为合成 click，必须忽略，否则会误打开详情
          if (wasDraggingRef.current) {
            ev.stopPropagation();
            return;
          }
          ev.stopPropagation();
          onSelect();
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onSelect();
          }
        }}
        onPointerDown={(ev) => startDrag(ev, 'move')}
      >
        <div className="event-block__title">{event.title}</div>
        <div className="event-block__time">
          {startTimeStr} – {endTimeStr}
          <span className="event-block__dur"> · {dur} 分钟</span>
        </div>
        {event.completed_at && (
          <div className="event-block__completed" title={event.completed_at}>
            ✓ 完成于 {formatCompletedTime(event.completed_at)}
          </div>
        )}
        {event.note && renderHeight > 70 && <div className="event-block__note">{event.note}</div>}
      </div>

      {burstKey > 0 && (
        <div key={burstKey} className="event-block__accept" aria-hidden>
          <span className="event-block__accept-shimmer" />
          <span className="event-block__accept-text">Accepted!</span>
          <span className="event-block__accept-sub">已完成 ✓</span>
          <span className="event-block__confetti" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <i
                key={i}
                className="event-block__confetti-piece"
                style={
                  {
                    '--angle': `${(360 / 12) * i}deg`,
                    '--hue': `${(360 / 12) * i + 120}`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}