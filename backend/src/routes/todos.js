import { Router } from 'express';
import db from '../db.js';

const router = Router();

const VALID_PRIORITIES = [1, 2, 3];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 把数据库行（done 0/1）转成前端友好的形状
 */
function rowToTodo(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    note: row.note ?? '',
    done: !!row.done,
    due_date: row.due_date ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at ?? null,
  };
}

/**
 * 校验新建 / 更新的 todo body；返回 { errors, value }
 */
function validateTodoBody(body, partial = false) {
  const errors = [];
  const value = {};

  if (!partial || body.title !== undefined) {
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      if (!partial) errors.push('title 不能为空');
    } else {
      value.title = body.title.trim().slice(0, 80);
    }
  }

  if (!partial || body.priority !== undefined) {
    const p = Number(body.priority);
    if (!VALID_PRIORITIES.includes(p)) errors.push('priority 必须是 1/2/3');
    else value.priority = p;
  }

  if (body.note !== undefined) {
    if (typeof body.note !== 'string') errors.push('note 应为字符串');
    else value.note = body.note.slice(0, 500);
  } else if (!partial) {
    value.note = '';
  }

  if (body.done !== undefined) {
    if (![0, 1, true, false].includes(body.done)) {
      errors.push('done 应为布尔值');
    } else {
      value.done = body.done ? 1 : 0;
    }
  } else if (!partial) {
    value.done = 0;
  }

  if (body.due_date !== undefined) {
    if (body.due_date === null || body.due_date === '') {
      value.due_date = null;
    } else if (typeof body.due_date === 'string' && DATE_RE.test(body.due_date)) {
      value.due_date = body.due_date;
    } else {
      errors.push('due_date 格式应为 YYYY-MM-DD 或 null');
    }
  } else if (!partial) {
    value.due_date = null;
  }

  return { errors, value };
}

// 列表：支持 ?done=0|1&q=keyword&priority=1|2|3
router.get('/', (req, res) => {
  const { done, q, priority } = req.query;
  const where = [];
  const params = [];

  if (done !== undefined) {
    if (!['0', '1', 'true', 'false'].includes(String(done))) {
      return res.status(400).json({ error: 'done 应为 0/1' });
    }
    where.push('done = ?');
    params.push(done === '1' || done === 'true' ? 1 : 0);
  }

  if (priority !== undefined) {
    const p = Number(priority);
    if (!VALID_PRIORITIES.includes(p)) {
      return res.status(400).json({ error: 'priority 应为 1/2/3' });
    }
    where.push('priority = ?');
    params.push(p);
  }

  if (q !== undefined && String(q).trim() !== '') {
    where.push('(title LIKE ? OR note LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like);
  }

  const sql = `SELECT * FROM todos ${
    where.length ? 'WHERE ' + where.join(' AND ') : ''
  } ORDER BY done ASC, priority ASC, COALESCE(due_date, '9999-99-99') ASC, created_at DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToTodo));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  const todo = rowToTodo(row);
  if (!todo) return res.status(404).json({ error: 'todo 不存在' });
  res.json(todo);
});

router.post('/', (req, res) => {
  const { errors, value } = validateTodoBody(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('；') });

  const stmt = db.prepare(`
    INSERT INTO todos (title, priority, note, done, due_date)
    VALUES (@title, @priority, @note, @done, @due_date)
  `);
  const result = stmt.run(value);
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rowToTodo(row));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'todo 不存在' });

  const { errors, value } = validateTodoBody(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('；') });

  // 合并：未传字段保留旧值
  const merged = {
    title: value.title ?? existing.title,
    priority: value.priority ?? existing.priority,
    note: value.note ?? existing.note,
    done: value.done ?? existing.done,
    due_date: value.due_date !== undefined ? value.due_date : existing.due_date,
  };

  // completed_at 自动维护：
  // - done 0→1：记录当下时间
  // - done 1→0：清空
  // - 保持不变：保留原值
  let completedAtExpr;
  if (value.done === undefined) {
    completedAtExpr = 'completed_at';
  } else if (merged.done === 1) {
    completedAtExpr = "datetime('now','localtime')";
  } else {
    completedAtExpr = 'NULL';
  }

  db.prepare(`
    UPDATE todos
    SET title=@title, priority=@priority, note=@note,
        done=@done, due_date=@due_date,
        completed_at=${completedAtExpr},
        updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run({ id: req.params.id, ...merged });

  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  res.json(rowToTodo(row));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'todo 不存在' });
  res.status(204).end();
});

// 便捷 toggle
router.patch('/:id/toggle', (req, res) => {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'todo 不存在' });

  const next = existing.done ? 0 : 1;
  // 切到已完成时记录时间，切回未完成时清空
  const completedAtExpr = next === 1
    ? "datetime('now','localtime')"
    : 'NULL';
  db.prepare(
    `UPDATE todos SET done=?, completed_at=${completedAtExpr}, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(next, req.params.id);

  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  res.json(rowToTodo(row));
});

export default router;