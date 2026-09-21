import { useMemo, useState } from 'react';
import type { Event, Diary } from '../lib/types';
import {
  isSameMonth, monthGridDays, toDateString, formatMonthTitle, shiftMonth, weekdayName,
} from '../lib/date';

interface Props {
  date: string;
  onSelectDate: (d: string) => void;
  eventsByDate: Record<string, Event[]>;
  themeCache: Record<string, string>;
  diaryCache: Record<string, Diary>;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function EventCalendar({ date, onSelectDate, eventsByDate, themeCache, diaryCache }: Props) {
  const [monthCursor, setMonthCursor] = useState(date);
  const days = useMemo(() => monthGridDays(monthCursor), [monthCursor]);
  const today = toDateString(new Date());

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button className="calendar__nav-btn" onClick={() => setMonthCursor(shiftMonth(monthCursor, -1))}>‹</button>
        <div className="calendar__title">{formatMonthTitle(monthCursor)}</div>
        <button className="calendar__nav-btn" onClick={() => setMonthCursor(shiftMonth(monthCursor, 1))}>›</button>
      </div>

      <div className="calendar__weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      <div className="calendar__grid">
        {days.map((d) => {
          const outside = !isSameMonth(d, monthCursor);
          const events = eventsByDate[d] || [];
          const theme = themeCache[d];
          const diary = diaryCache[d];
          const isToday = d === today;
          const isSelected = d === date;
          const sortedEvents = [...events].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
          const visibleEvents = sortedEvents.slice(0, 2);
          const moreCount = sortedEvents.length - visibleEvents.length;
          return (
            <div
              key={d}
              className={`calendar__cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectDate(d)}
            >
              <div className="calendar__day">{Number(d.slice(8))}</div>
              <div className="calendar__chips">
                {theme && <div className="calendar__chip theme" title={theme}>✦ {theme}</div>}
                {diary && <div className="calendar__chip diary">📔 {diary.title || '有日记'}</div>}
                {visibleEvents.map((e) => (
                  <div key={e.id} className={`calendar__chip event priority-${e.priority}`}>
                    {e.start_time ? `${e.start_time} ` : ''}{e.title}
                  </div>
                ))}
                {moreCount > 0 && <div className="calendar__chip more">+{moreCount}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}