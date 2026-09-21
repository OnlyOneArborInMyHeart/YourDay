import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './auth.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('用户名和密码不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from || '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page auth-page--sakura">
      <div className="sakura-fall" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span
            className="sakura-petal"
            key={index}
            style={{
              '--petal-x': `${(index * 37 + 7) % 100}%`,
              '--petal-delay': `${-(index * 0.91)}s`,
              '--petal-duration': `${7.5 + (index % 6) * 1.25}s`,
              '--petal-drift-mid': `${index % 2 === 0 ? 58 : -58}px`,
              '--petal-drift-end': `${index % 3 === 0 ? -34 : 42}px`,
              '--petal-size': `${12 + (index % 5) * 2.4}px`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="auth-page__card auth-page__card--sakura">
        <div className="auth-page__brand">
          <span className="auth-page__brand-mark" aria-hidden="true" />
          <span>YourDay</span>
        </div>
        <h1 className="auth-page__title">登录</h1>
        <p className="auth-page__subtitle">登录以管理你的事件、日记与待办。</p>
        <form className="auth-form" onSubmit={onSubmit}>
          {error && <div className="auth-form__error">{error}</div>}
          <label className="auth-form__label">
            用户名
            <input
              className="auth-form__input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={submitting}
            />
          </label>
          <label className="auth-form__label">
            密码
            <input
              className="auth-form__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </label>
          <button className="auth-form__button" type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
        <div className="auth-form__footer">
          没有账号？
          <Link to="/signup" className="auth-form__link">立即注册</Link>
          <Link to="/forgot-password" className="auth-form__link">忘记密码？</Link>
        </div>
        <p className="auth-form__legal">
          <Link to="/terms" className="auth-form__link">用户服务协议</Link>
          <span aria-hidden> · </span>
          <Link to="/privacy" className="auth-form__link">隐私政策</Link>
        </p>
        <div className="auth-form__admin-entry">
          <Link to="/admin/login" className="auth-form__admin-link">
            🛡️ 管理员入口
          </Link>
        </div>
      </div>
    </div>
  );
}
