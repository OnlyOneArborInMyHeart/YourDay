import { Router } from 'express';
import db from '../db.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', (req, res) => {
  const { from, to, date, dates } = req.query;

  let rows;
  if (date) {
    rows = db
      .prepare('SELECT date, title, updated_at FROM day_themes WHERE date = ?')
      .all(date);
  } else if (dates) {
    const list = String(dates).split(',').filter(Boolean);
    if (list.length === 0) {
      rows = [];
    } else {
      const placeholders = list.map(() => '?').join(',');
      rows = db
        .prepare(
          `SELECT date, title, updated_at FROM day_themes WHERE date IN (${placeholders})`
        )
        .all(...list);
    }
  } else if (from && to) {
    rows = db
      .prepare(
        'SELECT date, title, updated_at FROM day_themes WHERE date BETWEEN ? AND ? ORDER BY date ASC'
      )
      .all(from, to);
  } else {
    rows = db
      .prepare(
        'SELECT date, title, updated_at FROM day_themes ORDER BY date DESC LIMIT 200'
      )
      .all();
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
    db.prepare('DELETE FROM day_themes WHERE date = ?').run(date);
    return res.json({ date, title: '' });
  }

  db.prepare(
    `INSERT INTO day_themes (date, title, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(date) DO UPDATE SET
       title = excluded.title,
       updated_at = datetime('now','localtime')`
  ).run(date, title);

  const row = db
    .prepare('SELECT date, title, updated_at FROM day_themes WHERE date = ?')
    .get(date);
  res.json(row);
});

router.delete('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  db.prepare('DELETE FROM day_themes WHERE date = ?').run(date);
  res.status(204).end();
});

export default router;
