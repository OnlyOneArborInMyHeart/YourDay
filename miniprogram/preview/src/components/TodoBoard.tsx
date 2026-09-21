import { useState } from 'react';
import type { Todo, TodoDraft, Priority } from '../lib/types';
import { todosApi } from '../lib/domain';

interface Props {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
  onError: (msg: string | null) => void;
}

function childOf(t: Todo, all: Todo[]): Todo[] {
  return all.filter((x) => x.parent_id === t.id);
}

export default function TodoBoard({ todos, onChange, onError }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<TodoDraft>({ title: '', priority: 2 });
  const [addingChildOf, setAddingChildOf] = useState<number | null>(null);
  const [childDraft, setChildDraft] = useState<{ title: string; priority: Priority }>({ title: '', priority: 2 });

  const tops = todos.filter((t) => !t.parent_id);
  const doneTops = tops.filter((t) => t.done);
  const activeTops = tops.filter((t) => !t.done);

  async function create() {
    if (!draft.title.trim()) return;
    try {
      const t = await todosApi.create(draft);
      onChange([t, ...todos]);
      setDraft({ title: '', priority: 2 });
      setAdding(false);
    } catch (e: any) {
      onError(e?.payload?.error || e?.message || '创建失败');
    }
  }

  async function createChild() {
    if (!childDraft.title.trim() || addingChildOf == null) return;
    try {
      const t = await todosApi.create({
        title: childDraft.title,
        priority: childDraft.priority,
        parent_id: addingChildOf,
      });
      onChange([t, ...todos]);
      setChildDraft({ title: '', priority: 2 });
      setAddingChildOf(null);
    } catch (e: any) {
      onError(e?.payload?.error || e?.message || '创建失败');
    }
  }

  async function toggle(t: Todo) {
    try {
      const updated = await todosApi.toggle(t.id);
      onChange(todos.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: any) {
      onError(e?.payload?.error || e?.message || '切换失败');
    }
  }

  async function remove(t: Todo) {
    if (!window.confirm(`删除待办"${t.title}"?`)) return;
    try {
      await todosApi.remove(t.id);
      onChange(todos.filter((x) => x.id !== t.id));
    } catch (e: any) {
      onError(e?.payload?.error || e?.message || '删除失败');
    }
  }

  return (
    <div className="todo-board">
      {!adding ? (
        <button className="todo-board__add" onClick={() => setAdding(true)}>+ 新建顶级待办</button>
      ) : (
        <div style={{ background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <input
            autoFocus
            placeholder="待办标题"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(false); }}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d8dde6', marginBottom: 8, fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setDraft({ ...draft, priority: p as Priority })}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 8, fontSize: 12,
                  border: `1.5px solid ${draft.priority === p ? '#6366f1' : '#e2e8f0'}`,
                  background: draft.priority === p ? '#eef2ff' : '#fff',
                  color: '#475569', cursor: 'pointer',
                }}
              >
                P{p}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => setAdding(false)}>取消</button>
            <button className="btn-primary" onClick={create} style={{ flex: 1 }}>保存</button>
          </div>
        </div>
      )}

      {activeTops.length === 0 && (
        <div className="page__hint">还没有待办，点上方按钮创建一个</div>
      )}

      {activeTops.map((t) => (
        <TodoCard
          key={t.id}
          t={t}
          children={childOf(t, todos)}
          onToggle={() => toggle(t)}
          onRemove={() => remove(t)}
          onAddChild={() => setAddingChildOf(t.id)}
          onToggleChild={(c) => toggle(c)}
          onRemoveChild={(c) => remove(c)}
        />
      ))}

      {addingChildOf != null && (
        <div style={{ background: '#eef2ff', padding: 10, borderRadius: 10, marginTop: 6 }}>
          <input
            autoFocus
            placeholder="子待办标题"
            value={childDraft.title}
            onChange={(e) => setChildDraft({ ...childDraft, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') createChild(); if (e.key === 'Escape') setAddingChildOf(null); }}
            style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #c7d2fe', marginBottom: 6, fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" onClick={() => setAddingChildOf(null)}>取消</button>
            <button className="btn-primary" onClick={createChild} style={{ flex: 1 }}>添加</button>
          </div>
        </div>
      )}

      {doneTops.length > 0 && (
        <>
          <div className="todo-board__divider">
            <span>已完成 · {doneTops.length}</span>
            <button
              onClick={() => setShowDone((s) => !s)}
              style={{ border: 'none', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}
            >
              {showDone ? '收起' : '展开'}
            </button>
          </div>
          {showDone && doneTops.map((t) => (
            <TodoCard
              key={t.id}
              t={t}
              children={[]}
              onToggle={() => toggle(t)}
              onRemove={() => remove(t)}
              onAddChild={() => undefined}
              onToggleChild={() => undefined}
              onRemoveChild={() => undefined}
            />
          ))}
        </>
      )}
    </div>
  );
}

function TodoCard({
  t, children,
  onToggle, onRemove, onAddChild,
  onToggleChild, onRemoveChild,
}: {
  t: Todo;
  children: Todo[];
  onToggle: () => void;
  onRemove: () => void;
  onAddChild: () => void;
  onToggleChild: (c: Todo) => void;
  onRemoveChild: (c: Todo) => void;
}) {
  return (
    <div className={`todo-card priority-${t.priority} ${t.done ? 'done' : ''}`}>
      <div className="todo-card__top">
        <button className="todo-card__check" onClick={onToggle}>{t.done ? '✓' : ''}</button>
        <span className="todo-card__title">{t.title}</span>
        {t.due_date && <span className="todo-card__due">截止 {t.due_date}</span>}
      </div>
      {t.note && <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 26px', whiteSpace: 'pre-wrap' }}>{t.note}</div>}
      <div className="todo-card__actions">
        <button className="todo-card__btn" onClick={onAddChild}>+ 子项</button>
        <button className="todo-card__btn" onClick={onRemove}>删除</button>
      </div>
      {children.length > 0 && (
        <div className="todo-card__children">
          {children.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <button
                onClick={() => onToggleChild(c)}
                style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `1.5px solid ${c.done ? '#6366f1' : '#cbd5e1'}`,
                  background: c.done ? '#6366f1' : '#fff',
                  color: '#fff', fontSize: 9, cursor: 'pointer',
                }}
              >{c.done ? '✓' : ''}</button>
              <span style={{ flex: 1, fontSize: 12, color: c.done ? '#94a3b8' : '#1f2430', textDecoration: c.done ? 'line-through' : 'none' }}>
                {c.title}
              </span>
              <button
                onClick={() => onRemoveChild(c)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}