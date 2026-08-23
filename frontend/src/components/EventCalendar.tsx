import { useCallback, useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
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
import { parseDiaryArchiveBlock, type ArchivedItem } from '../utils/archive';
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
  /** 打开批量导出弹窗 */
  onBatchExport: () => void;
  onSelectDate: (next: string) => void;
  onSelectEvent: (event: Event) => void;
  /** 日记保存后的回调（App 用来刷新 cache） */
  onDiaryChange?: (d: Diary) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function EventCalendar({
  date,
  eventsByDate,
  diaries,
  themeCache,
  onChangeTheme: _onChangeTheme,
  onOpenDiary,
  onBatchExport,
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
            const [_, __, d] = date.split('-').map(Number);
            onSelectDate(pickDayInMonth(next, d));
          }}
        >
          ‹
        </button>
        {!isSameMonth(date, today) && (
          <button
            className="ghost-btn event-calendar__today-btn"
            onClick={() => onSelectDate(today)}
          >
            回到今天
          </button>
        )}
        <h2 className="event-calendar__title">{formatMonthTitle(monthStart)}</h2>
        <button
          className="ghost-btn"
          onClick={onBatchExport}
          title="批量导出日记为 Markdown 文件"
        >
          📦 批量导出
        </button>
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
          const inMonth = isSameMonth(d, monthStart);
          const isToday = d === today;
          const isSelected = d === date;
          const eventsAll = eventsByDate[d] || [];
          // 待办 = 未完成（包括 isTodo=true 的无时间任务）
          const todoEvents = eventsAll.filter((e) => !e.done);
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

          // 已完成：从 diary 末尾"完成的事项 (YYYY-MM-DD)"块解析（不论过去/今天/未来均一致）。
          // 后端 diaryArchive.js 在 done 0→1 那一刻即把对应事项写到该日的日记末尾，所以
          // 任何日期的"今日已完成"都能直接通过日记拿到，无需前端额外拉取 todos。
          //
          // 但有一种例外：今天刚完成的事项在 diaryCache 里可能还未刷新（diaryCache 按月加载，
          // 而 diary 新建后要等下次 loadMonth 才更新）。此时 eventsAll 里 done=true 的项
          // 还没进归档块，所以再补一次兜底：从 eventsAll 中取 done=true 的项（isTodo/todo
          // 均可），合并进 archivedItems（去重用 id+kind 判重）。
          let archivedItems: ArchivedItem[] = parseDiaryArchiveBlock(
            diary?.markdown_content ?? '',
            d
          );
          if (d >= today) {
            const archivedIds = new Set(archivedItems.map((a) => `${a.kind}:${a.id}`));
            const extraDone: ArchivedItem[] = eventsAll
              .filter((e) => e.done && !archivedIds.has(`todo:${e.id}`) && !archivedIds.has(`event:${e.id}`))
              .map((e) => ({
                kind: e.isTodo ? 'todo' : 'event',
                id: e.id,
                title: e.title,
                startTime: e.start_time ?? null,
                endTime: e.end_time ?? null,
                priority: e.priority,
              }));
            archivedItems = [...archivedItems, ...extraDone];
          }

          // 排序：合并"待办 + 已完成"到同一个滚动列表
          // 顺序：有时间未完成 → 无时间未完成 → 有时间已完成 → 无时间已完成
          // 让活动事项优先展示，归档项垫底，按时间升序
          const evRank = (e: Event) => {
            return {
              untimed: e.start_time ? 0 : 1,
              time: e.start_time ?? '99:99',
              todo: e.isTodo ? 1 : 0,
            };
          };
          const archivedRank = (it: ArchivedItem) =>
            it.kind === 'event'
              ? { untimed: it.startTime ? 0 : 1, time: it.startTime ?? '99:99' }
              : { untimed: 1, time: '99:99' };
          const mergedItems: Event[] = todoEvents.slice();
          mergedItems.sort((a, b) => {
            const ra = evRank(a);
            const rb = evRank(b);
            if (ra.untimed !== rb.untimed) return ra.untimed - rb.untimed;
            if (ra.time !== rb.time) return ra.time < rb.time ? -1 : 1;
            return ra.todo - rb.todo;
          });
          const archivedOnly: ArchivedItem[] = archivedItems.filter(
            (it) => !todoEvents.some((e) => e.id === it.id)
          );
          const archivedOnlySorted = [...archivedOnly].sort((a, b) => {
            const ra = archivedRank(a);
            const rb = archivedRank(b);
            if (ra.untimed !== rb.untimed) return ra.untimed - rb.untimed;
            return ra.time < rb.time ? -1 : 1;
          });

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
                d < today ? 'is-past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(d)}
            >
              <div className="cal-cell__head">
                <span className="cal-cell__day">{d.slice(8, 10)}</span>
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
                <span className="cal-cell__flags">
                  {hasDiary && (
                    <span
                      className="cal-cell__diary-dot"
                      title={diary?.title ? `日记：${diary.title}` : '有日记'}
                      aria-label={diary?.title ? `日记：${diary.title}` : '有日记'}
                    />
                  )}
                  {isToday && <span className="cal-cell__today-dot" aria-hidden />}
                </span>
              </div>
              <div className="cal-cell__body">
                {mergedItems.length > 0 || archivedOnlySorted.length > 0 ? (
                  <TodoScrollList>
                    {mergedItems.map((e) => (
                      <li
                        key={`todo-${e.id}`}
                        className={`cal-cell__event cal-cell__event--p${e.priority}${e.isTodo ? ' cal-cell__event--no-time' : ''}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelectEvent(e);
                        }}
                        title={`${e.start_time ?? ''} ${e.start_time ? '·' : ''} ${e.title}`}
                      >
                        <span className="cal-cell__event-time">
                          {e.isTodo ? '·' : e.start_time}
                        </span>
                        <span className="cal-cell__event-title">{e.title}</span>
                      </li>
                    ))}
                    {archivedOnlySorted.map((item) => (
                      <ArchivedRow key={`a-${item.kind}-${item.id}`} item={item} />
                    ))}
                  </TodoScrollList>
                ) : (
                  <div className="cal-cell__empty">无事项</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="event-calendar__selected">
        <div className="event-calendar__selected-head">
          <span className="event-calendar__selected-label">{date}</span>
          <span className="event-calendar__selected-count">
            {(() => {
              const arch = parseDiaryArchiveBlock(diaries[date]?.markdown_content ?? '', date);
              const todo = (eventsByDate[date] || []).filter((e) => !e.done);
              return `已完成 ${arch.length} · 待办 ${todo.length}`;
            })()}
          </span>
        </div>
          <DiaryEntry
            diary={diaries[date]}
            theme={themeCache[date]}
            onOpen={() => onOpenDiary(date)}
          />
        {(() => {
          const arch = parseDiaryArchiveBlock(diaries[date]?.markdown_content ?? '', date);
          const todoEvents = (eventsByDate[date] || []).filter((e) => !e.done);
          const todoSorted = [...todoEvents].sort((a, b) =>
            (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
          );
          if (arch.length === 0 && todoSorted.length === 0) {
            return (
              <div className="event-calendar__selected-empty">点击右侧 + 新建事项 · 这一天空空如也</div>
            );
          }
          return (
            <>
              {arch.length > 0 && (
                <section className="event-calendar__selected-section">
                  <h4 className="event-calendar__section-title">已完成</h4>
                  <ul className="event-calendar__selected-list">
                    {arch.map((item) => (
                      <ArchivedDetailRow key={`a-${item.kind}-${item.id}`} item={item} />
                    ))}
                  </ul>
                </section>
              )}
              {todoSorted.length > 0 && (
                <section className="event-calendar__selected-section">
                  <h4 className="event-calendar__section-title">待办</h4>
                  <ul className="event-calendar__selected-list">
                    {todoSorted.map((e) => (
                      <li
                        key={e.id}
                        className={`cal-event-row cal-event-row--p${e.priority}`}
                        onClick={() => onSelectEvent(e)}
                      >
                        <span className="cal-event-row__time">{e.start_time ?? '—'}</span>
                        <span className="cal-event-row__title">{e.title}</span>
                        {e.note && <span className="cal-event-row__note">{e.note}</span>}
                        <span className={`cal-event-row__chip cal-event-row__chip--p${e.priority}`}>
                          P{e.priority}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          );
        })()}
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

/**
 * 过去日单元格里的"已完成"事项预览：
 * - 用更柔的颜色（淡灰）传递"已完成"语义
 * - 与时间任务区分：归档项首列不打时间戳（归档行的元数据已写在 meta 注释里）
 */
/**
 * 待办滚动列表：右侧常驻"泳池"风格滚动条。
 * - track 是黑色边框包裹的细长凹槽；thumb 是灰色填充块（带阴影模拟凹陷）。
 * - thumb 高度/位置随 ul 滚动比例实时变化；可拖拽滚动；滚轮走 ul。
 */
function TodoScrollList({ children }: PropsWithChildren) {
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  // 根据滚动比例刷新 thumb 位置/高度
  const syncThumb = useCallback(() => {
    const list = listRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!list || !thumb || !track) return;
    const trackHeight = track.clientHeight;
    if (trackHeight <= 0) return;
    const visible = list.clientHeight;
    const total = list.scrollHeight;
    if (total <= visible) {
      thumb.style.display = 'none';
      return;
    }
    thumb.style.display = 'block';
    const ratio = visible / total;
    const minH = 18;
    const h = Math.max(minH, Math.floor(trackHeight * ratio));
    const maxTop = trackHeight - h;
    const top = Math.floor(maxTop * (list.scrollTop / (total - visible)));
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  // 内容尺寸变化时（事件增删）同步
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    syncThumb();
    const ro = new ResizeObserver(() => syncThumb());
    ro.observe(list);
    list.addEventListener('scroll', syncThumb, { passive: true });
    return () => {
      ro.disconnect();
      list.removeEventListener('scroll', syncThumb);
    };
  }, [syncThumb]);

  // 滚轮在容器内时，强制 vertical 滚动（避免横向误触）
  useEffect(() => {
    const el = wrapRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      list.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // thumb 拖拽
  useEffect(() => {
    const thumb = thumbRef.current;
    const track = trackRef.current;
    const list = listRef.current;
    if (!thumb || !track || !list) return;
    let dragging = false;
    let startY = 0;
    let startTop = 0;
    let pointerId = 0;

    const onPointerDown = (ev: PointerEvent) => {
      const t = thumbRef.current;
      const tr = trackRef.current;
      const l = listRef.current;
      if (!t || !tr || !l) return;
      if (l.scrollHeight <= l.clientHeight) return;
      dragging = true;
      pointerId = ev.pointerId;
      try { t.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      startY = ev.clientY;
      const m = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(t.style.transform);
      startTop = m ? parseFloat(m[1]) : 0;
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging) return;
      const tr = trackRef.current;
      const l = listRef.current;
      const t = thumbRef.current;
      if (!tr || !l || !t) return;
      const trackH = tr.clientHeight;
      const th = t.offsetHeight;
      const maxTop = trackH - th;
      const nextTop = Math.min(Math.max(0, startTop + (ev.clientY - startY)), maxTop);
      const ratio = nextTop / maxTop;
      const total = l.scrollHeight;
      const visible = l.clientHeight;
      l.scrollTop = ratio * (total - visible);
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try { thumb.releasePointerCapture(pointerId); } catch { /* ignore */ }
      ev.stopPropagation();
    };

    // 点击轨道空白处跳转到该位置
    const onTrackPointerDown = (ev: PointerEvent) => {
      if (ev.target === thumbRef.current) return;
      const tr = trackRef.current;
      const l = listRef.current;
      const t = thumbRef.current;
      if (!tr || !l || !t) return;
      if (l.scrollHeight <= l.clientHeight) return;
      const rect = tr.getBoundingClientRect();
      const y = ev.clientY - rect.top - t.offsetHeight / 2;
      const trackH = tr.clientHeight;
      const th = t.offsetHeight;
      const maxTop = trackH - th;
      const ratio = Math.min(Math.max(0, y), maxTop) / maxTop;
      const total = l.scrollHeight;
      const visible = l.clientHeight;
      l.scrollTop = ratio * (total - visible);
      // 之后继续拖拽
      dragging = true;
      pointerId = ev.pointerId;
      startY = ev.clientY;
      const m = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(t.style.transform);
      startTop = m ? parseFloat(m[1]) : 0;
      try { tr.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      ev.preventDefault();
      ev.stopPropagation();
    };

    thumb.addEventListener('pointerdown', onPointerDown);
    thumb.addEventListener('pointermove', onPointerMove);
    thumb.addEventListener('pointerup', onPointerUp);
    thumb.addEventListener('pointercancel', onPointerUp);
    track.addEventListener('pointerdown', onTrackPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);

    return () => {
      thumb.removeEventListener('pointerdown', onPointerDown);
      thumb.removeEventListener('pointermove', onPointerMove);
      thumb.removeEventListener('pointerup', onPointerUp);
      thumb.removeEventListener('pointercancel', onPointerUp);
      track.removeEventListener('pointerdown', onTrackPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="cal-cell__todos-scroll" ref={wrapRef}>
      <ul className="cal-cell__events cal-cell__events--todos" ref={listRef}>
        {children}
      </ul>
      {/* 右侧"泳池"风格常驻滚动指示条 */}
      <div className="cal-cell__pool" aria-hidden>
        <div className="cal-cell__pool-track" ref={trackRef}>
          <div className="cal-cell__pool-thumb" ref={thumbRef} />
        </div>
      </div>
    </div>
  );
}

function ArchivedRow({ item }: { item: ArchivedItem }) {
  const isEvent = item.kind === 'event';
  const time = isEvent && item.startTime
    ? item.endTime
      ? `${item.startTime}–${item.endTime}`
      : `起 ${item.startTime}`
    : '';
  return (
    <li
      className={`cal-cell__event cal-cell__event--archived cal-cell__event--p${item.priority}`}
      title={time ? `${time} · ${item.title}` : item.title}
    >
      <span className="cal-cell__event-icon" aria-hidden>✓</span>
      <span className="cal-cell__event-title">{item.title}</span>
    </li>
  );
}

/**
 * 过去日选中详情里的"已完成"事项：保持与时间任务一致的卡片样式，
 * 时间列显示归档时记录的 HH:MM–HH:MM；不可编辑（已锁）。
 */
function ArchivedDetailRow({ item }: { item: ArchivedItem }) {
  const isEvent = item.kind === 'event';
  const time = isEvent && item.startTime
    ? item.endTime
      ? `${item.startTime}–${item.endTime}`
      : `起 ${item.startTime}`
    : '—';
  return (
    <li className={`cal-event-row cal-event-row--archived cal-event-row--p${item.priority}`}>
      <span className="cal-event-row__time">{time}</span>
      <span className="cal-event-row__title">{item.title}</span>
      <span className="cal-event-row__note">{isEvent ? '事件' : '待办'} · 已归档</span>
      <span className={`cal-event-row__chip cal-event-row__chip--p${item.priority}`}>
        P{item.priority}
      </span>
    </li>
  );
}
