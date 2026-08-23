import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import eventsRouter from './routes/events.js';
import dayThemesRouter from './routes/dayThemes.js';
import todosRouter from './routes/todos.js';
import diariesRouter from './routes/diaries.js';
import uploadsRouter from './routes/uploads.js';
import eventBackgroundsRouter from './routes/eventBackgrounds.js';
import todoAttachmentsRouter from './routes/todoAttachments.js';
import musicRouter from './routes/music.js';
import authRouter from './routes/auth.js';
import { verifyToken } from './middleware/auth.js';
import { startCarryOverScheduler, runCarryOverNow } from './carryover.js';
import { runArchiveNow, archiveCompletedToYesterdayIfNewDay } from './diaryArchive.js';
import logger from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// 信任一层反代（后面挂 Caddy / nginx 时需要）
app.set('trust proxy', 1);

// ---- CORS 白名单 ----
// 小程序原生没有 Origin，按业内惯例对"无 Origin 的请求"放行（且仅放行安全方法）；
// Web 前端域名走白名单。ALLOWED_ORIGINS 用逗号分隔，例如：
//   ALLOWED_ORIGINS="https://yourday.app,https://www.yourday.app"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // 允许服务端到服务端 / 小程序 / curl
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) {
      // 未配置白名单时仅允许开发模式
      return cb(null, !isProd);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// 安全头（开 CSP 默认；前端用了内联 style，启用以避免破坏现有页面）。
app.use(
  helmet({
    contentSecurityPolicy: false, // SPA 静态资源由前端 vite 自管 CSP
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(compression());
app.use(express.json({ limit: '256kb' }));

// traceId：让前端报错 / 日志能对上
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

// ---- Rate limit ----
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'YourDay API' }));

// 认证路由（公开，但单独限流）
app.use('/api/auth', authLimiter, authRouter);

// 通用 API 限流
app.use('/api', apiLimiter);

// 所有业务路由需要先用 verifyToken 校验 JWT；后续路由内可使用 req.userId
app.use('/api/events', verifyToken, eventsRouter);
app.use('/api/themes', verifyToken, dayThemesRouter);
app.use('/api/todos', verifyToken, todosRouter);
app.use('/api/diaries', verifyToken, diariesRouter);

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
app.use('/api/uploads', verifyToken, uploadsRouter);
// 事件背景图（GET 文件走静态；其它走路由）
app.use(
  '/api/event-backgrounds',
  express.static(uploadsDir, {
    maxAge: '7d',
    fallthrough: true,
    index: false,
    redirect: false,
  })
);
app.use('/api/event-backgrounds', verifyToken, eventBackgroundsRouter);

// todo 备注内嵌图片：上传 → data/uploads/，通过 /api/todo-attachments/:filename 暴露。
// 静态托管放前面，使 GET 直接命中文件；router 仍处理 POST/GET 列表/DELETE。
app.use(
  '/api/todo-attachments',
  express.static(uploadsDir, {
    maxAge: '7d',
    fallthrough: true,
    index: false,
    redirect: false,
  })
);
app.use('/api/todo-attachments', verifyToken, todoAttachmentsRouter);

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
app.use('/api/music', verifyToken, musicRouter);

app.use((err, req, res, _next) => {
  // 详情进日志，用户侧只给通用文案 + traceId，方便客服查询
  req.log?.error({ err, traceId: req.id }, 'unhandled error');
  res.status(500).json({ error: '操作失败，请稍后重试', traceId: req.id });
});

app.listen(PORT, () => {
  logger.info({ port: PORT, env: NODE_ENV }, `YourDay API 已启动`);
  // 启动时立即跑一次跨日顺延（兜底：服务器刚启动就跨了多天）
  runCarryOverNow('startup');
  // 启动时也跑一次"昨日已完成"归档（兜底：重启瞬间跨过午夜）
  runArchiveNow('startup');
  // 启动每日 0 点的定时任务
  startCarryOverScheduler();
});
