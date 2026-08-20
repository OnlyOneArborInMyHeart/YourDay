import { Router } from 'express';
import db from '../db.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 40;
const MD_MAX = 64 * 1024;

/**
 * 列出指定日期范围内的日记（附带各自的附件）。
 * 用于日历视图整月一次性拉。
 */
router.get('/', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to || !DATE_RE.test(String(from)) || !DATE_RE.test(String(to))) {
    return res.status(400).json({ error: '需要 from / to（YYYY-MM-DD）' });
  }
  const rows = db
    .prepare(
      `SELECT date, title, markdown_content, updated_at
       FROM diary_entries WHERE date BETWEEN ? AND ? ORDER BY date ASC`
    )
    .all(String(from), String(to));
  if (rows.length === 0) return res.json([]);
  const placeholders = rows.map(() => '?').join(',');
  const atts = db
    .prepare(
      `SELECT id, date, kind, filename, mime, size, original_name, created_at
       FROM diary_attachments WHERE date IN (${placeholders}) ORDER BY id ASC`
    )
    .all(...rows.map((r) => r.date));
  const byDate = new Map();
  for (const a of atts) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  res.json(rows.map((r) => ({ ...r, attachments: byDate.get(r.date) || [] })));
});

router.get('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  const row = db
    .prepare('SELECT date, title, markdown_content, updated_at FROM diary_entries WHERE date = ?')
    .get(date);
  const attachments = db
    .prepare(
      `SELECT id, date, kind, filename, mime, size, original_name, created_at
       FROM diary_attachments WHERE date = ? ORDER BY id ASC`
    )
    .all(date);
  res.json({
    date,
    title: row?.title ?? '',
    markdown_content: row?.markdown_content ?? '',
    updated_at: row?.updated_at ?? null,
    attachments,
  });
});

router.put('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, TITLE_MAX) : '';
  const md = typeof req.body?.markdown_content === 'string' ? req.body.markdown_content.slice(0, MD_MAX) : '';

  db.prepare(
    `INSERT INTO diary_entries (date, title, markdown_content, updated_at)
     VALUES (?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(date) DO UPDATE SET
       title = excluded.title,
       markdown_content = excluded.markdown_content,
       updated_at = datetime('now','localtime')`
  ).run(date, title, md);

  const row = db
    .prepare('SELECT date, title, markdown_content, updated_at FROM diary_entries WHERE date = ?')
    .get(date);
  res.json(row);
});

router.delete('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  db.prepare('DELETE FROM diary_entries WHERE date = ?').run(date);
  // 附件由 uploads 路由 / 清理流程处理
  res.status(204).end();
});

/** 列出指定日期的附件（前端刷新用） */
router.get('/:date/attachments', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }
  const rows = db
    .prepare(
      `SELECT id, date, kind, filename, mime, size, original_name, created_at
       FROM diary_attachments WHERE date = ? ORDER BY id ASC`
    )
    .all(date);
  res.json(rows);
});

export default router;
