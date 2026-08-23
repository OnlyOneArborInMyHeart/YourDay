import { useEffect, useState } from 'react';
import Today from './pages/Today';
import DiaryList from './pages/DiaryList';
import Login from './pages/Login';
import BindAccount from './pages/BindAccount';
import { getToken } from './lib/api';

type Route = { name: 'today' } | { name: 'diary' } | { name: 'login' } | { name: 'bind' };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  switch (h) {
    case 'diary': return { name: 'diary' };
    case 'login': return { name: 'login' };
    case 'bind': return { name: 'bind' };
    default: return { name: 'today' };
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goto = (r: Route) => {
    const path = r.name === 'today' ? '/' : `/${r.name}`;
    window.location.hash = path;
  };

  // 未登录则强制跳登录页
  useEffect(() => {
    if (!authed && route.name !== 'login' && route.name !== 'bind') {
      goto({ name: 'login' });
    }
    if (authed && route.name === 'login') {
      goto({ name: 'today' });
    }
  }, [authed, route]);

  const titles: Record<Route['name'], string> = {
    today: 'YourDay · 今日',
    diary: 'YourDay · 日记',
    login: 'YourDay · 登录',
    bind: 'YourDay · 绑定账号',
  };
  const showBack = route.name === 'bind';

  return (
    <>
      <header className="app-bar">
        {showBack ? (
          <button className="app-bar__back" onClick={() => goto({ name: 'login' })}>
            ← 返回
          </button>
        ) : <span style={{ width: 60 }} />}
        <span>{titles[route.name]}</span>
        <span style={{ width: 60 }} />
      </header>

      <div className="preview-banner">
        浏览器预览模式 — 数据来自本地后端 http://localhost:3001
      </div>

      {route.name === 'today' && <Today onLogout={() => { localStorage.removeItem('yd-token'); setAuthed(false); }} />}
      {route.name === 'diary' && <DiaryList />}
      {route.name === 'login' && <Login onLogin={() => setAuthed(true)} />}
      {route.name === 'bind' && <BindAccount onBound={() => setAuthed(true)} />}

      {authed && route.name !== 'login' && route.name !== 'bind' && (
        <nav className="tabbar">
          <div
            className={`tabbar__item ${route.name === 'today' ? 'tabbar__item--active' : ''}`}
            onClick={() => goto({ name: 'today' })}
          >
            <span className="tabbar__icon">📅</span>
            今日
          </div>
          <div
            className={`tabbar__item ${route.name === 'diary' ? 'tabbar__item--active' : ''}`}
            onClick={() => goto({ name: 'diary' })}
          >
            <span className="tabbar__icon">📔</span>
            日记
          </div>
        </nav>
      )}
    </>
  );
}