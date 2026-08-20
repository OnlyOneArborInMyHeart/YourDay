import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import eventsRouter from './routes/events.js';
import dayThemesRouter from './routes/dayThemes.js';
import todosRouter from './routes/todos.js';
import diariesRouter from './routes/diaries.js';
import uploadsRouter from './routes/uploads.js';
import eventBackgroundsRouter from './routes/eventBackgrounds.js';
import musicRouter from './routes/music.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'YourDay API' }));
app.use('/api/events', eventsRouter);
app.use('/api/themes', dayThemesRouter);
app.use('/api/todos', todosRouter);
app.use('/api/diaries', diariesRouter);

// 静态托管上传的文件（GET 优先匹配，POST/DELETE 继续走路由）
const uploadsDir = path.resolve(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(
  '/api/uploads',
  express.static(uploadsDir, {
    maxAge: '7d',
    fallthrough: true,
  })
);
app.use('/api/uploads', uploadsRouter);
app.use(
  '/api/event-backgrounds',
  express.static(uploadsDir, {
    maxAge: '7d',
    fallthrough: true,
  })
);
app.use('/api/event-backgrounds', eventBackgroundsRouter);

// 音乐库：上传音频文件存到 data/uploads/，通过 /api/music/:filename 暴露给前端。
// 封面图：存到 data/uploads/covers/，通过 /api/music/covers/:filename 暴露。
// 注意：路由顺序——静态托管放前面，使 GET 直接命中文件；路由处理器仍能处理 POST/PATCH/DELETE。
// /api/music 列表（GET 无文件名）走 router；具体文件的 GET 才由静态中间件命中。
app.use(
  '/api/music/covers',
  express.static(path.join(uploadsDir, 'covers'), {
    maxAge: '7d',
    fallthrough: true,
    index: false,
    redirect: false,
  })
);
app.use(
  '/api/music',
  express.static(uploadsDir, {
    maxAge: '7d',
    fallthrough: true,
    index: false,
    redirect: false,
  })
);
app.use('/api/music', musicRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`YourDay API 已启动 → http://localhost:${PORT}`);
});
