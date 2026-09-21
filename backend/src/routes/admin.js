import { Router } from 'express';
import * as bcryptNs from 'bcryptjs';
import db from '../db.js';
import { signAdminToken, verifyAdminToken } from '../middleware/auth.js';

const bcrypt = bcryptNs.default || bcryptNs;
const router = Router();

router.post('/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ error: '管理员账号和密码不能为空' });
  }

  const admin = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? AND is_admin = 1')
    .get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: '管理员账号或密码错误' });
  }

  const user = { id: admin.id, username: admin.username };
  return res.json({ user, token: signAdminToken(user) });
});

router.get('/me', verifyAdminToken, (req, res) => {
  res.json({ user: { id: req.adminId, username: req.adminUsername } });
});

router.get('/overview', verifyAdminToken, (_req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 0').get().count;
  const totalEvents = db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  const totalTodos = db.prepare('SELECT COUNT(*) AS count FROM todos').get().count;
  const totalDiaries = db.prepare('SELECT COUNT(*) AS count FROM diary_entries').get().count;
  res.json({ totalUsers, totalEvents, totalTodos, totalDiaries });
});

router.get('/users', verifyAdminToken, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const pattern = `%${q}%`;
  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.created_at,
      u.updated_at,
      u.wx_bound_at,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) AS event_count,
      (SELECT COUNT(*) FROM todos t WHERE t.user_id = u.id) AS todo_count,
      (SELECT COUNT(*) FROM diary_entries d WHERE d.user_id = u.id) AS diary_count
    FROM users u
    WHERE u.is_admin = 0 AND (? = '' OR u.username LIKE ?)
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 200
  `).all(q, pattern);
  res.json({ users });
});

export default router;
