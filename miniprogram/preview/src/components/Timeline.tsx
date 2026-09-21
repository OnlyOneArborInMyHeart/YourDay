import { useMemo, useRef } from 'react';
import type { Event } from '../lib/types';
import { HOURS, minutesToTime, timeToMinutes, toDateString } from '../lib/date';

interface Props {
  events: Event[];
  date: string;
  onSelectEvent: (e: Event) => void;
  onAddAt: (startMinutes: number) => void;
  onToggleDone: (e: Event, done: boolean) => void;
}

const ROW_HEIGHT = 30; // 每 30 分钟 = 30px => 一小时 60px
const TOTAL_MIN = 24 * 60;

interface LaidOutEvent {
  event: Event;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
}
function layoutEvents(events: Event[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '')
  );
  const result: LaidOutEvent[] = [];
  let cluster: { event: Event; end: number; lane: number }[] = [];

  const flush = () => {
    if (!cluster.length) return;
    const totalLanes = Math.max(...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => {
      const start = timeToMinutes(c.event.start_time!);
      const end = timeToMinutes(c.event.end_time!);
      result.push({
        event: c.event,
        top: (start / 60) * 60, // 每小时 60px
        height: Math.max(28, ((end - start) / 60) * 60 - 2),
        lane: c.lane,
        totalLanes,
      });
    });
    cluster = [];
  };

  let clusterEnd = -1;
  sorted.forEach((event) => {
    const start = timeToMinutes(event.start_time!);
    const end = timeToMinutes(event.end_time!);
    if (start >= clusterEnd) { flush(); clusterEnd = end; }
    let lane = 0;
    while (cluster.some((c) => c.lane === lane && c.end > start)) lane++;
    cluster.push({ event, end, lane });
  });
  flush();
  return result;
}

export default function Timeline({ events, date, onSelectEvent, onAddAt, onToggleDone }: Props) {
  const colRefs = useRef<HTMLDivElement | null>(null);
  const laidOut = useMemo(() => layoutEvents(events), [events]);

  // 现在的时刻指示线（仅当 date === today 时显示）
  const isToday = date === toDateString(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function handleColClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalPx = (TOTAL_MIN / 30) * ROW_HEIGHT;
    const minutes = Math.round((y / totalPx) * TOTAL_MIN / 15) * 15; // 15min snap
    onAddAt(Math.max(0, Math.min(TOTAL_MIN - 30, minutes)));
  }

  return (
    <div className="timeline">
      {HOURS.map((h) => (
        <div key={`row-top-${h}`} className="timeline__row">
          <div className="timeline__hour">{String(h).padStart(2, '0')}:00</div>
          <div className="timeline__col hour-mark" />
        </div>
      ))}
      {HOURS.map((h) => (
        <div key={`row-bot-${h}`} className="timeline__row">
          <div className="timeline__hour">&nbsp;</div>
          <div
            className="timeline__col"
            ref={h === 0 ? colRefs : undefined}
            onClick={handleColClick}
          />
        </div>
      ))}

      {/* 当前时刻红线 */}
      {isToday && (
        <div
          className="timeline__now"
          style={{ top: `${(nowMin / 60) * 60}px` }}
        />
      )}

      {/* 事件块：absolute 定位到 24h = 1440px 区域 */}
      <div
        style={{
          position: 'absolute',
          left: 60, right: 16, top: 8,
          height: (TOTAL_MIN / 60) * 60,
          pointerEvents: 'none',
        }}
      >
        {laidOut.map(({ event, top, height, lane, totalLanes }) => (
          <div
            key={event.id}
            className={`timeline-event priority-${event.priority} ${event.done ? 'done' : ''}`}
            style={{
              top,
              height,
              left: `calc(${(lane / totalLanes) * 100}% + 2px)`,
              width: `calc(${100 / totalLanes}% - 4px)`,
              pointerEvents: 'auto',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone(event, !event.done);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSelectEvent(event);
            }}
            title="单击切换完成；双击编辑"
          >
            <div className="timeline-event__title">{event.title}</div>
            <div className="timeline-event__time">{event.start_time}–{event.end_time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}