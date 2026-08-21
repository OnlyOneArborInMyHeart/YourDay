import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Priority, Todo, TodoDraft, TodoPatch, TodoNoteImage } from '../types';
import { todosApi, type TodoListQuery } from '../api/todos';
import { toDateString } from '../utils/date';
import { NoteEditor, stripNoteImages } from './NoteEditor';
import './NoteEditor.css';
import './TodoBoard.css';

interface Props {
  /**
   * 当用户在 todo 行点击「拆到今天」时回调：
   * 父组件把 todo 的 title/note/priority 预填到 EventModal。
   */
  onDecompose: (prefill: { title: string; priority: Priority; note: string }) => void;
  /** 切换 todo 完成态时回调（用于弹 Accepted 提示） */
  onTodoDone: (todo: Todo, nextDone: boolean) => void;
}

type FilterStatus = 'all' | 'pending' | 'done';
type SortMode = 'priority' | 'due' | 'created';

interface FilterState {
  status: FilterStatus;
  priority: Priority | 'all';
  q: string;
}

const PRIORITY_OPTIONS: Priority[] = [1, 2, 3];

const EMPTY_DRAFT = (): TodoDraft => ({
  title: '',
  priority: 2,
  note: '',
  due_date: null,
});

export function TodoBoard({ onDecompose, onTodoDone }: Props) {
  const today = toDateString(new Date());

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterState>({ status: 'pending', priority: 'all', q: '' });
  const [sort, setSort] = useState<SortMode>('priority');
  const [showDone, setShowDone] = useState(false);

  // 新建态
  const [composer, setComposer] = useState<TodoDraft>(EMPTY_DRAFT());
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 行内编辑态
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TodoPatch>({});

  // 待删确认
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 双击区域空白打开 composer
  const boardRef = useRef<HTMLElement>(null);
  const handleBoardDoubleClick = (e: React.MouseEvent) => {
    if (composerOpen) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('.todo-composer') ||
      target.closest('.todo-board__head') ||
      target.closest('.todo-row') ||
      target.closest('.todo-board__done')
    )
      return;
    setComposer(EMPTY_DRAFT());
    setComposerOpen(true);
  };

  // 构造 API 查询参数
  const query = useMemo<TodoListQuery>(() => {
    const q: TodoListQuery = {};
    if (filter.status !== 'all') q.done = filter.status === 'done';
    if (filter.priority !== 'all') q.priority = filter.priority;
    if (filter.q.trim()) q.q = filter.q.trim();
    return q;
  }, [filter]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await todosApi.list(query);
      setTodos(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    reload();
  }, [reload]);

  const sorted = useMemo(() => {
    const list = Array.isArray(todos) ? [...todos] : [];
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (sort === 'priority') {
        if (a.priority !== b.priority) return a.priority - b.priority;
      }
      if (sort === 'due') {
        // 没截止日的沉到最后
        const ad = a.due_date ?? '9999-99-99';
        const bd = b.due_date ?? '9999-99-99';
        if (ad !== bd) return ad.localeCompare(bd);
      }
      // 默认 / 兜底：最近创建在前
      return b.created_at.localeCompare(a.created_at);
    });
    return list;
  }, [todos, sort]);

  // 拆分为"顶级"与"按 parent_id 聚合的子代"。
  // 仅二级：parent_id 非空的视为子代；不会出现 3+ 层（后端校验保证）。
  const { topTodos, childrenByParent } = useMemo(() => {
    const tops: Todo[] = [];
    const map = new Map<number, Todo[]>();
    for (const t of sorted) {
      if (t.parent_id == null) {
        tops.push(t);
      } else {
        if (!map.has(t.parent_id)) map.set(t.parent_id, []);
        map.get(t.parent_id)!.push(t);
      }
    }
    return { topTodos: tops, childrenByParent: map };
  }, [sorted]);

  // "总数/已完成数"仅展示顶级 todo（子项归属在父项下，不重复计）。
  const pending = topTodos.filter((t) => !t.done);
  const done = topTodos.filter((t) => t.done);
  const remaining = pending.length;

  // 展开态：仅顶级 todo 可展开；子项始终跟随父项一起显示
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 子项内联添加态：每个父项一行 input；记录输入框内容与提交中标志
  const [subDraft, setSubDraft] = useState<Record<number, string>>({});
  const [subSubmitting, setSubSubmitting] = useState<Record<number, boolean>>({});

  // —— 操作 ——

  const handleCreate = async () => {
    if (!composer.title.trim()) return;
    setSubmitting(true);
    try {
      await todosApi.create({
        title: composer.title.trim(),
        priority: composer.priority,
        note: composer.note?.trim() ?? '',
        due_date: composer.due_date || null,
      });
      setComposer(EMPTY_DRAFT());
      setComposerOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (t: Todo, nextDone: boolean) => {
    // 先通知父组件（用于在 UI 层触发 Accepted 提示），再做乐观更新
    onTodoDone(t, nextDone);
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: nextDone } : x)));
    try {
      // 用后端真实返回替换本地记录，把 completed_at / updated_at 等一起捎回来
      const updated = await todosApi.toggle(t.id);
      setTodos((prev) => {
        // 同步更新子项本身
        const afterSub = prev.map((x) => (x.id === t.id ? updated : x));
        // 父项联动（与后端逻辑保持一致：所有兄弟都 done → 父项 done；否则不变）
        if (t.parent_id != null) {
          const parentId = t.parent_id;
          const sibs = afterSub.filter((x) => x.parent_id === parentId);
          const total = sibs.length;
          const doneCount = sibs.filter((x) => x.done).length;
          const parent = afterSub.find((x) => x.id === parentId);
          if (parent && total > 0) {
            const shouldDone = doneCount === total;
            if (shouldDone !== parent.done) {
              return afterSub.map((x) =>
                x.id === parentId
                  ? { ...x, done: shouldDone, completed_at: shouldDone ? new Date().toISOString() : null }
                  : x
              );
            }
          }
        }
        return afterSub;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态切换失败');
      await reload();
    }
  };

  /**
   * 在某条顶级 todo 下添加一个子待做。子项缺省继承父项的优先级。
   */
  const handleAddSub = async (parent: Todo) => {
    const title = (subDraft[parent.id] ?? '').trim();
    if (!title || subSubmitting[parent.id]) return;
    setSubSubmitting((m) => ({ ...m, [parent.id]: true }));
    try {
      await todosApi.create({
        title,
        priority: parent.priority,
        note: '',
        due_date: null,
        parent_id: parent.id,
      });
      setSubDraft((m) => ({ ...m, [parent.id]: '' }));
      // 展开态：保证新建后处于展开
      setExpandedIds((prev) => {
        if (prev.has(parent.id)) return prev;
        const next = new Set(prev);
        next.add(parent.id);
        return next;
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加子待做失败');
    } finally {
      setSubSubmitting((m) => ({ ...m, [parent.id]: false }));
    }
  };

  const handleDelete = async (id: number) => {
    setTodos((prev) => prev.filter((x) => x.id !== id));
    setConfirmDeleteId(null);
    try {
      await todosApi.remove(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      await reload();
    }
  };

  const startEdit = (t: Todo) => {
    setEditingId(t.id);
    setEditDraft({
      title: t.title,
      priority: t.priority,
      note: t.note,
      due_date: t.due_date,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async (id: number) => {
    if (!editDraft.title?.trim()) {
      setError('标题不能为空');
      return;
    }
    try {
      await todosApi.update(id, {
        title: editDraft.title.trim(),
        priority: editDraft.priority,
        note: editDraft.note ?? '',
        due_date: editDraft.due_date || null,
      });
      cancelEdit();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDecompose = (t: Todo) => {
    onDecompose({ title: t.title, priority: t.priority, note: t.note });
  };

  /**
   * 用户在编辑某条 todo 时点掉了某张已插入图片的 X。
   * - 本地：立刻从 editDraft.note 移除对应 token
   * - 远程：等用户点"保存"时由后端 PUT 路由自动清理孤儿图
   */
  const handleImageRemoved = (
    _t: Todo,
    imageId: number,
    draft: TodoPatch,
    setDraft: (next: TodoPatch) => void
  ) => {
    const note = draft.note ?? '';
    const nextNote = stripNoteImages(note, imageId);
    setDraft({ ...draft, note: nextNote });
  };

  return (
    <section
      className="todo-board"
      aria-label="总体待做"
      ref={boardRef}
      onDoubleClick={handleBoardDoubleClick}
    >
      <header className="todo-board__head">
        <div className="todo-board__title-row">
          <h2 className="todo-board__title">总体待做</h2>
          <span className="todo-board__count">
            {remaining} 待完成 · {done.length} 已完成
          </span>
        </div>

        <div className="todo-board__filters">
          <div className="filter-group">
            <button
              className={`filter-pill ${filter.status === 'pending' ? 'is-active' : ''}`}
              onClick={() => setFilter((f) => ({ ...f, status: 'pending' }))}
            >
              待完成
            </button>
            <button
              className={`filter-pill ${filter.status === 'done' ? 'is-active' : ''}`}
              onClick={() => setFilter((f) => ({ ...f, status: 'done' }))}
            >
              已完成
            </button>
            <button
              className={`filter-pill ${filter.status === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter((f) => ({ ...f, status: 'all' }))}
            >
              全部
            </button>
          </div>

          <div className="filter-group">
            <button
              className={`filter-pill ${filter.priority === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter((f) => ({ ...f, priority: 'all' }))}
            >
              全部优先级
            </button>
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                className={`filter-pill filter-pill--p${p} ${
                  filter.priority === p ? 'is-active' : ''
                }`}
                onClick={() => setFilter((f) => ({ ...f, priority: p }))}
              >
                P{p}
              </button>
            ))}
          </div>

          <input
            className="filter-search"
            placeholder="搜索标题或备注…"
            value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
          />

          <div className="filter-group">
            <span className="filter-label">排序</span>
            <button
              className={`filter-pill ${sort === 'priority' ? 'is-active' : ''}`}
              onClick={() => setSort('priority')}
            >
              优先级
            </button>
            <button
              className={`filter-pill ${sort === 'due' ? 'is-active' : ''}`}
              onClick={() => setSort('due')}
            >
              截止日
            </button>
            <button
              className={`filter-pill ${sort === 'created' ? 'is-active' : ''}`}
              onClick={() => setSort('created')}
            >
              最近添加
            </button>
          </div>
        </div>

        {error && <div className="todo-board__error">{error}</div>}
      </header>

      {/* 新建 composer */}
      <div className={`todo-composer ${composerOpen ? 'is-open' : ''}`}>
        {!composerOpen ? (
          <button className="todo-composer__trigger" onClick={() => setComposerOpen(true)}>
            <span className="todo-composer__plus">＋</span>
            <span>添加一个新的待办</span>
          </button>
        ) : (
          <div className="todo-composer__form">
            <input
              autoFocus
              className="field__input todo-composer__title"
              placeholder="想做什么？例如：看完《深入理解计算机系统》第 6 章"
              value={composer.title}
              maxLength={80}
              onChange={(e) => setComposer((c) => ({ ...c, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                } else if (e.key === 'Escape') {
                  setComposerOpen(false);
                  setComposer(EMPTY_DRAFT());
                }
              }}
            />
            <NoteEditor
              value={composer.note ?? ''}
              onChange={(v) => setComposer((c) => ({ ...c, note: v }))}
              noteImages={[]}
              onImageRemoved={() => undefined}
              placeholder="备注（可选）"
              maxLength={500}
            />
            <div className="todo-composer__actions">
              <button
                className="ghost-btn"
                onClick={() => {
                  setComposerOpen(false);
                  setComposer(EMPTY_DRAFT());
                }}
                disabled={submitting}
              >
                取消
              </button>
              <button
                className="primary-btn"
                onClick={handleCreate}
                disabled={submitting || !composer.title.trim()}
              >
                {submitting ? '添加中…' : '加入待办'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 列表 */}
      {loading && <div className="todo-board__loading">加载中…</div>}

      {!loading && pending.length === 0 && (
        <div className="todo-board__empty">
          <div className="todo-board__empty-icon">📭</div>
          <div>
            {filter.status === 'done'
              ? '还没有已完成的事项'
              : filter.status === 'all'
              ? '待办池空空如也 —— 加一件事吧'
              : '所有事项已完成 🎉'}
          </div>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <ul className="todo-board__list">
          {pending.map((parent) => (
            <TodoGroup
              key={parent.id}
              parent={parent}
              today={today}
              children={childrenByParent.get(parent.id) ?? []}
              expanded={expandedIds.has(parent.id)}
              onToggleExpanded={() => toggleExpanded(parent.id)}
              onAddSub={() => handleAddSub(parent)}
              subDraft={subDraft[parent.id] ?? ''}
              onSubDraftChange={(v) =>
                setSubDraft((m) => ({ ...m, [parent.id]: v }))
              }
              subSubmitting={!!subSubmitting[parent.id]}
              onToggle={(nextDone) => handleToggle(parent, nextDone)}
              onEdit={() => startEdit(parent)}
              onDelete={() => setConfirmDeleteId(parent.id)}
              onDecompose={() => handleDecompose(parent)}
              editingId={editingId}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              cancelEdit={cancelEdit}
              saveEdit={saveEdit}
              onSubToggle={(sub, nextDone) => handleToggle(sub, nextDone)}
              onSubEdit={(sub) => startEdit(sub)}
              onSubDelete={(subId) => setConfirmDeleteId(subId)}
              onSubImageRemoved={(sub, id) =>
                handleImageRemoved(sub, id, editDraft, setEditDraft)
              }
            />
          ))}
        </ul>
      )}

      {!loading && done.length > 0 && (
        <div className="todo-board__done">
          <button
            className="todo-board__done-toggle"
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={showDone}
          >
            <span className="todo-board__done-arrow">{showDone ? '▾' : '▸'}</span>
            已完成 {done.length} 项
          </button>
          {showDone && (
            <ul className="todo-board__list todo-board__list--done">
              {done.map((parent) => (
                <TodoGroup
                  key={parent.id}
                  parent={parent}
                  today={today}
                  children={childrenByParent.get(parent.id) ?? []}
                  expanded={expandedIds.has(parent.id)}
                  onToggleExpanded={() => toggleExpanded(parent.id)}
                  onAddSub={() => handleAddSub(parent)}
                  subDraft={subDraft[parent.id] ?? ''}
                  onSubDraftChange={(v) =>
                    setSubDraft((m) => ({ ...m, [parent.id]: v }))
                  }
                  subSubmitting={!!subSubmitting[parent.id]}
                  onToggle={(nextDone) => handleToggle(parent, nextDone)}
                  onEdit={() => startEdit(parent)}
                  onDelete={() => setConfirmDeleteId(parent.id)}
                  onDecompose={() => handleDecompose(parent)}
                  editingId={editingId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  cancelEdit={cancelEdit}
                  saveEdit={saveEdit}
                  onSubToggle={(sub, nextDone) => handleToggle(sub, nextDone)}
                  onSubEdit={(sub) => startEdit(sub)}
                  onSubDelete={(subId) => setConfirmDeleteId(subId)}
                  onSubImageRemoved={(sub, id) =>
                    handleImageRemoved(sub, id, editDraft, setEditDraft)
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 删除确认层 */}
      {confirmDeleteId !== null && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmDeleteId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">确认删除</h2>
            </div>
            <div className="modal__body">
              <p>确定删除这条待办吗？此操作不可撤销。</p>
              <div className="modal__footer">
                <div className="modal__footer-right">
                  <button className="ghost-btn" onClick={() => setConfirmDeleteId(null)}>
                    取消
                  </button>
                  <button className="danger-btn" onClick={() => handleDelete(confirmDeleteId)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function priorityLabel(p: Priority): string {
  return p === 1 ? 'P1 · 紧急' : p === 2 ? 'P2 · 重要' : 'P3 · 一般';
}

function formatDue(d: string | null, today: string): string {
  if (!d) return '';
  if (d === today) return '今天截止';
  if (d < today) return `已逾期 · ${d}`;
  return `${d} 截止`;
}

function isOverdue(d: string | null, today: string): boolean {
  return !!d && d < today;
}

function TodoRow({
  todo,
  today,
  onToggle,
  onEdit,
  onDelete,
  onDecompose,
  isSub,
  subToggle,
  subCount,
  subProgress,
}: {
  todo: Todo;
  today: string;
  onToggle: (nextDone: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecompose: () => void;
  /** 是父项下的子项：缩进样式、不显示"+子"按钮等。 */
  isSub?: boolean;
  /** 顶级 todo 的"展开/收起"按钮回调（仅父项使用）。undefined 表示隐藏该按钮。 */
  subToggle?: () => void;
  expanded?: boolean;
  /** 顶级 todo 当前的子项数（展示用）。 */
  subCount?: number;
  /** 顶级 todo 的子项完成进度（仅当 subCount > 0 时使用）。 */
  subProgress?: { done: number; total: number };
}) {
  const overdue = isOverdue(todo.due_date, today) && !todo.done;
  const showProgress =
    !isSub && typeof subCount === 'number' && subCount > 0 && subProgress;
  const progressPct = showProgress
    ? Math.round((subProgress!.done / subProgress!.total) * 100)
    : 0;
  const progressFull = showProgress && subProgress!.done === subProgress!.total;
  return (
    <li
      className={`todo-row todo-row--p${todo.priority} ${todo.done ? 'is-done' : ''} ${
        isSub ? 'todo-row--sub' : ''
      } ${showProgress ? 'has-sub-progress' : ''}`}
    >
      <button
        type="button"
        className={`todo-row__check ${todo.done ? 'is-checked' : ''}`}
        aria-pressed={todo.done}
        aria-label={todo.done ? '标记为未完成' : '标记为已完成'}
        onClick={() => onToggle(!todo.done)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
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

      <div className="todo-row__body">
        <div className="todo-row__title-line">
          <span className="todo-row__title">{todo.title}</span>
          <span className={`todo-row__prio todo-row__prio--p${todo.priority}`}>
            {priorityLabel(todo.priority)}
          </span>
          {!isSub && typeof subCount === 'number' && subCount > 0 && (
            <span
              className={`todo-row__sub-count ${progressFull ? 'is-done' : ''}`}
              title={
                progressFull
                  ? '所有子项已完成'
                  : `${subProgress?.done ?? 0} / ${subProgress?.total ?? subCount} 子项已完成`
              }
            >
              {progressFull
                ? `${subCount} / ${subCount} 子项`
                : `${subProgress?.done ?? 0} / ${subCount} 子项`}
            </span>
          )}
        </div>
        {showProgress && (
          <div
            className={`todo-row__progress ${progressFull ? 'is-full' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={subProgress!.total}
            aria-valuenow={subProgress!.done}
            aria-label={`子待做进度 ${subProgress!.done} / ${subProgress!.total}`}
          >
            <div
              className="todo-row__progress-bar"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {todo.note && (
          <div className="todo-row__note">
            {stripNoteImages(todo.note) || (
              <span className="todo-row__note-empty">（仅图片）</span>
            )}
            {todo.note_images && todo.note_images.length > 0 && (
              <div className="todo-row__note-images">
                {todo.note_images.map((img) => (
                  <a
                    key={img.id}
                    className="todo-row__note-image"
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    title={img.original_name || '点击查看大图'}
                  >
                    <img src={img.url} alt={img.original_name} loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="todo-row__meta">
          {todo.due_date && (
            <span className={`todo-row__due ${overdue ? 'is-overdue' : ''}`}>
              {formatDue(todo.due_date, today)}
            </span>
          )}
          <span className="todo-row__time">添加于 {todo.created_at.slice(0, 10)}</span>
          {todo.completed_at && (
            <span className="todo-row__completed" title={todo.completed_at}>
              ✓ 完成于 {todo.completed_at.slice(0, 10)}
            </span>
          )}
        </div>
      </div>

      <div className="todo-row__actions">
        {!isSub && subToggle && (
          <button
            className="icon-btn"
            onClick={subToggle}
            aria-label={typeof subCount === 'number' && subCount > 0 ? '展开子待做' : '展开'}
            title={
              (typeof subCount === 'number' && subCount > 0)
                ? '点击展开子待做'
                : '展开以添加子待做'
            }
          >
            ▸
          </button>
        )}
        {!isSub && (
          <button
            className="ghost-btn ghost-btn--sm"
            onClick={onDecompose}
            title="把这条待办拆解到今天的时间轴"
          >
            拆到今天 →
          </button>
        )}
        <button className="icon-btn" onClick={onEdit} aria-label="编辑" title="编辑">
          ✎
        </button>
        <button
          className="icon-btn icon-btn--danger"
          onClick={onDelete}
          aria-label="删除"
          title="删除"
        >
          🗑
        </button>
      </div>
    </li>
  );
}

/**
 * 一个父项及其下的子项 + 内联添加子项表单的统一渲染单元。
 * 用 Fragment 返回多个 <li>，不会插入额外的 DOM 包裹。
 */
function TodoGroup({
  parent,
  children: subTodos,
  expanded,
  onToggleExpanded,
  onAddSub,
  subDraft,
  onSubDraftChange,
  subSubmitting,
  today,
  editingId,
  editDraft,
  setEditDraft,
  cancelEdit,
  saveEdit,
  onToggle,
  onEdit,
  onDelete,
  onDecompose,
  onSubToggle,
  onSubEdit,
  onSubDelete,
  onSubImageRemoved,
}: {
  parent: Todo;
  children: Todo[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onAddSub: () => void | Promise<void>;
  subDraft: string;
  onSubDraftChange: (v: string) => void;
  subSubmitting: boolean;
  today: string;
  editingId: number | null;
  editDraft: TodoPatch;
  setEditDraft: (next: TodoPatch) => void;
  cancelEdit: () => void;
  saveEdit: (id: number) => Promise<void>;
  onToggle: (nextDone: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDecompose: () => void;
  onSubToggle: (sub: Todo, nextDone: boolean) => void;
  onSubEdit: (sub: Todo) => void;
  onSubDelete: (subId: number) => void;
  onSubImageRemoved: (sub: Todo, imageId: number) => void;
}) {
  const handleSubKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onAddSub();
    } else if (e.key === 'Escape') {
      onSubDraftChange('');
    }
  };

  return (
    <>
      {/* 父项：编辑态优先渲染（占用一个 <li>）*/}
      {editingId === parent.id ? (
        <EditRow
          key={parent.id}
          draft={editDraft}
          onChange={setEditDraft}
          onSave={() => saveEdit(parent.id)}
          onCancel={cancelEdit}
          noteImages={parent.note_images ?? []}
          onImageRemoved={(id) => onSubImageRemoved(parent, id)}
        />
      ) : (
        <TodoRow
          key={parent.id}
          todo={parent}
          today={today}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onDecompose={onDecompose}
          subToggle={onToggleExpanded}
          subCount={subTodos.length}
          subProgress={
            subTodos.length > 0
              ? {
                  done: subTodos.filter((s) => s.done).length,
                  total: subTodos.length,
                }
              : undefined
          }
        />
      )}

      {expanded &&
        subTodos.map((sub) =>
          editingId === sub.id ? (
            <EditRow
              key={sub.id}
              draft={editDraft}
              onChange={setEditDraft}
              onSave={() => saveEdit(sub.id)}
              onCancel={cancelEdit}
              noteImages={sub.note_images ?? []}
              onImageRemoved={(id) => onSubImageRemoved(sub, id)}
            />
          ) : (
            <TodoRow
              key={sub.id}
              todo={sub}
              today={today}
              onToggle={(nextDone) => onSubToggle(sub, nextDone)}
              onEdit={() => onSubEdit(sub)}
              onDelete={() => onSubDelete(sub.id)}
              onDecompose={() => {
                /* 子项不展示「拆到今天」 */
              }}
              isSub
            />
          )
        )}

      {expanded && editingId !== parent.id && (
        <li className="todo-row todo-row--sub todo-row--add-sub">
          <span className="todo-row__sub-arrow" aria-hidden>
            ↳
          </span>
          <input
            className="field__input todo-row__sub-input"
            placeholder="添加子待做（Enter 保存，Esc 取消）"
            value={subDraft}
            maxLength={80}
            onChange={(e) => onSubDraftChange(e.target.value)}
            onKeyDown={handleSubKeyDown}
            disabled={subSubmitting}
          />
          <button
            type="button"
            className="primary-btn primary-btn--sm"
            disabled={subSubmitting || !subDraft.trim()}
            onClick={() => onAddSub()}
          >
            {subSubmitting ? '…' : '＋'}
          </button>
        </li>
      )}
    </>
  );
}

function EditRow({
  draft,
  onChange,
  onSave,
  onCancel,
  noteImages,
  onImageRemoved,
}: {
  draft: TodoPatch;
  onChange: (next: TodoPatch) => void;
  onSave: () => void;
  onCancel: () => void;
  noteImages: TodoNoteImage[];
  onImageRemoved: (id: number) => void;
}) {
  return (
    <li className="todo-row todo-row--editing">
      <div className="todo-row__edit-grid">
        <input
          autoFocus
          className="field__input"
          placeholder="标题"
          value={draft.title ?? ''}
          maxLength={80}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <div className="todo-row__edit-row">
          <div className="todo-row__edit-prio">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={`priority-chip priority-chip--p${p} ${
                  draft.priority === p ? 'is-active' : ''
                }`}
                onClick={() => onChange({ ...draft, priority: p })}
              >
                P{p}
              </button>
            ))}
          </div>
          <label className="todo-row__edit-due">
            <span>截止日</span>
            <input
              type="date"
              className="field__input"
              value={draft.due_date ?? ''}
              onChange={(e) =>
                onChange({ ...draft, due_date: e.target.value || null })
              }
            />
          </label>
        </div>
        <NoteEditor
          value={draft.note ?? ''}
          onChange={(v) => onChange({ ...draft, note: v })}
          noteImages={noteImages}
          onImageRemoved={onImageRemoved}
          placeholder="备注"
          maxLength={500}
        />
        <div className="todo-row__edit-actions">
          <button className="ghost-btn ghost-btn--sm" onClick={onCancel}>
            取消
          </button>
          <button className="primary-btn" onClick={onSave}>
            保存
          </button>
        </div>
      </div>
    </li>
  );
}