import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB / file — 备注插图不必太大

const uploadsDir = path.resolve(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`不支持的文件类型: ${file.mimetype}`));
  },
});

/**
 * 与 eventBackgrounds.js 相同的中文文件名修复策略。
 */
function decodeOriginalName(name) {
  if (!name) return '';
  if (/[\u0080-\uFFFF]/.test(name)) {
    try {
      const buf = Buffer.from(name, 'latin1');
      const decoded = buf.toString('utf8');
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch {
      /* fall through */
    }
  }
  return name;
}

/**
 * 上传一张图片到 todo_attachments。
 * 返回 { id, url, original_name }，前端拿到后会把
 * `![todo-img:ID](desc)` 插入到 textarea 的光标位置。
 */
router.post('/', (req, res) => {
  const handler = upload.single('file');
  handler(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const info = db
      .prepare(
        `INSERT INTO todo_attachments (filename, mime, size, original_name, user_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        decodeOriginalName(req.file.originalname),
        req.userId
      );

    const row = db
      .prepare(
        `SELECT id, filename, mime, size, original_name, created_at
         FROM todo_attachments WHERE id = ? AND user_id = ?`
      )
      .get(info.lastInsertRowid, req.userId);

    res.json({
      ...row,
      url: `/api/todo-attachments/${req.file.filename}`,
    });
  });
});

/**
 * 列出当前用户全部 todo_attachments。
 */
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, filename, mime, size, original_name, created_at
       FROM todo_attachments WHERE user_id = ? ORDER BY id DESC`
    )
    .all(req.userId);
  res.json(
    rows.map((r) => ({
      ...r,
      url: `/api/todo-attachments/${r.filename}`,
    }))
  );
});

/**
 * 手动删除某张图（仅本人）。前端在编辑 todo 时调用，
 * 删除成功后会同步把 note 里的对应 markdown token 移除。
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const row = db
    .prepare('SELECT filename FROM todo_attachments WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!row) return res.status(204).end();

  // 扫描 todos 表，若本用户仍有任何 note 在引用此 id，阻断删除
  const refs = db
    .prepare(
      `SELECT id, title FROM todos
       WHERE user_id = ? AND note LIKE ?`
    )
    .all(req.userId, `%todo-img:${id}%`);
  if (refs.length > 0) {
    return res
      .status(409)
      .json({ error: `该图片仍被 ${refs.length} 条 todo 引用，请先移除引用` });
  }

  db.prepare('DELETE FROM todo_attachments WHERE id = ? AND user_id = ?').run(id, req.userId);
  const fp = path.join(uploadsDir, row.filename);
  fs.unlink(fp, () => undefined);
  res.status(204).end();
});

export default router;