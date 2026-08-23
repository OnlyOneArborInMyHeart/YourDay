// 浏览器版 API 客户端（不依赖 Taro）。
// 真实小程序里走 @tarojs/taro 的 Taro.request / Taro.getStorageSync / Taro.login；
// 这里直接用 fetch + localStorage，行为一致，方便在浏览器里调样式 / 调流程。

const API_BASE: string =
  (typeof __API_BASE__ !== 'undefined' && __API_BASE__) || '';
export { API_BASE };

const TOKEN_KEY = 'yd-token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export interface ApiError extends Error {
  status: number;
  payload?: unknown;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  opts: { auth?: boolean } = { auth: true }
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth !== false) {
    const tk = getToken();
    if (tk) headers.authorization = `Bearer ${tk}`;
  }
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    const err: ApiError = Object.assign(new Error(`HTTP ${res.status}`), {
      status: res.status,
      payload,
    });
    if (res.status === 401) setToken(null);
    throw err;
  }
  // 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown, auth = true) => request<T>('POST', url, body, { auth }),
  put: <T,>(url: string, body?: unknown, auth = true) => request<T>('PUT', url, body, { auth }),
  patch: <T,>(url: string, body?: unknown, auth = true) => request<T>('PATCH', url, body, { auth }),
  del: <T,>(url: string) => request<T>('DELETE', url),
};

// ===== 模拟 wxlogin =====
export interface WxLoginNeedBind {
  needBind: true;
  openid: string;
  unionid: string | null;
}
export interface WxLoginBound {
  bound: true;
  user: { id: number; username: string };
  token: string;
}

export async function wxLogin(
  code: string,
  creds?: { username: string; password: string }
) {
  return api.post<WxLoginBound | WxLoginNeedBind>(
    '/api/auth/wxlogin',
    { code, ...creds },
    /* auth */ false
  );
}

/** 浏览器里"假装"是 wx.login —— 后端没配 WX_APPID 时也能跑通流程 */
export function mockWxLoginCode(): string {
  // 26 位随机串，模拟微信 jscode
  return (
    'mock_' +
    Math.random().toString(36).slice(2, 14) +
    Math.random().toString(36).slice(2, 14)
  );
}