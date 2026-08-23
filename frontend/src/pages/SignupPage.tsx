import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import './auth.css';

const DEFAULT_QUESTIONS = [
  '你的第一个宠物叫什么名字？',
  '你小学最好的朋友叫什么？',
  '你母亲的名字是什么？',
  '你出生的城市是？',
  '你最喜欢的老师姓什么？',
  '你的童年外号是什么？',
  '__custom__',
];

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [question, setQuestion] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 拉取后端题库（仅用于刷新；失败就保留默认列表）
    http<{ questions: string[] }>('/api/auth/security-questions', {
      noAuth: true,
      silent401: true,
    })
      .then((d) => {
        if (Array.isArray(d?.questions) && d.questions.length > 0) {
          setQuestions([...d.questions, '__custom__']);
        }
      })
      .catch(() => { /* 保留默认值 */ });
  }, []);

  const isCustom = question === '__custom__';
  const finalQuestion = isCustom ? customQuestion.trim() : question;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (username.length < 2) return setError('用户名至少 2 个字符');
    if (password.length < 6) return setError('密码至少 6 个字符');
    if (password !== confirm) return setError('两次密码不一致');
    if (!finalQuestion) return setError('请选择或填写安全问题');
    if (!answer.trim()) return setError('请填写安全答案');

    setSubmitting(true);
    try {
      await signup({
        username: username.trim(),
        password,
        security_question: finalQuestion,
        security_answer: answer.trim(),
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
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
        <h1 className="auth-page__title">注册账号</h1>
        <p className="auth-page__subtitle">创建一个新的 YourDay 账号，立刻拥有独立空间。</p>
        <form className="auth-form" onSubmit={onSubmit}>
          {error && <div className="auth-form__error">{error}</div>}
          <label className="auth-form__label">
            用户名（2–32 字符，字母/数字/下划线/点/连字符）
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
            密码（至少 6 个字符）
            <input
              className="auth-form__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="auth-form__label">
            再次输入密码
            <input
              className="auth-form__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="auth-form__label">
            安全问题（用于找回密码）
            <select
              className="auth-form__select"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={submitting}
            >
              <option value="" disabled>请选择</option>
              {questions.map((q) => (
                <option key={q} value={q === '__custom__' ? '__custom__' : q}>
                  {q === '__custom__' ? '自定义（请在下方填写具体问题）' : q}
                </option>
              ))}
            </select>
            {isCustom && (
              <input
                className={`auth-form__input ${'auth-form__custom-question'}`}
                type="text"
                placeholder="输入你的安全问题"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                disabled={submitting}
              />
            )}
          </label>
          <label className="auth-form__label">
            安全答案（找回密码时填写，不区分大小写）
            <input
              className="auth-form__input"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting}
            />
          </label>
          <button className="auth-form__button" type="submit" disabled={submitting}>
            {submitting ? '注册中…' : '注册并登录'}
          </button>
          <p className="auth-form__hint">你的账号与数据完全独立，请妥善记住密码与安全答案。</p>
        </form>
        <div className="auth-form__footer">
          已有账号？
          <Link to="/login" className="auth-form__link">直接登录</Link>
        </div>
      </div>
    </div>
  );
}