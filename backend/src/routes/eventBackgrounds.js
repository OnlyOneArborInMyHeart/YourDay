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

/**
 * 与 uploads.js 相同的中文文件名修复策略。
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
 * 从已落盘的图片文件探测宽高（仅 JPEG/PNG/WEBP/GIF）。
 * 读取 head 几十字节就够，不需要整张解码。
 */
async function readImageSize(filePath, mime) {
  try {
    const buf = await fs.promises.readFile(filePath);
    if (mime === 'image/png') {
      // PNG: 8 byte signature, then IHDR: 4(len) + 4("IHDR") + 4(width) + 4(height)
      if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return { width, height };
      }
    } else if (mime === 'image/gif') {
      if (buf.length >= 10) {
        const width = buf.readUInt16LE(6);
        const height = buf.readUInt16LE(8);
        return { width, height };
      }
    } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
      // walk JPEG markers
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const segLen = buf.readUInt16BE(offset + 2);
        // SOF0..SOF15 (excluding DHT(0xc4), DAC(0xcc), DRI(0xdd))
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height };
        }
        offset += 2 + segLen;
      }
    } else if (mime === 'image/webp') {
      // VP8 / VP8L / VP8X chunk
      if (
        buf.length >= 30 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
      ) {
        const fourCC = buf.toString('ascii', 12, 16);
        if (fourCC === 'VP8 ') {
          const width = buf.readUInt16LE(26) & 0x3fff;
          const height = buf.readUInt16LE(28) & 0x3fff;
          return { width, height };
        } else if (fourCC === 'VP8L') {
          const b0 = buf[21];
          const b1 = buf[22];
          const b2 = buf[23];
          const b3 = buf[24];
          const width = 1 + (((b1 & 0x3f) << 8) | b0);
          const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
          return { width, height };
        } else if (fourCC === 'VP8X') {
          const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
          const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
          return { width, height };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { width: null, height: null };
}

router.post('/', (req, res) => {
  const handler = upload.single('file');
  handler(req, res, async (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const { width, height } = await readImageSize(req.file.path, req.file.mimetype);

    const info = db
      .prepare(
        `INSERT INTO event_backgrounds (filename, mime, size, width, height, original_name, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        width,
        height,
        decodeOriginalName(req.file.originalname),
        req.userId
      );

    const row = db
      .prepare(
        `SELECT id, filename, mime, size, width, height, original_name, created_at
         FROM event_backgrounds WHERE id = ? AND user_id = ?`
      )
      .get(info.lastInsertRowid, req.userId);

    res.json({
      ...row,
      url: `/api/event-backgrounds/${req.file.filename}`,
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const row = db
    .prepare('SELECT filename FROM event_backgrounds WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!row) return res.status(204).end();

  // 若该背景图仍被本用户的某些事件引用，不允许删除（避免渲染空 src）
  const usage = db
    .prepare('SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND background_image_id = ?')
    .get(req.userId, id);
  if (usage && usage.n > 0) {
    return res.status(409).json({ error: `该背景图仍被 ${usage.n} 个事件引用，无法删除` });
  }

  db.prepare('DELETE FROM event_backgrounds WHERE id = ? AND user_id = ?').run(id, req.userId);
  const fp = path.join(uploadsDir, row.filename);
  fs.unlink(fp, () => undefined);
  res.status(204).end();
});

export default router;