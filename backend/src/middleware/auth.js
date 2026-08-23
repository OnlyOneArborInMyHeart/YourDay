import jwt from 'jsonwebtoken';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yourday-dev-secret-change-me';
const TOKEN_TTL = '7d';
const RESET_TOKEN_TTL = '15m';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET 未设置，使用了默认值——生产环境务必设置。');
}

/**
 * 签发普通会话 token（含 userId / username）
 */
export function signAuthToken(user) {
  return jwt.sign(
    { uid: user.id, uname: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * 签发一次性"重置密码" token（scope: reset + 单次使用）
 */
export function signResetToken(user) {
  return jwt.sign(
    { uid: user.id, uname: user.username, scope: 'reset' },
    JWT_SECRET,
    { expiresIn: RESET_TOKEN_TTL }
  );
}

/**
 * 校验 token；返回 payload 或 null。错误不抛，方便调用方决定 HTTP 状态码。
 */
export function verifyTokenRaw(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 业务路由中间件：从 Authorization 头取出有效 token，把 user 信息挂到 req 上。
 */
export function verifyToken(req, res, next) {
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  const token = auth.slice(7).trim();
  const payload = verifyTokenRaw(token);
  if (!payload || !payload.uid) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
  // 兜底查一下 user 是否还存在（账号被删后旧 token 立刻失效）
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.uid);
  if (!user) {
    return res.status(401).json({ error: '账号不存在或已注销' });
  }
  req.userId = user.id;
  req.username = user.username;
  req.tokenPayload = payload;
  next();
}

/**
 * 重置密码专用中间件：要求 token 存在且 scope === 'reset'。
 * 校验成功后挂 req.resetUserId。
 */
export function verifyResetToken(req, res, next) {
  const token = (req.body && req.body.resetToken) || req.query.resetToken;
  if (!token) return res.status(400).json({ error: '缺少 resetToken' });
  const payload = verifyTokenRaw(token);
  if (!payload || payload.scope !== 'reset') {
    return res.status(400).json({ error: '重置链接无效或已过期' });
  }
  req.resetUserId = payload.uid;
  next();
}
