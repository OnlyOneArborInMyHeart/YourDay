import { useState } from 'react';
import { api, setToken, mockWxLoginCode, type WxLoginBound } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('123456');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** 用账号密码登录 —— 直接走 /api/auth/login */
  async function loginWithAccount() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ user: { id: number; username: string }; token: string }>(
        '/api/auth/login',
        { username, password },
        /* auth */ false
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

  /**
   * 模拟 wx.login → wxlogin 流程
   * 后端如果配了 WX_APPID/WX_SECRET 会真去调 code2Session；
   * 没配会返 503。前端在浏览器里走"密码登录"分支更稳。
   */
  async function mockWxLogin() {
    setBusy(true);
    setErr(null);
    try {
      const code = mockWxLoginCode();
      const result = await api.post('/api/auth/wxlogin', { code }, false);
      if ('bound' in result) {
        setToken((result as WxLoginBound).token);
        onLogin();
      } else {
        setErr('此微信号尚未绑定账号（请使用账号密码登录）');
      }
    } catch (e: any) {
      const msg = e?.payload?.error || e?.message || '微信登录失败';
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
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          placeholder="默认 root / 123456"
        />
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

      <button
        className="auth-page__btn auth-page__btn--secondary"
        disabled={busy}
        onClick={mockWxLogin}
        style={{ marginTop: 8 }}
      >
        微信一键登录（模拟）
      </button>

      {err && <div className="auth-page__msg">{err}</div>}

      <p style={{ color: '#8a93a6', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
        这是浏览器预览模式，正式小程序体验请用"微信开发者工具"打开 miniprogram/dist
      </p>
    </div>
  );
}