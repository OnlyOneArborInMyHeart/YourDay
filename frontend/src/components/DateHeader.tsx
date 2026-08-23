import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import './DateHeader.css';
import { RecordPlayer } from './RecordPlayer';
import {
  formatDateLong,
  getLunarInfo,
  getHolidayInfo,
  shiftDay,
  toDateString,
  yearProgress,
  remainingDaysInYear,
  isoWeekNumber,
  dayOfYear,
  relativeDayLabel,
} from '../utils/date';

interface Props {
  date: string;
  onChange: (next: string) => void;
  onAdd: () => void;
  onOpenDecomposer: () => void;
  /** 打开"按数量拆"模式（无时间任务） */
  onOpenQuantityDecomposer?: () => void;
  onOpenDiary: () => void;
  theme: string;
  /** App 已实现乐观更新与回滚，DateHeader 只负责通知 */
  onThemeChange: (targetDate: string, title: string) => void;
  /** 透传给 RecordPlayer 的用户音乐库 */
  musicLibrary?: import('../api/music').MusicTrack[];
  /** 播放时间变化回调 → App 歌词面板 */
  onTimeUpdate?: (t: number) => void;
  /** 切歌回调 → App 歌词面板 */
  onTrackChange?: (track: { id: string; title: string; flavor: string; lyricsRaw: string | null }) => void;
  /** 当前曲目封面图 URL 变化时回调 */
  onCoverChange?: (coverUrl: string | null) => void;
  /** 歌词面板展开回调 */
  onToggleLyrics?: () => void;
  /** 播放进度变化回调 */
  onProgressUpdate?: (info: { progress: number; currentTime: number; duration: number }) => void;
}

export const DateHeader = forwardRef<{ seekTo: (ratio: number) => void; togglePlay: () => void }, Props>(
  ({
    date,
    onChange,
    onAdd,
    onOpenDecomposer,
    onOpenQuantityDecomposer,
    onOpenDiary,
    theme,
    onThemeChange,
    musicLibrary,
    onTimeUpdate,
    onTrackChange,
    onCoverChange,
    onToggleLyrics,
    onProgressUpdate,
  }, ref) => {
  const [editingTheme, setEditingTheme] = useState(false);
  const [themeDraft, setThemeDraft] = useState('');
  const themeInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<{ seekTo: (ratio: number) => void; togglePlay: () => void }>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const playerRowRef = useRef<HTMLDivElement>(null);

  /* 让下方导航行的宽度实时跟随唱片行宽度，二者便可在视觉上左右居中 */
  useEffect(() => {
    const row = playerRowRef.current;
    const nav = navRef.current;
    if (!row || !nav) return;
    const sync = () => {
      const w = row.getBoundingClientRect().width;
      // 宽度等于 player-row，再整体向左偏移 10px 让按钮相对唱片机往左挪
      nav.style.width = `${w}px`;
      nav.style.marginLeft = '-30px';
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(row);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  const lunar = getLunarInfo(date);
  const holiday = getHolidayInfo(date);
  const today = toDateString(new Date());
  const isToday = date === today;
  const relLabel = relativeDayLabel(date, today);
  const yearPct = yearProgress(date);
  const remaining = remainingDaysInYear(date);
  const week = isoWeekNumber(date);
  const dayIdx = dayOfYear(date);

  useEffect(() => {
    if (editingTheme) {
      themeInputRef.current?.focus();
      themeInputRef.current?.select();
    }
  }, [editingTheme]);

  const startEditTheme = () => {
    setThemeDraft(theme);
    setEditingTheme(true);
  };

  const commitTheme = () => {
    const next = themeDraft.trim();
    setEditingTheme(false);
    if (next === theme) return;
    onThemeChange(date, next);
  };

  const cancelEditTheme = () => {
    setEditingTheme(false);
  };

  useImperativeHandle(ref, () => ({
    seekTo: (ratio: number) => playerRef.current?.seekTo(ratio),
    togglePlay: () => playerRef.current?.togglePlay(),
  }), []);

  return (
    <header className="date-header">
      {/* 左侧：唱片（上） + 日期导航（下） */}
      <div className="date-header__nav">
        {/* 黑胶唱片 + 歌词按钮 */}
        <div className="date-header__player-row" ref={playerRowRef}>
          <RecordPlayer
            ref={playerRef}
            library={musicLibrary}
            onTimeUpdate={onTimeUpdate}
            onTrackChange={onTrackChange}
            onCoverChange={onCoverChange}
            onProgressUpdate={(info) => onProgressUpdate?.(info)}
          />
          <button
            type="button"
            className="date-header__lyrics-btn"
            onClick={onToggleLyrics}
            title="显示歌词"
            aria-label="显示歌词"
          >
            <span aria-hidden>♪</span>
          </button>
        </div>

        <div className="date-header__nav-row" ref={navRef}>
          <button
            className="icon-btn"
            onClick={() => onChange(shiftDay(date, -1))}
            title="上一日"
            aria-label="上一日"
          >
            ‹
          </button>
          <button
            className={`date-header__today-btn ${isToday ? 'is-today' : ''}`}
            onClick={() => onChange(today)}
            title="回到今日"
          >
            {isToday ? '今天' : relLabel || '回到今日'}
          </button>
          <button
            className="icon-btn"
            onClick={() => onChange(shiftDay(date, 1))}
            title="下一日"
            aria-label="下一日"
          >
            ›
          </button>
        </div>
      </div>

      {/* 中间：日期 + 星期 + 农历 + 主题 */}
      <div className="date-header__center">
        <div className="date-header__title-row">
          <span className="date-header__date">{formatDateLong(date)}</span>
          {holiday.primary && (
            <span className={`date-header__badge date-header__badge--${holiday.primaryKind}`}>
              {holiday.primary}
            </span>
          )}
        </div>

        <div className="date-header__meta">
          <span className="date-header__meta-chip" data-tip="农历日期">
            <span className="date-header__meta-icon">🌙</span>
            {`农历 ${lunar.monthCN}月${lunar.dayCN}`}
            {lunar.jieqi && (
              <span className="date-header__meta-jieqi">{lunar.jieqi}</span>
            )}
          </span>
          <span className="date-header__meta-chip" data-tip="干支与生肖">
            <span className="date-header__meta-icon">🐾</span>
            {`${lunar.ganzhiYear}年 · ${lunar.zodiac}年`}
          </span>
          <span className="date-header__meta-chip" data-tip="年度进度">
            <span className="date-header__meta-icon">📅</span>
            {`第 ${dayIdx} 天 · 进度 ${yearPct}%`}
          </span>
          <span className="date-header__meta-chip" data-tip="ISO 周编号">
            <span className="date-header__meta-icon">📆</span>
            {`第 ${week} 周`}
          </span>
        </div>

        {/* 今日主题（可点击编辑） */}
        <div className="date-header__theme">
          <span className="date-header__theme-label">今日主题</span>
          {editingTheme ? (
            <input
              ref={themeInputRef}
              className="date-header__theme-input"
              value={themeDraft}
              onChange={(e) => setThemeDraft(e.target.value)}
              onBlur={commitTheme}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTheme();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditTheme();
                }
              }}
              placeholder="给今天写下一个小主题..."
              maxLength={40}
            />
          ) : (
            <button
              className={`date-header__theme-text ${theme ? '' : 'is-empty'}`}
              onClick={startEditTheme}
              title="点击编辑今日主题"
            >
              {theme || '点击给今天写一个主题'}
              <span className="date-header__theme-edit" aria-hidden>
                ✎
              </span>
            </button>
          )}
          {!editingTheme && theme && (
            <span className="date-header__theme-hint">
              {`距年终 ${remaining} 天`}
            </span>
          )}
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="date-header__actions">
        <button
          className="ghost-btn ghost-btn--diary"
          onClick={onOpenDiary}
          title="写当日日记（与日历单元格联动）"
        >
          📓 写日记
        </button>
        <button
          className="ghost-btn ghost-btn--decomposer"
          onClick={onOpenDecomposer}
          title="输入任务总工时，自动拆解到每天"
        >
          ⚡ 拆解任务
        </button>
        {onOpenQuantityDecomposer && (
          <button
            className="ghost-btn ghost-btn--decomposer"
            onClick={onOpenQuantityDecomposer}
            title="一句话描述无时间任务（如：读 50 页 书），按「前重后轻」拆成每天 To-do"
          >
            📚 数量拆解
          </button>
        )}
        <button className="primary-btn" onClick={onAdd}>
          + 新建事项
        </button>
      </div>
    </header>
  );
});