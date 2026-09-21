import { useState } from 'react';
import { api, setToken } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('123456');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loginWithAccount() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ user: { id: number; username: string }; token: string }>(
        '/api/auth/login',
        { username, password },
        false
      );
      setToken(r.token);
      onLogin();
    } catch (e: any) {
      const msg = e?.payload?.error || e?.message || '登录失败';
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">登录 YourDay</h1>

      <div className="auth-page__field">
        <label className="auth-page__label">用户名</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>

      <div className="auth-page__field">
        <label className="auth-page__label">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 位"
        />
      </div>

      <button className="auth-page__btn" disabled={busy} onClick={loginWithAccount}>
        {busy ? '登录中…' : '登录'}
      </button>

      {err && <div className="auth-page__msg">{err}</div>}

      <p className="auth-page__legal">
        浏览器预览模式 · 数据来自本地后端 http://localhost:3001
      </p>
    </div>
  );
}