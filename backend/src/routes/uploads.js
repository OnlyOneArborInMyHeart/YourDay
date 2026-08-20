import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import db from '../db.js';const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED_MIME = new Set([
  // 图片
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  // 音频
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
  'audio/mp4',
  // 视频
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
]);

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB / file

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

function detectKind(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

/**
 * 修复中文文件名乱码：浏览器/某些客户端 multipart 提交时按 latin1 解码 filename* / filename，
 * 导致 originalname 变成 latin1 字节。这里按 latin1 -> utf8 转回正确字符串。
 */
function decodeOriginalName(name) {
  if (!name) return '';
  // 若包含可打印 ASCII 之外的字符，按 latin1 -> utf8 转一次
  if (/[\u0080-\uFFFF]/.test(name)) {
    try {
      const buf = Buffer.from(name, 'latin1');
      const decoded = buf.toString('utf8');
      // 若转码后出现替换字符则丢弃
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch {
      /* fall through */
    }
  }
  return name;
}

router.post('/:date', (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
  }

  const handler = upload.single('file');
  handler(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const kind = detectKind(req.file.mimetype);
    if (!kind) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ error: '无法识别的文件类型' });
    }

    const info = db
      .prepare(
        `INSERT INTO diary_attachments (date, kind, filename, mime, size, original_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        date,
        kind,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        decodeOriginalName(req.file.originalname)
      );

    const row = db
      .prepare(
        `SELECT id, date, kind, filename, mime, size, original_name, created_at
         FROM diary_attachments WHERE id = ?`
      )
      .get(info.lastInsertRowid);

    res.json({
      ...row,
      url: `/api/uploads/${req.file.filename}`,
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const row = db
    .prepare('SELECT filename FROM diary_attachments WHERE id = ?')
    .get(id);
  if (!row) return res.status(204).end();

  db.prepare('DELETE FROM diary_attachments WHERE id = ?').run(id);
  const fp = path.join(uploadsDir, row.filename);
  fs.unlink(fp, () => undefined);
  res.status(204).end();
});

export default router;
