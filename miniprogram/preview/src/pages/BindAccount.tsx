import { useState } from 'react';
import { api, setToken, mockWxLoginCode, type WxLoginBound } from '../lib/api';

export default function BindAccount({ onBound }: { onBound: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setErr(null);
    try {
      const code = mockWxLoginCode();
      const result = await api.post('/api/auth/wxlogin', { code, username, password }, false);
      if ('bound' in result) {
        setToken((result as WxLoginBound).token);
        onBound();
      } else {
        setErr('绑定失败：账号校验未通过');
      }
    } catch (e: any) {
      setErr(e?.payload?.error || e?.message || '绑定失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">绑定已有账号</h1>

      <div className="auth-page__field">
        <label className="auth-page__label">YourDay 用户名</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
      </div>

      <div className="auth-page__field">
        <label className="auth-page__label">YourDay 密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button className="auth-page__btn" disabled={busy} onClick={onSubmit}>
        {busy ? '绑定中…' : '绑定并登录'}
      </button>
      {err && <div className="auth-page__msg">{err}</div>}
    </div>
  );
}