import './App.css';
import './styles/minecraft-theme.css';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LegalPage } from './pages/LegalPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import './pages/LegalPage.css';
import { DateHeader } from './components/DateHeader';
import { EventCalendar } from './components/EventCalendar';
import { EventList } from './components/EventList';
import { EventModal } from './components/EventModal';
import { DiaryModal } from './components/DiaryModal';
import { BatchExportDialog } from './components/BatchExportDialog';
import { Legend } from './components/Legend';
import { TaskDecomposerModal } from './components/TaskDecomposerModal';
import { Timeline } from './components/Timeline';
import { TodoBoard } from './components/TodoBoard';
import { TodoList } from './components/TodoList';
import { ViewTabs, type ViewMode } from './components/ViewTabs';
import { Logo } from './components/Logo';
import { AcceptedToast } from './components/AcceptedToast';
import { SettingsModal } from './components/SettingsModal';
import { LyricsPanel } from './components/LyricsPanel';
import { eventsApi } from './api/events';
import { themesApi } from './api/themes';
import { diariesApi, type Diary } from './api/diaries';
import { musicApi, parseLRC, type MusicTrack } from './api/music';
import type { Event, EventDraft, Priority } from './types';
import { firstOfMonth, lastOfMonth, minutesToTime, monthGridDays, shiftDay, toDateString } from './utils/date';
import { useAuth } from './auth/AuthContext';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create'; startMinutes?: number; prefill?: { title: string; priority: Priority; note: string } }
  | { kind: 'edit'; event: Event };

const LIST_WINDOW_DAYS = 7;

export function HomeShell() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState<string>(toDateString(new Date()));
  const [view, setView] = useState<ViewMode>('timeline');

  /** 当前皮肤：'default' | 'minecraft'，持久化到 localStorage */
  const [themeMode, setThemeMode] = useState<'default' | 'minecraft'>(() => {
    return (localStorage.getItem('yd-theme') as 'default' | 'minecraft') ?? 'default';
  });

  /** 同步皮肤到 <body> class，供 CSS 选择器使用 */
  useEffect(() => {
    document.body.className = themeMode === 'minecraft' ? 'mc-theme--system mc-body' : '';
    localStorage.setItem('yd-theme', themeMode);
  }, [themeMode]);
  // 当日主题缓存：date -> title，与日历界面联动（共享同一份数据）
  // 切换到不同视图时按需填充对应范围，避免不必要的请求
  const [themeCache, setThemeCache] = useState<Record<string, string>>({});
  /** 当前选中 date 对应的主题（timeline 用）；单独 state 方便接口直接传入 DateHeader */
  const theme = themeCache[date] ?? '';

  // 时间轴视图：当前选中日的事件
  const [events, setEvents] = useState<Event[]>([]);
  // 清单视图：日期区间内的事件，按日期分组
  const [eventsByDate, setEventsByDate] = useState<Record<string, Event[]>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [decomposerOpen, setDecomposerOpen] = useState(false);
  /** 'time' = 默认时间型拆解；'quantity' = 默认数量型（无时间）拆解 */
  const [decomposerMode, setDecomposerMode] = useState<'time' | 'quantity'>('time');
  // 日记弹窗：null=关闭；string=打开并预填该日期
  const [diaryModalDate, setDiaryModalDate] = useState<string | null>(null);
  // 批量导出弹窗
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  // 日记缓存：日历内 DiaryEntry 提示条用
  const [diaryCache, setDiaryCache] = useState<Record<string, Diary>>({});
  // 完成提示弹窗
  const [acceptToast, setAcceptToast] = useState<{ key: number; title: string; detail?: string } | null>(null);
  const showAcceptToast = (title: string, detail?: string) =>
    setAcceptToast({ key: Date.now(), title, detail });

  // 设置弹窗（音乐库等）
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicLibrary, setMusicLibrary] = useState<MusicTrack[]>([]);
  const [playProgress, setPlayProgress] = useState({ progress: 0, currentTime: 0, duration: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<{ seekTo: (ratio: number) => void; togglePlay: () => void }>(null);

  // 歌词抽屉状态
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [lyrics, setLyrics] = useState<ReturnType<typeof parseLRC>>([]);
  const [lyricsCurrentTime, setLyricsCurrentTime] = useState(0);
  const [lyricsTrackTitle, setLyricsTrackTitle] = useState('');
  const [lyricsCoverUrl, setLyricsCoverUrl] = useState<string | null>(null);

  // 底部进度条拖动

  // 启动时拉一次音乐库，让唱片播放器一进入就有用户曲目（如果库为空就 fallback 到默认合成曲）
  useEffect(() => {
    musicApi
      .list()
      .then(setMusicLibrary)
      .catch((err) => {
        console.warn('加载音乐库失败', err);
      });
  }, []);

  /** 暴露给 SettingsModal 的回调：让上传/重命名/删除能立即刷新唱片播放器 */
  const handleLibraryChange = useCallback((next: MusicTrack[]) => {
    setMusicLibrary(next);
  }, []);

  /** 歌词相关回调（由 DateHeader → RecordPlayer 链触发） */
  const handleLyricsTimeUpdate = useCallback((t: number) => {
    setLyricsCurrentTime(t);
  }, []);

  const handleLyricsTrackChange = useCallback((track: { id: string; title: string; flavor: string; lyricsRaw: string | null }) => {
    setLyricsTrackTitle(track.title);
    if (track.lyricsRaw) {
      setLyrics(parseLRC(track.lyricsRaw));
    } else {
      setLyrics([]);
    }
  }, []);

  const loadDay = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await eventsApi.listByDate(d);
      setEvents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRange = useCallback(async (centerDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const from = shiftDay(centerDate, -LIST_WINDOW_DAYS);
      const to = shiftDay(centerDate, LIST_WINDOW_DAYS);
      const list = await eventsApi.listRange(from, to);
      const grouped: Record<string, Event[]> = {};
      list.forEach((e) => {
        (grouped[e.date] ||= []).push(e);
      });
      setEventsByDate(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMonth = useCallback(async (centerDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const from = firstOfMonth(centerDate);
      const to = lastOfMonth(centerDate);
      const [list, diaryList] = await Promise.all([
        eventsApi.listRange(from, to),
        diariesApi.listRange(from, to).catch(() => []),
      ]);
      const grouped: Record<string, Event[]> = {};
      list.forEach((e) => {
        (grouped[e.date] ||= []).push(e);
      });
      setEventsByDate(grouped);
      const diaryMap: Record<string, Diary> = {};
      diaryList.forEach((d) => {
        diaryMap[d.date] = d;
      });
      setDiaryCache(diaryMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 按日期列表批量拉取"今日主题"，结果写入 themeCache。
   * 时间轴视图只取 1 天；日历视图取当月网格的 42 天，确保日历单元格上的"主题 chip"是最新数据。
   */
  const loadThemes = useCallback(async (dates: string[]) => {
    if (dates.length === 0) return;
    try {
      const list = await themesApi.listByDates(dates);
      setThemeCache((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const d of dates) {
          const incoming = list.find((it) => it.date === d)?.title ?? '';
          if (next[d] !== incoming) {
            next[d] = incoming;
            changed = true;
          }
        }
        // 对于列表里没出现在 dates 中的 key（被 upsert/DELETE 后的 key），保留原值不强制清空
        return changed ? next : prev;
      });
    } catch (err) {
      // 静默失败：主题不影响主线流程
      console.warn('加载主题失败', err);
    }
  }, []);

  /**
   * 更新某个日期的主题（时间轴上的"今日主题"编辑器、DiariesModal 的标题调整都可以调用）。
   * - 立即同步到缓存（便于日历视图立刻反映）
   * - 异步请求后端；失败回滚
   */
  const setThemeForDate = useCallback(async (targetDate: string, next: string) => {
    const prev = themeCache[targetDate] ?? '';
    if (prev === next) return;
    setThemeCache((cache) => {
      const out = { ...cache };
      if (next) out[targetDate] = next;
      else delete out[targetDate];
      return out;
    });
    try {
      if (next) await themesApi.upsert(targetDate, next);
      else await themesApi.remove(targetDate);
    } catch (err) {
      setThemeCache((cache) => {
        const out = { ...cache };
        if (prev) out[targetDate] = prev;
        else delete out[targetDate];
        return out;
      });
      setError(err instanceof Error ? err.message : '保存主题失败');
    }
  }, [themeCache]);

  useEffect(() => {
    switch (view) {
      case 'timeline':
        loadDay(date);
        break;
      case 'list':
        loadRange(date);
        break;
      case 'calendar':
        loadMonth(date);
        break;
      case 'todos':
        // 不依赖 events，无需拉取
        break;
    }
  }, [date, view, loadDay, loadRange, loadMonth]);

  // 主题：根据当前视图按需拉取
  // - timeline：仅当前选中日（编辑器直接显示在 DateHeader 上）
  // - calendar：当月网格（含上下月补全的 42 天），让日历单元格"✦ 主题"联动
  // - list / todos：不依赖主题，避免无意义请求
  useEffect(() => {
    const run = async () => {
      if (view === 'timeline') {
        if (!themeCache.hasOwnProperty(date)) {
          await loadThemes([date]);
        }
      } else if (view === 'calendar') {
        const dates = monthGridDays(date);
        // 只在缺失时拉取，避免来回切换月份时重复打
        const missing = dates.filter((d) => !themeCache.hasOwnProperty(d));
        if (missing.length > 0) await loadThemes(missing);
      } else {
        // 不主动清空，让用户在 list 视图切到 calendar 时能立即看到已加载的主题
        setThemeCache((prev) => prev);
      }
    };
    run();
    // 故意不把 themeCache 放进依赖里，否则 setThemeCache 会触发死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, loadThemes]);

  /**
   * 总体待做拆解到时间轴：
   * - 打开 EventModal，并把 todo 的 title/priority/note 预填进去
   * - 当前选中日期作为目标日
   * - 默认时段：若当前时间在工作时段内取当前时间（向上取 15 分钟），否则 09:00
   */
  const handleDecomposeFromTodo = (prefill: { title: string; priority: Priority; note: string }) => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMin = minutes >= 9 * 60 && minutes < 22 * 60 ? minutes : 9 * 60;
    setModal({ kind: 'create', startMinutes: startMin, prefill });
  };

  const handleCreate = async (draft: EventDraft) => {
    const created = await eventsApi.create({ ...draft, done: false });
    setEvents((prev) => [...prev, created].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')));
    setEventsByDate((prev) => {
      const next = { ...prev };
      (next[created.date] ||= []).push(created);
      next[created.date].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
      return next;
    });
  };

  const handleUpdate = async (draft: EventDraft) => {
    if (modal.kind !== 'edit') return;
    const updated = await eventsApi.update(modal.event.id, draft);
    const oldDate = modal.event.date;
    const dateChanged = updated.date !== oldDate;

    setEvents((prev) => {
      const without = prev.filter((e) => e.id !== updated.id);
      return updated.date === date ? [...without, updated] : without;
    });

    setEventsByDate((prev) => {
      const next = { ...prev };
      (next[oldDate] ||= []).filter((e) => e.id !== updated.id);
      if (dateChanged || updated.date === date) {
        (next[updated.date] ||= []).push(updated);
        next[updated.date].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
      }
      return next;
    });

    // 如果拖到了当前视图窗口内的另一天，重拉一次保证数据完整
    if (dateChanged) {
      switch (view) {
        case 'list': {
          const from = shiftDay(date, -LIST_WINDOW_DAYS);
          const to = shiftDay(date, LIST_WINDOW_DAYS);
          if (updated.date >= from && updated.date <= to) loadRange(date);
          break;
        }
        case 'calendar': {
          const mFrom = firstOfMonth(date);
          const mTo = lastOfMonth(date);
          if (updated.date >= mFrom && updated.date <= mTo) loadMonth(date);
          break;
        }
      }
    }
  };

  const handleDelete = async (id: number) => {
    let removedDate: string | null = null;
    setEvents((prev) => {
      const found = prev.find((e) => e.id === id);
      removedDate = found?.date ?? null;
      return prev.filter((e) => e.id !== id);
    });
    setEventsByDate((prev) => {
      if (!removedDate) return prev;
      const next = { ...prev };
      next[removedDate] = (next[removedDate] || []).filter((e) => e.id !== id);
      return next;
    });
    await eventsApi.remove(id);
  };

  // 乐观更新 done：先改本地状态，再请求后端
  const handleToggleDone = async (target: Event, done: boolean) => {
    if (done && !target.done) {
      const timeHint = target.isTodo ? '' : `${target.start_time ?? ''} – ${target.end_time ?? ''}`;
      showAcceptToast(target.title, timeHint);
    }
    setEvents((prev) => prev.map((e) => (e.id === target.id ? { ...e, done } : e)));
    setEventsByDate((prev) => {
      const next = { ...prev };
      const list = next[target.date];
      if (list) {
        next[target.date] = list.map((e) => (e.id === target.id ? { ...e, done } : e));
      }
      return next;
    });
    try {
      await eventsApi.toggleDone(target.id, done);
    } catch (err) {
      // 失败回滚
      setEvents((prev) => prev.map((e) => (e.id === target.id ? { ...e, done: !done } : e)));
      setEventsByDate((prev) => {
        const next = { ...prev };
        const list = next[target.date];
        if (list) {
          next[target.date] = list.map((e) => (e.id === target.id ? { ...e, done: !done } : e));
        }
        return next;
      });
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 拖动 / 拉伸时间轴事件块：乐观更新本地时间，再 PUT 后端
  const handleUpdateEventTime = async (
    target: Event,
    next: { startMinutes: number; endMinutes: number },
  ) => {
    const newStart = minutesToTime(next.startMinutes);
    const newEnd = minutesToTime(next.endMinutes);
    if (newStart === target.start_time && newEnd === target.end_time) return;

    const patchEvent = (e: Event) =>
      e.id === target.id ? { ...e, start_time: newStart, end_time: newEnd } : e;

    setEvents((prev) => prev.map(patchEvent));
    setEventsByDate((prev) => {
      const map = { ...prev };
      const list = map[target.date];
      if (list) map[target.date] = list.map(patchEvent);
      return map;
    });
    try {
      await eventsApi.update(target.id, {
        ...target,
        start_time: newStart,
        end_time: newEnd,
      });
    } catch (err) {
      // 失败回滚
      const revert = (e: Event) =>
        e.id === target.id ? { ...e, start_time: target.start_time, end_time: target.end_time } : e;
      setEvents((prev) => prev.map(revert));
      setEventsByDate((prev) => {
        const map = { ...prev };
        const list = map[target.date];
        if (list) map[target.date] = list.map(revert);
        return map;
      });
      setError(err instanceof Error ? err.message : '时间保存失败');
    }
  };

  const handleDecomposerCreated = useCallback(
    (_count: number) => {
      switch (view) {
        case 'timeline':
          loadDay(date);
          break;
        case 'list':
          loadRange(date);
          break;
        case 'calendar':
          loadMonth(date);
          break;
        case 'todos':
          // 不依赖 events，无需拉取
          break;
      }
    },
    [view, date, loadDay, loadRange, loadMonth]
  );

  return (
    <div className="app">
      <header className="app__topbar">
        <Logo />
        <div className="app__topbar-tabs">
          <ViewTabs view={view} onChangeView={setView} />
        </div>
        <div className="app__topbar-actions">
          {user && (
            <div className="app__user-chip" title={`已登录为 ${user.username}`}>
              <span className="app__user-chip-name">{user.username}</span>
              <button
                type="button"
                className="app__user-chip-logout"
                onClick={logout}
                aria-label="退出登录"
              >
                退出
              </button>
            </div>
          )}
          <button
            type="button"
            className="app__settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            title="设置（音乐库）"
          >
            <svg viewBox="0 0 24 24" aria-hidden focusable="false">
              <path
                fill="currentColor"
                d="M19.14 12.94a7.74 7.74 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.5 7.5 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.4-.96a.5.5 0 0 0-.6.22L2.66 8.49a.5.5 0 0 0 .12.61l2.03 1.58c-.07.31-.1.63-.1.94s.03.63.1.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.14.24.44.33.69.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.04.25.25.43.5.43h3.84c.25 0 .46-.18.5-.43l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.4.96c.25.11.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
        </div>
      </header>

      <DateHeader
        ref={playerRef}
        date={date}
        onChange={setDate}
        onAdd={() => setModal({ kind: 'create' })}
        onOpenDecomposer={() => {
          setDecomposerMode('time');
          setDecomposerOpen(true);
        }}
        onOpenQuantityDecomposer={() => {
          setDecomposerMode('quantity');
          setDecomposerOpen(true);
        }}
        onOpenDiary={() => setDiaryModalDate(date)}
        theme={theme}
        onThemeChange={(targetDate, title) => setThemeForDate(targetDate, title)}
        musicLibrary={musicLibrary}
        onTimeUpdate={handleLyricsTimeUpdate}
        onTrackChange={handleLyricsTrackChange}
        onCoverChange={setLyricsCoverUrl}
        onToggleLyrics={() => setLyricsVisible((v) => !v)}
        onProgressUpdate={setPlayProgress}
      />

      {error && <div className="app-error">{error}</div>}

      <Legend />

      <div style={{ position: 'relative' }}>
        {loading && <div className="app-loading">加载中…</div>}
        {view === 'timeline' ? (
          <div className="timeline-page">
            <Timeline
              events={events.filter((e) => !e.isTodo)}
              onSelectEvent={(e) => setModal({ kind: 'edit', event: e })}
              onAddAt={(m) => setModal({ kind: 'create', startMinutes: m })}
              onToggleDone={handleToggleDone}
              onUpdateEventTime={handleUpdateEventTime}
            />
            <TodoList
              events={events}
              onToggleDone={handleToggleDone}
              onSelectEvent={(e) => setModal({ kind: 'edit', event: e })}
              onAdded={() => loadDay(date)}
              date={date}
            />
          </div>
        ) : (() => {
          switch (view) {
            case 'list':
              return (
                <EventList
                  date={date}
                  windowDays={LIST_WINDOW_DAYS}
                  eventsByDate={eventsByDate}
                  onSelectDate={setDate}
                  onSelectEvent={(e) => setModal({ kind: 'edit', event: e })}
                  onToggleDone={handleToggleDone}
                />
              );
            case 'calendar':
              return (
                <EventCalendar
                  date={date}
                  eventsByDate={eventsByDate}
                  diaries={diaryCache}
                  themeCache={themeCache}
                  onChangeTheme={setThemeForDate}
                  onOpenDiary={(d) => {
                    setDate(d);
                    setDiaryModalDate(d);
                  }}
                  onBatchExport={() => setBatchExportOpen(true)}
                  onSelectDate={setDate}
                  onSelectEvent={(e) => setModal({ kind: 'edit', event: e })}
                  onDiaryChange={(d) => {
                    if (!d) return;
                    setDiaryCache((prev) => ({ ...prev, [d.date]: d }));
                  }}
                />
              );
            case 'todos':
              return (
                <TodoBoard
                  onDecompose={handleDecomposeFromTodo}
                  onTodoDone={(t, nextDone) => {
                    // 只有"完成"动作（false → true）才弹提示
                    if (nextDone && !t.done) {
                      showAcceptToast(t.title, t.due_date ? `截止 ${t.due_date}` : '待办');
                    }
                  }}
                />
              );
          }
        })()}
      </div>

      <EventModal
        open={modal.kind !== 'closed'}
        date={date}
        initial={modal.kind === 'edit' ? modal.event : undefined}
        defaultStartMinutes={modal.kind === 'create' ? modal.startMinutes : undefined}
        prefill={modal.kind === 'create' ? modal.prefill : undefined}
        onClose={() => setModal({ kind: 'closed' })}
        onSubmit={modal.kind === 'edit' ? handleUpdate : handleCreate}
        onDelete={handleDelete}
      />

      <TaskDecomposerModal
        open={decomposerOpen}
        onClose={() => setDecomposerOpen(false)}
        onCreated={handleDecomposerCreated}
        defaultMode={decomposerMode}
      />

      <DiaryModal
        open={diaryModalDate !== null}
        date={diaryModalDate ?? date}
        diary={diaryModalDate ? diaryCache[diaryModalDate] : undefined}
        // 主题：与时间轴视图共享同一份数据，确保两边永远一致
        theme={themeCache[diaryModalDate ?? date] ?? ''}
        onThemeChange={(title) => setThemeForDate(diaryModalDate ?? date, title)}
        onClose={() => setDiaryModalDate(null)}
        onChange={(d) => {
          if (!d) return;
          setDiaryCache((prev) => ({ ...prev, [d.date]: d }));
        }}
      />

      <BatchExportDialog
        open={batchExportOpen}
        anchorDate={date}
        knownDiaries={diaryCache}
        themeCache={themeCache}
        onClose={() => setBatchExportOpen(false)}
      />

      <AcceptedToast
        visible={acceptToast !== null}
        title={acceptToast?.title ?? ''}
        detail={acceptToast?.detail}
        key={acceptToast?.key ?? 0}
        onDone={() => setAcceptToast(null)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        library={musicLibrary}
        onLibraryChange={handleLibraryChange}
      />

      {lyricsVisible && (
        <LyricsPanel
          lyrics={lyrics}
          currentTime={lyricsCurrentTime}
          trackTitle={lyricsTrackTitle || '当前曲目'}
          coverUrl={lyricsCoverUrl}
          onClose={() => setLyricsVisible(false)}
          playProgress={playProgress}
          onSeek={(ratio) => playerRef.current?.seekTo(ratio)}
          isPlaying={isPlaying}
          onTogglePlay={() => {
            playerRef.current?.togglePlay();
            setIsPlaying((p) => !p);
          }}
        />
      )}
    </div>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div style={{ padding: 32, color: '#6b7588', textAlign: 'center' }}>
        正在校验登录状态…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
