import { useEffect, useMemo, useRef } from 'react';
import type { Event } from '../types';
import {
  formatMonthTitle,
  getHolidayInfo,
  getLunarInfo,
  isSameMonth,
  monthGridDays,
  shiftMonth,
  toDateString,
} from '../utils/date';
import { type Diary } from '../api/diaries';
import './EventCalendar.css';

interface Props {
  date: string;
  eventsByDate: Record<string, Event[]>;
  /** 当月所有日记（来自 App 缓存），用于选中日下方的 DiaryEntry 提示条 */
  diaries: Record<string, Diary>;
  /** 主题缓存：date -> "今日主题"标题（与时间轴视图共享） */
  themeCache: Record<string, string>;
  /** 编辑某日主题（写入 API + 同步缓存） */
  onChangeTheme: (_targetDate: string, _title: string) => void;
  /** 双击格子 / 点 ✦ 打开日记弹窗 */
  onOpenDiary: (date: string) => void;
  onSelectDate: (next: string) => void;
  onSelectEvent: (event: Event) => void;
  /** 日记保存后的回调（App 用来刷新 cache） */
  onDiaryChange?: (d: Diary) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MAX_PREVIEW = 3;

export function EventCalendar({
  date,
  eventsByDate,
  diaries,
  themeCache,
  onChangeTheme: _onChangeTheme,
  onOpenDiary,
  onSelectDate,
  onSelectEvent,
}: Props) {
  const today = toDateString(new Date());
  const grid = useMemo(() => monthGridDays(date), [date]);
  const monthStart = useMemo(() => date, [date]);

  // 当月所有事，按日分组（已通过 props 传入）

  // 当月所有日记（按日期索引），用于在格子头部显示标题或 ✦
  const gridRef = useRef<HTMLDivElement | null>(null);

  // 用原生 dblclick 监听器捕获"双击格子"——绕开 React 事件系统，
  // 避免按钮嵌套 / click 拦截导致的 dblclick 失效。
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const handler = (ev: MouseEvent) => {
      // 跳过事件项上的双击 —— 那应该打开事件详情
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.cal-cell__event')) return;
      const cell = target.closest('.cal-cell') as HTMLElement | null;
      if (!cell) return;
      const d = cell.dataset.date;
      if (!d) return;
      ev.preventDefault();
      onSelectDate(d);
      onOpenDiary(d);
    };
    root.addEventListener('dblclick', handler);
    return () => root.removeEventListener('dblclick', handler);
  }, [onSelectDate, onOpenDiary]);

  return (
    <div className="event-calendar" aria-label="月历视图">
      <header className="event-calendar__header">
        <button
          className="icon-btn"
          aria-label="上个月"
          onClick={() => {
            const next = shiftMonth(monthStart, -1);
            // 切换月份时，停留在同一个"号"（若该月不存在则回退到 1）
            const [_, __, d] = date.split('-').map(Number);
            onSelectDate(pickDayInMonth(next, d));
          }}
        >
          ‹
        </button>
        <h2 className="event-calendar__title">{formatMonthTitle(monthStart)}</h2>
        <button
          className="icon-btn"
          aria-label="下个月"
          onClick={() => {
            const next = shiftMonth(monthStart, 1);
            const [_, __, d] = date.split('-').map(Number);
            onSelectDate(pickDayInMonth(next, d));
          }}
        >
          ›
        </button>
        {!isSameMonth(date, today) && (
          <button className="ghost-btn" onClick={() => onSelectDate(today)}>
            回到今天
          </button>
        )}
      </header>

      <div className="event-calendar__weekdays">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`event-calendar__weekday ${i === 0 || i === 6 ? 'is-weekend' : ''}`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="event-calendar__grid" role="grid" ref={gridRef}>
        {grid.map((d) => {
          const events = eventsByDate[d] || [];
          const inMonth = isSameMonth(d, monthStart);
          const isToday = d === today;
          const isSelected = d === date;
          const sorted = Array.isArray(events) ? [...events].sort((a, b) => a.start_time.localeCompare(b.start_time)) : [];
          const visible = sorted.slice(0, MAX_PREVIEW);
          const overflow = sorted.length - visible.length;
          const holiday = getHolidayInfo(d);
          const diary = diaries[d];
          // 主题：与时间轴视图共享同一份"今日主题"
          // 历史实现曾从 diary.title 读取，但那是日记标题；
          // 现在改用主题缓存，保证两个视图显示同一份数据。
          const theme = themeCache[d];
          // 是否有日记内容（标题或正文任一非空视为"有日记"）
          const hasDiary =
            !!diary &&
            ((diary.title || '').trim().length > 0 ||
              (diary.markdown_content || '').trim().length > 0);
          // 仅当月格子显示农历：上下月补全格隐藏，避免视觉噪音
          const lunarLabel = inMonth ? getLunarLabel(d) : '';

          return (
            <div
              key={d}
              data-date={d}
              role="gridcell"
              aria-selected={isSelected}
              tabIndex={0}
              className={[
                'cal-cell',
                inMonth ? '' : 'is-out',
                isToday ? 'is-today' : '',
                isSelected ? 'is-selected' : '',
                hasDiary ? 'has-diary' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(d)}
            >
              <div className="cal-cell__head">
                <span className="cal-cell__day">{d.slice(8, 10)}</span>
                {hasDiary && (
                  <span
                    className="cal-cell__diary-dot"
                    title={diary?.title ? `日记：${diary.title}` : '有日记'}
                    aria-label={diary?.title ? `日记：${diary.title}` : '有日记'}
                  />
                )}
                {lunarLabel && (
                  <span className="cal-cell__lunar" title={`农历：${getLunarInfo(d).full}`}>
                    {lunarLabel}
                  </span>
                )}
                {holiday.primary && (
                  <span
                    className={`cal-cell__tag cal-cell__tag--${holiday.primaryKind || 'solar'}`}
                    title={[
                      holiday.solar,
                      holiday.lunar && `农历：${holiday.lunar}`,
                      holiday.jieqi && `节气：${holiday.jieqi}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {holiday.primary}
                  </span>
                )}
                <button
                  type="button"
                  className={`cal-cell__theme-btn ${theme ? 'has-value' : ''}`}
                  aria-label={theme ? `日记标题：${theme}（打开日记）` : '打开日记'}
                  title={theme ? `日记标题：${theme} · 打开日记` : '打开日记'}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectDate(d);
                    onOpenDiary(d);
                  }}
                >
                  {theme ? `✦ ${theme}` : '✦'}
                </button>
                {isToday && <span className="cal-cell__today-dot" aria-hidden />}
              </div>
              <ul className="cal-cell__events">
                {visible.map((e) => (
                  <li
                    key={e.id}
                    className={`cal-cell__event cal-cell__event--p${e.priority}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectEvent(e);
                    }}
                    title={`${e.start_time} · ${e.title}`}
                  >
                    <span className="cal-cell__event-time">{e.start_time}</span>
                    <span className="cal-cell__event-title">{e.title}</span>
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="cal-cell__more">+ {overflow} 项</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="event-calendar__selected">
        <div className="event-calendar__selected-head">
          <span className="event-calendar__selected-label">{date}</span>
          <span className="event-calendar__selected-count">
            {(eventsByDate[date] || []).length} 项待办
          </span>
        </div>
          <DiaryEntry
            diary={diaries[date]}
            theme={themeCache[date]}
            onOpen={() => onOpenDiary(date)}
          />
        {(eventsByDate[date] || []).length === 0 ? (
          <div className="event-calendar__selected-empty">点击右侧 + 新建事项 · 这一天空空如也</div>
        ) : (
          <ul className="event-calendar__selected-list">
            {[...eventsByDate[date]]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((e) => (
                <li
                  key={e.id}
                  className={`cal-event-row cal-event-row--p${e.priority}`}
                  onClick={() => onSelectEvent(e)}
                >
                  <span className="cal-event-row__time">{e.start_time}</span>
                  <span className="cal-event-row__title">{e.title}</span>
                  {e.note && <span className="cal-event-row__note">{e.note}</span>}
                  <span className={`cal-event-row__chip cal-event-row__chip--p${e.priority}`}>
                    P{e.priority}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * 当日日记编辑器：
 * - 顶部标题（兼容旧的"主题名"）
 * - 左侧 Markdown 编辑 + 右侧实时预览
 * - 支持上传图片/视频/音频；上传后自动插入到 Markdown 末尾
 */
/**
 * 日记入口条：选中日下方一行 — 日记命中时显示标题摘要 + 「打开」按钮触发弹窗。
 * 优先级：今日主题（themeCache）> 日记标题（diary.title）> 正文第一行
 */
function DiaryEntry({ diary, theme, onOpen }: { diary?: Diary; theme?: string; onOpen: () => void }) {
  const hasDiary =
    !!diary && (diary.title.trim().length > 0 || diary.markdown_content.trim().length > 0);
  const hasTheme = !!(theme && theme.trim().length > 0);
  const hasAny = hasDiary || hasTheme;
  const preview =
    (hasTheme ? theme.trim() : '') ||
    diary?.title?.trim() ||
    (diary?.markdown_content
      ? diary.markdown_content.split('\n').find((l) => l.trim()) || ''
      : '');
  // 当前预览来源于哪一处，用于决定标签文案
  const label = hasTheme ? '今日主题' : hasDiary ? '日记' : '';
  return (
    <div className={`diary-prompt ${hasAny ? 'has-value' : ''}`}>
      <span className="diary-prompt__icon">📓</span>
      <span className="diary-prompt__text">
        {hasAny
          ? `${label}：${preview}`
          : '今天还没有日记 · 双击格子或点下面按钮开始写'}
      </span>
      <button type="button" className="diary-prompt__open" onClick={onOpen}>
        {hasAny ? '打开日记' : '写日记'}
      </button>
    </div>
  );
}

/**
 * 单元格头部农历短标签：
 *  - 节日 / 节气当天已经在主 chip 里显示（priority > 日），这里改显示农历"日"或"月"。
 *  - 初一 → "X月"（让月份切换可见）
 *  - 其他 → "初X"/"廿X"/"三十"
 */
function getLunarLabel(dateStr: string): string {
  const info = getLunarInfo(dateStr);
  const holiday = getHolidayInfo(dateStr);
  if (holiday.jieqi) return info.jieqi;
  if (info.dayCN === '初一') return `${info.monthCN}月`;
  return info.dayCN;
}

/**
 * 在目标月中挑选给定"号"；若该月没有该号（如 31）则取该月最后一天。
 */
function pickDayInMonth(monthFirst: string, day: number): string {
  const [y, m] = monthFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const safe = Math.min(Math.max(day, 1), last);
  return `${y}-${String(m).padStart(2, '0')}-${String(safe).padStart(2, '0')}`;
}
