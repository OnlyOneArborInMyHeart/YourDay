import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminApi,
  clearAdminToken,
  type AdminOverview,
  type AdminUser,
  type ManagedUser,
} from '../api/admin';
import './admin.css';

const EMPTY_OVERVIEW: AdminOverview = {
  totalUsers: 0,
  totalEvents: 0,
  totalTodos: 0,
  totalDiaries: 0,
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const [currentAdmin, nextOverview, nextUsers] = await Promise.all([
        adminApi.me(),
        adminApi.overview(),
        adminApi.users(q),
      ]);
      setAdmin(currentAdmin);
      setOverview(nextOverview);
      setUsers(nextUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      if (!localStorage.getItem('yd-admin-token')) navigate('/admin/login', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(query.trim());
  }

  function logout() {
    clearAdminToken();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-brand">🛡️ YourDay Admin</div>
          <p>系统运行与用户数据概览</p>
        </div>
        <div className="admin-header__actions">
          <span>{admin?.username ?? '管理员'}</span>
          <button type="button" onClick={logout}>退出</button>
        </div>
      </header>

      <main className="admin-main">
        {error && <div className="admin-alert">{error}</div>}

        <section className="admin-stats" aria-label="数据概览">
          <article><span>普通用户</span><strong>{overview.totalUsers}</strong><small>已注册账号</small></article>
          <article><span>日程事件</span><strong>{overview.totalEvents}</strong><small>全部用户</small></article>
          <article><span>待办事项</span><strong>{overview.totalTodos}</strong><small>全部用户</small></article>
          <article><span>日记记录</span><strong>{overview.totalDiaries}</strong><small>全部用户</small></article>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__heading">
            <div>
              <h2>用户数据</h2>
              <p>最多显示 200 个账号，可按用户名搜索。</p>
            </div>
            <form className="admin-search" onSubmit={onSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索用户名"
                aria-label="搜索用户名"
              />
              <button disabled={loading}>{loading ? '加载中' : '搜索'}</button>
            </form>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>注册时间</th>
                  <th>微信绑定</th>
                  <th>日程</th>
                  <th>待办</th>
                  <th>日记</th>
                </tr>
              </thead>
              <tbody>
                {!loading && users.length === 0 && (
                  <tr><td colSpan={6} className="admin-empty">没有匹配的用户</td></tr>
                )}
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong><small>ID {user.id}</small></td>
                    <td>{formatDate(user.created_at)}</td>
                    <td><span className={`admin-badge ${user.wx_bound_at ? 'is-bound' : ''}`}>
                      {user.wx_bound_at ? '已绑定' : '未绑定'}
                    </span></td>
                    <td>{user.event_count}</td>
                    <td>{user.todo_count}</td>
                    <td>{user.diary_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
