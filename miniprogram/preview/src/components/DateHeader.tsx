import { useEffect, useState } from 'react';
import {
  formatDateLong, getLunarInfo, getHolidayInfo, isoWeekNumber,
  shiftDay, toDateString, yearProgress, remainingDaysInYear,
  relativeDayLabel, weekdayName,
} from '../lib/date';

interface Props {
  date: string;
  onChange: (next: string) => void;
  theme: string;
  onThemeChange: (next: string) => void;
  onOpenDiary: () => void;
  onOpenSettings: () => void;
  onOpenExport: () => void;
}

export default function DateHeader({
  date, onChange, theme, onThemeChange, onOpenDiary, onOpenSettings, onOpenExport,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme);
  useEffect(() => setDraft(theme), [theme]);

  const today = toDateString(new Date());
  const lunar = getLunarInfo(date);
  const holiday = getHolidayInfo(date);
  const relLabel = relativeDayLabel(date, today);
  const week = isoWeekNumber(date);
  const prog = yearProgress(date);
  const remaining = remainingDaysInYear(date);
  const isToday = date === today;

  function save() {
    setEditing(false);
    if (draft !== theme) onThemeChange(draft);
  }

  return (
    <div className="date-header">
      <div className="date-nav">
        <button className="date-nav__btn" onClick={() => onChange(shiftDay(date, -1))}>‹</button>
        <div className="date-nav__date" onClick={() => !isToday && onChange(today)} style={{ cursor: isToday ? 'default' : 'pointer' }}>
          <div className="date-nav__main">{formatDateLong(date)}</div>
          <div className="date-nav__sub">
            {relLabel && <span style={{ color: '#6366f1', marginRight: 6 }}>{relLabel}</span>}
            {lunar.full}
            {holiday && <span style={{ color: '#ef4444', marginLeft: 6 }}>· {holiday.name}</span>}
            <span style={{ marginLeft: 6 }}>· 第 {week} 周</span>
          </div>
        </div>
        <button className="date-nav__btn" onClick={() => onChange(shiftDay(date, 1))}>›</button>
      </div>

      {!isToday && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <button className="date-nav__today" onClick={() => onChange(today)}>回到今天</button>
        </div>
      )}

      <div className="theme-row">
        <span className="theme-row__label">✦ 主题</span>
        {editing ? (
          <input
            className="theme-row__input"
            value={draft}
            autoFocus
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setDraft(theme); setEditing(false); }
            }}
          />
        ) : (
          <span className="theme-row__value" onDoubleClick={() => setEditing(true)}>
            {theme || '（双击编辑）'}
          </span>
        )}
        <button className="theme-row__btn" onClick={onOpenDiary} title="写日记">📔</button>
        <button className="theme-row__btn" onClick={onOpenSettings} title="设置">⚙</button>
      </div>

      <div className="year-progress">
        <span>{lunar.ganzhiYear}年 · {lunar.zodiac}年</span>
        <div className="year-progress__bar">
          <div className="year-progress__fill" style={{ width: `${prog}%` }} />
        </div>
        <span>{prog}% · 剩 {remaining} 天</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button className="btn-ghost" onClick={onOpenExport}>📦 批量导出</button>
      </div>
    </div>
  );
}