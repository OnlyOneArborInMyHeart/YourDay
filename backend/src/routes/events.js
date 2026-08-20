import { Router } from 'express';
import db from '../db.js';

const router = Router();

const VALID_PRIORITIES = [1, 2, 3];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateEventBody(body) {
  const { title, start_time, end_time, priority, note, done, background_image_id } = body;
  const errors = [];

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title 不能为空');
  }
  if (!TIME_RE.test(start_time)) errors.push('start_time 格式应为 HH:MM');
  if (!TIME_RE.test(end_time)) errors.push('end_time 格式应为 HH:MM');
  if (start_time && end_time && start_time >= end_time) {
    errors.push('start_time 必须早于 end_time');
  }
  const p = Number(priority);
  if (!VALID_PRIORITIES.includes(p)) errors.push('priority 必须是 1/2/3');
  if (note !== undefined && typeof note !== 'string') errors.push('note 应为字符串');
  if (done !== undefined && ![0, 1, true, false].includes(done)) {
    errors.push('done 应为布尔值');
  }
  // background_image_id 可为 null/省略（=清除背景）或正整数（=绑定背景图）
  let bgId = null;
  if (background_image_id !== undefined && background_image_id !== null) {
    const n = Number(background_image_id);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('background_image_id 应为正整数或 null');
    } else {
      const exists = db.prepare('SELECT id FROM event_backgrounds WHERE id = ?').get(n);
      if (!exists) errors.push('background_image_id 指向的背景图不存在');
      else bgId = n;
    }
  }

  return {
    errors,
    value: {
      title: (title || '').trim().slice(0, 80),
      start_time,
      end_time,
      priority: p,
      note: (note || '').slice(0, 500),
      done: done === undefined ? 0 : (done ? 1 : 0),
      background_image_id: bgId,
    },
  };
}

/**
 * 把 events 行 + 背景图 join 成返回给前端的形状：
 *   background_image: { id, url, width, height, mime, original_name } | null
 */
function decorateWithBackground(row) {
  if (!row) return row;
  let bg = null;
  if (row.background_image_id) {
    const r = db
      .prepare(
        `SELECT id, filename, mime, width, height, original_name
         FROM event_backgrounds WHERE id = ?`
      )
      .get(row.background_image_id);
    if (r) {
      bg = {
        id: r.id,
        url: `/api/event-backgrounds/${r.filename}`,
        width: r.width,
        height: r.height,
        mime: r.mime,
        original_name: r.original_name,
      };
    }
  }
  // 不要把外列 background_image_id 直接暴露给前端，统一收敛到 background_image
  const { background_image_id, ...rest } = row;
  return { ...rest, background_image: bg };
}

router.get('/', (req, res) => {
  const { date, from, to } = req.query;

  let rows;
  if (date) {
    rows = db.prepare('SELECT * FROM events WHERE date = ? ORDER BY start_time ASC').all(date);
  } else if (from && to) {
    rows = db
      .prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC, start_time ASC')
      .all(from, to);
  } else {
    rows = db.prepare('SELECT * FROM events ORDER BY date DESC, start_time ASC LIMIT 200').all();
  }
  res.json(rows.map(decorateWithBackground));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '事件不存在' });
  res.json(decorateWithBackground(row));
});

router.post('/', (req, res) => {
  const { date } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  const { errors, value } = validateEventBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('；') });

  const stmt = db.prepare(`
    INSERT INTO events (date, title, start_time, end_time, priority, note, background_image_id)
    VALUES (@date, @title, @start_time, @end_time, @priority, @note, @background_image_id)
  `);
  const result = stmt.run({ date, ...value });
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(decorateWithBackground(row));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '事件不存在' });

  // background_image_id 允许显式传 null 来清除背景；省略则保留原值
  const incomingBg = req.body.background_image_id;
  const mergedBg = Object.prototype.hasOwnProperty.call(req.body, 'background_image_id')
    ? incomingBg
    : existing.background_image_id;

  // completed_at：done 变 true → 记录时间；done 变 false → 清空；其余不变
  const incomingDone = req.body.done;
  const mergedDone = incomingDone !== undefined ? (incomingDone ? 1 : 0) : existing.done;
  const completed_at =
    mergedDone === 1
      ? (existing.completed_at || "datetime('now','localtime')")
      : null;

  const { errors, value } = validateEventBody({
    title: req.body.title ?? existing.title,
    start_time: req.body.start_time ?? existing.start_time,
    end_time: req.body.end_time ?? existing.end_time,
    priority: req.body.priority ?? existing.priority,
    note: req.body.note ?? existing.note,
    done: mergedDone,
    background_image_id: mergedBg,
  });
  if (errors.length) return res.status(400).json({ error: errors.join('；') });

  if (value.start_time >= value.end_time) {
    return res.status(400).json({ error: 'start_time 必须早于 end_time' });
  }

  const stmt = db.prepare(`
    UPDATE events
    SET title=@title, start_time=@start_time, end_time=@end_time,
        priority=@priority, note=@note, done=@done,
        background_image_id=@background_image_id,
        completed_at=${completed_at === null ? 'NULL' : "datetime('now','localtime')"},
        updated_at=datetime('now','localtime')
    WHERE id=@id
  `);
  stmt.run({ id: req.params.id, ...value });
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json(decorateWithBackground(row));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '事件不存在' });
  res.status(204).end();
});

export default router;
