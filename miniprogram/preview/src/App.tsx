import { useCallback, useEffect, useState } from 'react';
import DateHeader from './components/DateHeader';
import ViewTabs, { type ViewMode } from './components/ViewTabs';
import Timeline from './components/Timeline';
import TodoBoard from './components/TodoBoard';
import EventCalendar from './components/EventCalendar';
import EventModal from './components/EventModal';
import DiaryModal from './components/DiaryModal';
import SettingsModal from './components/SettingsModal';
import BatchExportDialog from './components/BatchExportDialog';
import AcceptedToast from './components/AcceptedToast';
import Login from './pages/Login';
import {
  eventsApi, todosApi, diariesApi, themesApi, musicApi,
} from './lib/domain';
import type { Event, EventDraft, Todo, Diary, MusicTrack } from './lib/types';
import {
  toDateString, firstOfMonth, lastOfMonth,
} from './lib/date';
import { getToken } from './lib/api';

interface ToastState {
  key: number;
  title: string;
  detail?: string;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return <HomeShell onLogout={() => setAuthed(false)} />;
}

function HomeShell({ onLogout }: { onLogout: () => void }) {
  const [date, setDate] = useState(toDateString(new Date()));
  const [view, setView] = useState<ViewMode>('timeline');

  const [events, setEvents] = useState<Event[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [themeCache, setThemeCache] = useState<Record<string, string>>({});
  const [diaryCache, setDiaryCache] = useState<Record<string, Diary>>({});
  const [musicLibrary, setMusicLibrary] = useState<MusicTrack[]>([]);

  // eventsByDate 给 EventCalendar 用
  const [eventsByDate, setEventsByDate] = useState<Record<string, Event[]>>({});

  const [error, setError] = useState<string | null>(null);

  // modals
  const [eventModal, setEventModal] = useState<
    { kind: 'closed' } | { kind: 'create'; startMinutes?: number } | { kind: 'edit'; event: Event }
  >({ kind: 'closed' });
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (title: string, detail?: string) =>
    setToast({ key: Date.now(), title, detail });

  const theme = themeCache[date] ?? '';

  // ---- 数据加载 ----
  const loadDay = useCallback(async (d: string) => {
    try {
      const list = await eventsApi.listByDate(d);
      setEvents(list);
      setEventsByDate((prev) => ({ ...prev, [d]: list }));
    } catch (e: any) { setError(e?.message || '加载失败'); }
  }, []);

  const loadMonth = useCallback(async (anchor: string) => {
    try {
      const from = firstOfMonth(anchor);
      const to = lastOfMonth(anchor);
      const [list, diaryList] = await Promise.all([
        eventsApi.listRange(from, to),
        diariesApi.listRange(from, to).catch(() => []),
      ]);
      const map: Record<string, Event[]> = {};
      list.forEach((e) => { (map[e.date] ||= []).push(e); });
      setEventsByDate(map);
      const dm: Record<string, Diary> = {};
      diaryList.forEach((d) => { dm[d.date] = d; });
      setDiaryCache((prev) => ({ ...prev, ...dm }));
    } catch (e: any) { setError(e?.message || '加载失败'); }
  }, []);

  const loadTodos = useCallback(async () => {
    try { setTodos(await todosApi.list()); }
    catch (e: any) { setError(e?.message || '加载待办失败'); }
  }, []);

  const loadThemesFor = useCallback(async (dates: string[]) => {
    if (dates.length === 0) return;
    try {
      const list = await themesApi.listByDates(dates);
      setThemeCache((prev) => {
        const next = { ...prev };
        for (const d of dates) {
          next[d] = list.find((it) => it.date === d)?.title ?? '';
        }
        return next;
      });
    } catch (e: any) { /* silent */ }
  }, []);

  const loadMusic = useCallback(async () => {
    try { setMusicLibrary(await musicApi.list()); }
    catch (e: any) { /* silent */ }
  }, []);

  // ---- 视图变化时按需加载 ----
  useEffect(() => {
    if (view === 'timeline') {
      loadDay(date);
      loadThemesFor([date]);
    } else if (view === 'calendar') {
      loadMonth(date);
      const m = firstOfMonth(date);
      // 加载当月 + 上下各一周主题
      loadThemesFor([m, lastOfMonth(date)]);
    } else {
      loadTodos();
    }
  }, [date, view, loadDay, loadMonth, loadTodos, loadThemesFor]);

  // 初始音乐库
  useEffect(() => { loadMusic(); }, [loadMusic]);

  // ---- 主题编辑 ----
  const setThemeForDate = useCallback(async (d: string, title: string) => {
    const prev = themeCache[d] ?? '';
    setThemeCache((c) => {
      const out = { ...c };
      if (title) out[d] = title;
      else delete out[d];
      return out;
    });
    try {
      if (title) await themesApi.upsert(d, title);
      else await themesApi.remove(d);
    } catch (e: any) {
      setThemeCache((c) => { const out = { ...c }; if (prev) out[d] = prev; else delete out[d]; return out; });
      setError(e?.payload?.error || e?.message || '主题保存失败');
    }
  }, [themeCache]);

  // ---- 事件操作 ----
  const handleCreate = async (draft: EventDraft) => {
    const created = await eventsApi.create(draft);
    setEvents((prev) => {
      const next = [...prev, created];
      return next.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    });
    setEventsByDate((prev) => {
      const next = { ...prev };
      (next[created.date] ||= []).push(created);
      return next;
    });
  };
  const handleUpdate = async (draft: EventDraft) => {
    if (eventModal.kind !== 'edit') return;
    const updated = await eventsApi.update(eventModal.event.id, draft);
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEventsByDate((prev) => {
      const next = { ...prev };
      (next[updated.date] ||= []).filter((e) => e.id !== updated.id);
      next[updated.date].push(updated);
      return next;
    });
  };
  const handleDelete = async (id: number) => {
    await eventsApi.remove(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setEventsByDate((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].filter((e) => e.id !== id);
      return next;
    });
  };
  const handleToggleDone = async (target: Event, done: boolean) => {
    if (done && !target.done) {
      showToast(target.title, target.start_time ? `${target.start_time}–${target.end_time}` : '待办');
    }
    // 乐观更新
    setEvents((prev) => prev.map((e) => (e.id === target.id ? { ...e, done: done ? 1 : 0 } : e)));
    setEventsByDate((prev) => {
      const next = { ...prev };
      const list = next[target.date];
      if (list) next[target.date] = list.map((e) => (e.id === target.id ? { ...e, done: done ? 1 : 0 } : e));
      return next;
    });
    try { await eventsApi.toggleDone(target.id, done); }
    catch (e: any) { setError(e?.message || '保存失败'); }
  };

  // ---- 日记保存回调 ----
  const handleDiaryChange = (next: Diary | null) => {
    if (!next) {
      setDiaryCache((prev) => { const out = { ...prev }; delete out[next as any]; return out; });
      return;
    }
    setDiaryCache((prev) => ({ ...prev, [next.date]: next }));
  };

  const onLogoutClick = () => {
    if (window.confirm('退出登录？')) {
      localStorage.removeItem('yd-token');
      onLogout();
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__logo">Y</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>YourDay</div>
        <div className="topbar__user">
          <button className="topbar__btn" onClick={onLogoutClick}>退出</button>
        </div>
      </header>

      <DateHeader
        date={date}
        onChange={setDate}
        theme={theme}
        onThemeChange={(t) => setThemeForDate(date, t)}
        onOpenDiary={() => setDiaryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenExport={() => setExportOpen(true)}
      />

      <ViewTabs view={view} onChangeView={setView} />

      <div className="main">
        {error && <div className="page__error">{error}</div>}

        {view === 'timeline' && (
          <>
            <Timeline
              events={events.filter((e) => !e.is_todo)}
              date={date}
              onSelectEvent={(e) => setEventModal({ kind: 'edit', event: e })}
              onAddAt={(m) => setEventModal({ kind: 'create', startMinutes: m })}
              onToggleDone={handleToggleDone}
            />

            {/* 当天"具体时间的待办"（is_todo=0 但加在某个时段）— 前端 TodoList 同源 */}
            <TodoDayList
              events={events}
              date={date}
              onToggleDone={handleToggleDone}
              onSelect={(e) => setEventModal({ kind: 'edit', event: e })}
              onCreateTodo={() => setEventModal({ kind: 'create' })}
            />
          </>
        )}

        {view === 'todos' && (
          <TodoBoard todos={todos} onChange={setTodos} onError={setError} />
        )}

        {view === 'calendar' && (
          <EventCalendar
            date={date}
            onSelectDate={(d) => { setDate(d); setView('timeline'); }}
            eventsByDate={eventsByDate}
            themeCache={themeCache}
            diaryCache={diaryCache}
          />
        )}
      </div>

      <EventModal
        open={eventModal.kind !== 'closed'}
        date={date}
        initial={eventModal.kind === 'edit' ? eventModal.event : undefined}
        defaultStartMinutes={eventModal.kind === 'create' ? eventModal.startMinutes : undefined}
        onClose={() => setEventModal({ kind: 'closed' })}
        onSubmit={eventModal.kind === 'edit' ? handleUpdate : handleCreate}
        onDelete={handleDelete}
      />

      <DiaryModal
        open={diaryOpen}
        date={date}
        theme={theme}
        onThemeChange={(t) => setThemeForDate(date, t)}
        onClose={() => setDiaryOpen(false)}
        onChange={handleDiaryChange}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        library={musicLibrary}
        onChange={setMusicLibrary}
      />

      <BatchExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        themeCache={themeCache}
      />

      <AcceptedToast
        visible={toast !== null}
        title={toast?.title ?? ''}
        detail={toast?.detail}
        key={toast?.key ?? 0}
        onDone={() => setToast(null)}
      />
    </>
  );
}

function TodoDayList({
  events, date, onToggleDone, onSelect, onCreateTodo,
}: {
  events: Event[];
  date: string;
  onToggleDone: (e: Event, done: boolean) => void;
  onSelect: (e: Event) => void;
  onCreateTodo: () => void;
}) {
  const todos = events.filter((e) => e.is_todo);
  if (todos.length === 0) return null;
  return (
    <div className="todo-day">
      <div className="todo-day__title">
        📝 当日待办（{todos.length}）
        <button className="todo-day__add" onClick={onCreateTodo}>+ 新建</button>
      </div>
      {todos.map((e) => (
        <div
          key={e.id}
          className={`todo-day__item ${e.done ? 'done' : ''}`}
          onDoubleClick={() => onSelect(e)}
        >
          <span
            className="todo-day__check"
            onClick={(ev) => { ev.stopPropagation(); onToggleDone(e, !e.done); }}
          >
            {e.done ? '✓' : ''}
          </span>
          <span className="todo-day__label">{e.title}</span>
          {e.note && <span style={{ fontSize: 11, color: '#94a3b8' }}>{e.note.slice(0, 30)}</span>}
          <span className="todo-day__time">P{e.priority}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
        双击条目可编辑 · 单击 ✓ 切换完成 · {date}
      </div>
    </div>
  );
}