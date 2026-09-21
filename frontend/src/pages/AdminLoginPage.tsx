import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import './auth.css';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('管理员账号和密码不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.login(username.trim(), password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page auth-page--admin">
      <div className="auth-page__card">
        <div className="auth-page__brand">
          <span>🛡️</span>
          <span>YourDay 管理后台</span>
        </div>
        <h1 className="auth-page__title">管理员登录</h1>
        <p className="auth-page__subtitle">请使用管理员账号进入系统数据面板。</p>
        <form className="auth-form" onSubmit={onSubmit}>
          {error && <div className="auth-form__error">{error}</div>}
          <label className="auth-form__label">
            管理员账号
            <input
              className="auth-form__input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              disabled={submitting}
            />
          </label>
          <label className="auth-form__label">
            密码
            <input
              className="auth-form__input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </label>
          <button className="auth-form__button auth-form__button--admin" disabled={submitting}>
            {submitting ? '正在验证…' : '进入管理后台'}
          </button>
        </form>
        <div className="auth-form__footer">
          <Link to="/login" className="auth-form__link">返回用户登录</Link>
        </div>
      </div>
    </div>
  );
}
