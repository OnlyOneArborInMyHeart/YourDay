import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './auth.css';

type Step = 'username' | 'answer' | 'reset' | 'done';

interface QState {
  username: string;
  question: string;
}

export function ForgotPasswordPage() {
  const { forgotQuestion, verifyForgotAnswer, resetPassword } = useAuth();
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchQuestion(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    setSubmitting(true);
    try {
      const data = await forgotQuestion(username.trim());
      setQuestion(data.question || '（该账号未设置安全问题，请联系管理员重置）');
      setStep('answer');
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!answer.trim()) {
      setError('请填写安全答案');
      return;
    }
    setSubmitting(true);
    try {
      const token = await verifyForgotAnswer(username.trim(), answer.trim());
      setResetToken(token);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : '答案错误');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError('新密码至少 6 个字符');
    if (newPassword !== confirm) return setError('两次输入的密码不一致');
    if (!resetToken) return setError('请重新发起找回流程');
    setSubmitting(true);
    try {
      await resetPassword(resetToken, newPassword, confirm);
      setError(null);
      // 提示成功跳回登录
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <div className="auth-page__brand">
          <span>📅</span>
          <span>YourDay</span>
        </div>

        {step === 'username' && (
          <>
            <h1 className="auth-page__title">找回密码</h1>
            <p className="auth-page__subtitle">第一步：填写你的用户名，我们会取出对应的安全问题。</p>
            <form className="auth-form" onSubmit={fetchQuestion}>
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
              <button className="auth-form__button" type="submit" disabled={submitting}>
                {submitting ? '查询中…' : '下一步'}
              </button>
            </form>
          </>
        )}

        {step === 'answer' && (
          <>
            <h1 className="auth-page__title">第二步：回答安全问题</h1>
            <p className="auth-page__subtitle">
              用户名：<strong>{username}</strong>
            </p>
            <form className="auth-form" onSubmit={submitAnswer}>
              {error && <div className="auth-form__error">{error}</div>}
              <div className="auth-form__label">
                <span>安全问题</span>
                <div className="auth-form__input" style={{ background: '#f5f7fc', cursor: 'default' }}>
                  {question}
                </div>
              </div>
              <label className="auth-form__label">
                你的答案（不区分大小写）
                <input
                  className="auth-form__input"
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoFocus
                  disabled={submitting}
                />
              </label>
              <button className="auth-form__button" type="submit" disabled={submitting}>
                {submitting ? '验证中…' : '下一步'}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1 className="auth-page__title">第三步：设置新密码</h1>
            <p className="auth-page__subtitle">答案验证通过，请设置新的登录密码。</p>
            <form className="auth-form" onSubmit={submitReset}>
              {error && <div className="auth-form__error">{error}</div>}
              <label className="auth-form__label">
                新密码（至少 6 个字符）
                <input
                  className="auth-form__input"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  disabled={submitting}
                />
              </label>
              <label className="auth-form__label">
                再次输入新密码
                <input
                  className="auth-form__input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <button className="auth-form__button" type="submit" disabled={submitting}>
                {submitting ? '提交中…' : '重置密码'}
              </button>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="auth-page__title">密码已重置</h1>
            <p className="auth-page__subtitle">用新密码登录账号吧。</p>
            <Link to="/login" className="auth-form__button" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              去登录
            </Link>
          </>
        )}

        <div className="auth-form__footer">
          想起来了？<Link to="/login" className="auth-form__link">返回登录</Link>
        </div>
      </div>
    </div>
  );
}

export type { QState };