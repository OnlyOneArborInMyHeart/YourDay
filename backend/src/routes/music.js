import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
  'audio/mp4',
]);

const ALLOWED_COVER_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_SIZE = 80 * 1024 * 1024; // 80 MB / audio file
const MAX_COVER_SIZE = 8 * 1024 * 1024; // 8 MB / cover image

const uploadsDir = path.resolve(__dirname, '..', '..', 'data', 'uploads');
const coversDir = path.join(uploadsDir, 'covers');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

function makeStorage(targetDir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, targetDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '';
      const rand = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${rand}${ext}`);
    },
  });
}

const upload = multer({
  storage: makeStorage(uploadsDir),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`不支持的音频类型: ${file.mimetype}`));
  },
});

const coverUpload = multer({
  storage: makeStorage(coversDir),
  limits: { fileSize: MAX_COVER_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_COVER_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`不支持的封面图片类型: ${file.mimetype}`));
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

/** 去掉扩展名的展示名 */
function baseName(name) {
  return name.replace(/\.[^./\\]+$/, '');
}

/** 安全删除磁盘文件（不抛出） */
function safeUnlink(p) {
  try {
    fs.unlink(p, () => undefined);
  } catch {
    /* ignore */
  }
}

/**
 * 服务端裁剪封面：基于用户在前端交互选出的矩形 + 形状选项，输出 800×800 jpg。
 * 入参（全部可选，未提供或非法则跳过裁剪，沿用原图）：
 *   shape:        'circle' | 'square' | 'rect'
 *   cropX, cropY: 选区左上角相对原图的 px 坐标（>=0）
 *   cropW, cropH: 选区尺寸 px（>0）
 *   imageWidth, imageHeight: 原图真实尺寸（用于校验）
 */
async function maybeCropCover(inputPath, outputPath, opts) {
  const { shape, cropX, cropY, cropW, cropH, imageWidth, imageHeight } = opts || {};
  // 必须提供 shape 与坐标才进入裁剪流程
  const haveShape = shape === 'circle' || shape === 'square' || shape === 'rect';
  const haveBox =
    Number.isFinite(cropX) &&
    Number.isFinite(cropY) &&
    Number.isFinite(cropW) &&
    Number.isFinite(cropH);
  if (!haveShape || !haveBox) {
    // 不裁剪：直接把原图转成统一 jpg 输出（保证磁盘上的封面都是 jpg，体积可控）
    await sharp(inputPath).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 88 }).toFile(outputPath);
    return;
  }

  // 获取原图真实尺寸做夹紧，避免前端传值越界
  const meta = await sharp(inputPath).metadata();
  const W = meta.width || imageWidth || 0;
  const H = meta.height || imageHeight || 0;
  if (!W || !H) {
    await sharp(inputPath).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 88 }).toFile(outputPath);
    return;
  }

  let x = Math.max(0, Math.floor(cropX));
  let y = Math.max(0, Math.floor(cropY));
  let w = Math.max(1, Math.floor(cropW));
  let h = Math.max(1, Math.floor(cropH));
  // 夹紧到原图边界
  if (x + w > W) w = Math.max(1, W - x);
  if (y + h > H) h = Math.max(1, H - y);

  // 把裁剪区统一 resize 到 800×800，再依 shape 做不同的最终输出
  let pipeline = sharp(inputPath).extract({ left: x, top: y, width: w, height: h });
  if (shape === 'square') {
    // 方形：居中裁成 1:1
    const side = Math.min(w, h);
    const offsetX = Math.floor((w - side) / 2);
    const offsetY = Math.floor((h - side) / 2);
    pipeline = sharp(inputPath).extract({
      left: x + offsetX,
      top: y + offsetY,
      width: side,
      height: side,
    });
    pipeline = pipeline.resize(800, 800);
  } else if (shape === 'circle') {
    // 圆形：先取正方形居中区，再 resize 到 800，再做圆形遮罩 + 透明背景
    const side = Math.min(w, h);
    const offsetX = Math.floor((w - side) / 2);
    const offsetY = Math.floor((h - side) / 2);
    const square = await sharp(inputPath)
      .extract({ left: x + offsetX, top: y + offsetY, width: side, height: side })
      .resize(800, 800)
      .png()
      .toBuffer();
    const mask = await sharp({
      create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: Buffer.from(`<svg><circle cx="400" cy="400" r="400" fill="white"/></svg>`), blend: 'dest-in' }])
      .png()
      .toBuffer();
    await sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(outputPath);
    return;
  } else {
    // rect：保留选区比例
    pipeline = pipeline.resize(800, 800, { fit: 'inside' });
  }
  await pipeline.jpeg({ quality: 88 }).toFile(outputPath);
}

function rowToTrack(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    original_name: row.original_name ?? '',
    cover_filename: row.cover_filename ?? null,
    lyrics: row.lyrics ?? null,
    url: `/api/music/${row.filename}`,
    cover_url: row.cover_filename ? `/api/music/covers/${row.cover_filename}` : null,
    created_at: row.created_at,
  };
}

const TRACK_COLS =
  'id, title, filename, mime, size, original_name, cover_filename, lyrics, created_at';

/** 列出当前用户全部音乐 */
router.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT ${TRACK_COLS} FROM music_tracks WHERE user_id = ? ORDER BY created_at DESC, id DESC`)
    .all(req.userId);
  res.json(rows.map(rowToTrack));
});

/** 上传一首音乐（multipart/form-data, field=file） */
router.post('/', (req, res) => {
  const handler = upload.single('file');
  handler(req, res, (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const decodedName = decodeOriginalName(req.file.originalname);
    const title = baseName(decodedName) || 'Untitled';

    const info = db
      .prepare(
        `INSERT INTO music_tracks (filename, mime, size, title, original_name, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        title.slice(0, 80),
        decodedName,
        req.userId
      );

    const row = db
      .prepare(`SELECT ${TRACK_COLS} FROM music_tracks WHERE id = ? AND user_id = ?`)
      .get(info.lastInsertRowid, req.userId);

    res.status(201).json(rowToTrack(row));
  });
});

/** 重命名：仅修改 title */
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
  if (!title) return res.status(400).json({ error: 'title 不能为空' });

  const result = db
    .prepare('UPDATE music_tracks SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: '曲目不存在' });

  const row = db
    .prepare(`SELECT ${TRACK_COLS} FROM music_tracks WHERE id = ? AND user_id = ?`)
    .get(id, req.userId);
  res.json(rowToTrack(row));
});

/** 上传 / 替换封面图（multipart/form-data, field=file） */
router.post('/:id/cover', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }

  const handler = coverUpload.single('file');
  handler(req, res, async (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : '上传封面失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const row = db
      .prepare('SELECT cover_filename FROM music_tracks WHERE id = ? AND user_id = ?')
      .get(id, req.userId);
    if (!row) {
      safeUnlink(req.file.path);
      return res.status(404).json({ error: '曲目不存在' });
    }

    // 解析裁剪参数（可能缺失 → 不裁剪）
    const b = req.body || {};
    const cropOpts = {
      shape: typeof b.cropShape === 'string' ? b.cropShape : null,
      cropX: Number(b.cropX),
      cropY: Number(b.cropY),
      cropW: Number(b.cropW),
      cropH: Number(b.cropH),
      imageWidth: Number(b.imageWidth),
      imageHeight: Number(b.imageHeight),
    };

    // 输出统一是 jpg（除圆形用 png）
    const isCircle = cropOpts.shape === 'circle';
    const ext = isCircle ? '.png' : '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    const finalFilename = `${Date.now()}-${rand}${ext}`;
    const finalPath = path.join(coversDir, finalFilename);

    try {
      await maybeCropCover(req.file.path, finalPath, cropOpts);
    } catch (cropErr) {
      safeUnlink(req.file.path);
      const msg = cropErr instanceof Error ? cropErr.message : '裁剪封面失败';
      return res.status(400).json({ error: msg });
    }

    // 临时原文件（不保留）+ 旧封面都清掉，再更新 DB
    safeUnlink(req.file.path);
    if (row.cover_filename) {
      safeUnlink(path.join(coversDir, row.cover_filename));
    }
    db.prepare('UPDATE music_tracks SET cover_filename = ? WHERE id = ? AND user_id = ?').run(
      finalFilename,
      id,
      req.userId
    );

    const updated = db
      .prepare(`SELECT ${TRACK_COLS} FROM music_tracks WHERE id = ? AND user_id = ?`)
      .get(id, req.userId);
    res.json(rowToTrack(updated));
  });
});

/** 删除封面图（仅清空 DB 列 + 删磁盘文件，不动音频本身） */
router.delete('/:id/cover', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const row = db
    .prepare('SELECT cover_filename FROM music_tracks WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!row) return res.status(204).end();
  if (row.cover_filename) {
    safeUnlink(path.join(coversDir, row.cover_filename));
    db.prepare('UPDATE music_tracks SET cover_filename = NULL WHERE id = ? AND user_id = ?').run(id, req.userId);
  }
  res.status(204).end();
});

/** 上传歌词（text/plain，期望 LRC 格式纯文本） */
router.post('/:id/lyrics', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }

  // Express.json() 已消耗流，body 可能已在 req.body 里（JSON 格式请求）。
  // 也可能 Content-Type: text/plain 时 body 仍是 stream，需要手动拼接。
  const text = typeof req.body === 'string' ? req.body
    : typeof req.body?.lyrics === 'string' ? req.body.lyrics
    : '';

  if (!text) {
    return res.status(400).json({ error: '歌词内容为空' });
  }

  const result = db
    .prepare('UPDATE music_tracks SET lyrics = ? WHERE id = ? AND user_id = ?')
    .run(text.slice(0, 256 * 1024), id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: '曲目不存在' });
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM music_tracks WHERE id = ? AND user_id = ?`).get(id, req.userId);
  res.json(rowToTrack(row));
});

/** 删除歌词 */
router.delete('/:id/lyrics', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const result = db
    .prepare('UPDATE music_tracks SET lyrics = NULL WHERE id = ? AND user_id = ?')
    .run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: '曲目不存在' });
  res.status(204).end();
});

/** 删除一首：同时移除磁盘文件 + 封面 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id 不合法' });
  }
  const row = db
    .prepare('SELECT filename, cover_filename FROM music_tracks WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!row) return res.status(204).end();

  db.prepare('DELETE FROM music_tracks WHERE id = ? AND user_id = ?').run(id, req.userId);
  safeUnlink(path.join(uploadsDir, row.filename));
  if (row.cover_filename) safeUnlink(path.join(coversDir, row.cover_filename));
  res.status(204).end();
});

export default router;