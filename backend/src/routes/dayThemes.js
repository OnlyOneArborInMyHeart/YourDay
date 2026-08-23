import { Router } from 'express';
import db from '../db.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', (req, res) => {
  const { from, to, date, dates } = req.query;
  const uid = req.userId;

  let rows;
  if (date) {
    rows = db
      .prepare('SELECT date, title, updated_at FROM day_themes WHERE user_id = ? AND date = ?')
      .all(uid, date);
  } else if (dates) {
    const list = String(dates).split(',').filter(Boolean);
    if (list.length === 0) {
      rows = [];
    } else {
      // 任意一日期匹配 + 属于当前用户
      const placeholders = list.map(() => '?').join(',');
      rows = db
        .prepare(
          `SELECT date, title, updated_at FROM day_themes
           WHERE user_id = ? AND date IN (${placeholders})`
        )
        .all(uid, ...list);
    }
  } else if (from && to) {
    rows = db
      .prepare(
        'SELECT date, title, updated_at FROM day_themes WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC'
      )
      .all(uid, from, to);
  } else {
    rows = db
      .prepare(
        'SELECT date, title, updated_at FROM day_themes WHERE user_id = ? ORDER BY date DESC LIMIT 200'
      )
      .all(uid);
  }
  res.json(rows);
});

router.put('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  const rawTitle = req.body?.title;
  if (typeof rawTitle !== 'string') {
    return res.status(400).json({ error: 'title 应为字符串' });
  }
  const title = rawTitle.trim().slice(0, 40);

  if (title.length === 0) {
    db.prepare('DELETE FROM day_themes WHERE date = ? AND user_id = ?').run(date, req.userId);
    return res.json({ date, title: '' });
  }

  // upsert：基于 (user_id, date) 联合唯一。SQLite 没有复合主键，因此
  // 使用 ON CONFLICT 风格的写法：先按 user_id+date 查一遍，存在则 update，不存在则 insert。
  const existing = db
    .prepare('SELECT date FROM day_themes WHERE user_id = ? AND date = ?')
    .get(req.userId, date);
  if (existing) {
    db.prepare(
      `UPDATE day_themes
       SET title = ?, updated_at = datetime('now','localtime')
       WHERE user_id = ? AND date = ?`
    ).run(title, req.userId, date);
  } else {
    db.prepare(
      `INSERT INTO day_themes (date, title, updated_at, user_id)
       VALUES (?, ?, datetime('now','localtime'), ?)`
    ).run(date, title, req.userId);
  }

  const row = db
    .prepare(
      'SELECT date, title, updated_at FROM day_themes WHERE user_id = ? AND date = ?'
    )
    .get(req.userId, date);
  res.json(row);
});

router.delete('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  db.prepare('DELETE FROM day_themes WHERE user_id = ? AND date = ?').run(req.userId, date);
  res.status(204).end();
});

export default router;
