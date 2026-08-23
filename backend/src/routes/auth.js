import { Router } from 'express';
import * as bcryptNs from 'bcryptjs';
import db from '../db.js';
import {
  signAuthToken,
  signResetToken,
  verifyToken,
  verifyTokenRaw,
} from '../middleware/auth.js';

const bcrypt = bcryptNs.default || bcryptNs;
const router = Router();

const MIN_USERNAME = 2;
const MAX_USERNAME = 32;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const MAX_ANSWER = 80;
const MAX_QUESTION = 120;

// 安全问题题库（注册/找回页可下拉选择；自定义标题可填空）
export const SECURITY_QUESTIONS = [
  '你的第一个宠物叫什么名字？',
  '你小学最好的朋友叫什么？',
  '你母亲的名字是什么？',
  '你出生的城市是？',
  '你最喜欢的老师姓什么？',
  '你的童年外号是什么？',
  '自定义（请在下方填写具体问题）',
];

function badInput(msg) {
  return { ok: false, msg };
}

function normalizeUsername(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * 公共校验：username + password + 安全问题
 */
function validateSignup({ username, password, security_question, security_answer }) {
  const uname = normalizeUsername(username);
  const pwd = typeof password === 'string' ? password : '';
  const q = typeof security_question === 'string' ? security_question.trim() : '';
  const a = typeof security_answer === 'string' ? security_answer.trim() : '';

  if (uname.length < MIN_USERNAME || uname.length > MAX_USERNAME) {
    return badInput(`用户名长度需在 ${MIN_USERNAME}–${MAX_USERNAME} 字符之间`);
  }
  if (!/^[A-Za-z0-9_\-.]+$/.test(uname)) {
    return badInput('用户名只允许字母、数字、下划线、点、连字符');
  }
  if (pwd.length < MIN_PASSWORD || pwd.length > MAX_PASSWORD) {
    return badInput(`密码长度需在 ${MIN_PASSWORD}–${MAX_PASSWORD} 字符之间`);
  }
  if (!q || q.length > MAX_QUESTION) {
    return badInput('请选择一个安全问题');
  }
  if (!a || a.length < 1 || a.length > MAX_ANSWER) {
    return badInput(`安全答案长度需在 1–${MAX_ANSWER} 字符之间`);
  }
  return { ok: true, value: { uname, pwd, q, a } };
}

/**
 * POST /api/auth/signup
 */
router.post('/signup', (req, res) => {
  const v = validateSignup(req.body || {});
  if (!v.ok) return res.status(400).json({ error: v.msg });
  const { uname, pwd, q, a } = v.value;

  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (exist) return res.status(409).json({ error: '该用户名已被注册' });

  const password_hash = bcrypt.hashSync(pwd, 10);
  const security_answer_hash = bcrypt.hashSync(a.toLowerCase(), 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, security_question, security_answer_hash)
       VALUES (?, ?, ?, ?)`
    )
    .run(uname, password_hash, q, security_answer_hash);
  const user = { id: Number(info.lastInsertRowid), username: uname };
  res.status(201).json({
    user: { id: user.id, username: user.username },
    token: signAuthToken(user),
  });
});

/**
 * POST /api/auth/login
 */
router.post('/login', (req, res) => {
  const uname = normalizeUsername(req.body?.username);
  const pwd = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!uname || !pwd) return res.status(400).json({ error: '用户名与密码不能为空' });

  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(uname);
  if (!row) return res.status(401).json({ error: '用户名或密码错误' });
  if (!bcrypt.compareSync(pwd, row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const user = { id: row.id, username: row.username };
  res.json({
    user: { id: user.id, username: user.username },
    token: signAuthToken(user),
  });
});

/**
 * GET /api/auth/me  —— 当前 token 对应账号信息
 */
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } });
});

/**
 * POST /api/auth/forgot-question  —— 提交用户名，返回其安全问题（用于找回步骤 1）
 */
router.post('/forgot-question', (req, res) => {
  const uname = normalizeUsername(req.body?.username);
  if (!uname) return res.status(400).json({ error: '请提供用户名' });
  const row = db
    .prepare('SELECT id, username, security_question FROM users WHERE username = ?')
    .get(uname);
  // 即便找不到用户也返回 200 + 空答案，避免暴露账号是否存在
  // 但前端要看到 question 才能填；为了让真实用户能用，这里返回 404
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json({ username: row.username, question: row.security_question });
});

/**
 * POST /api/auth/forgot-verify  —— 提交安全答案 → 校验通过则签发一次性重置 token
 */
router.post('/forgot-verify', (req, res) => {
  const uname = normalizeUsername(req.body?.username);
  const ans = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
  if (!uname || !ans) return res.status(400).json({ error: '用户名与答案不能为空' });
  const row = db
    .prepare(
      'SELECT id, username, security_answer_hash FROM users WHERE username = ?'
    )
    .get(uname);
  if (!row || !row.security_answer_hash) {
    return res.status(401).json({ error: '验证失败' });
  }
  // 答案以小写比较（兼容中文/英文），忽略首尾空格
  const ok = bcrypt.compareSync(ans.toLowerCase(), row.security_answer_hash);
  if (!ok) return res.status(401).json({ error: '答案错误' });

  const user = { id: row.id, username: row.username };
  res.json({
    user: { id: user.id, username: user.username },
    resetToken: signResetToken(user),
  });
});

/**
 * POST /api/auth/reset-password  —— 通过 resetToken 重置为新密码
 */
router.post('/reset-password', (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body || {};
  if (!resetToken) return res.status(400).json({ error: '缺少 resetToken' });
  const pwd = typeof newPassword === 'string' ? newPassword : '';
  const cfm = typeof confirmPassword === 'string' ? confirmPassword : '';
  if (pwd.length < MIN_PASSWORD || pwd.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `新密码长度需在 ${MIN_PASSWORD}–${MAX_PASSWORD} 字符之间` });
  }
  if (pwd !== cfm) return res.status(400).json({ error: '两次输入的密码不一致' });

  const payload = verifyTokenRaw(resetToken);
  if (!payload || payload.scope !== 'reset' || !payload.uid) {
    return res.status(400).json({ error: '重置链接无效或已过期，请重新发起' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.uid);
  if (!exists) return res.status(404).json({ error: '账号不存在' });

  const hash = bcrypt.hashSync(pwd, 10);
  db.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(hash, payload.uid);
  res.json({ ok: true });
});

/**
 * POST /api/auth/change-password  —— 已登录账号修改密码（需提供旧密码）
 */
router.post('/change-password', verifyToken, (req, res) => {
  const oldPwd = typeof req.body?.oldPassword === 'string' ? req.body.oldPassword : '';
  const newPwd = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!oldPwd || !newPwd) {
    return res.status(400).json({ error: '请提供旧密码与新密码' });
  }
  if (newPwd.length < MIN_PASSWORD || newPwd.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `新密码长度需在 ${MIN_PASSWORD}–${MAX_PASSWORD} 字符之间` });
  }
  if (oldPwd === newPwd) {
    return res.status(400).json({ error: '新密码不能与旧密码相同' });
  }
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.userId);
  if (!row) return res.status(404).json({ error: '账号不存在' });
  if (!bcrypt.compareSync(oldPwd, row.password_hash)) {
    return res.status(401).json({ error: '旧密码错误' });
  }
  const hash = bcrypt.hashSync(newPwd, 10);
  db.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(hash, req.userId);
  res.json({ ok: true });
});

/**
 * GET /api/auth/security-questions —— 题库（前端注册/找回页下拉用）
 */
router.get('/security-questions', (_req, res) => {
  res.json({ questions: SECURITY_QUESTIONS });
});

export default router;
