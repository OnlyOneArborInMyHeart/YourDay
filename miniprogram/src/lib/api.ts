import Taro from '@tarojs/taro';

// 由 config/index.ts 的 defineConstants 注入。
declare const __API_BASE__: string;
export const API_BASE: string =
  (typeof __API_BASE__ !== 'undefined' && __API_BASE__) || 'https://api.yourday.app';

const TOKEN_KEY = 'yd-token';

export function getToken(): string | null {
  try { return Taro.getStorageSync(TOKEN_KEY) || null; } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? Taro.setStorageSync(TOKEN_KEY, t) : Taro.removeStorageSync(TOKEN_KEY); } catch { /* ignore */ }
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
  const res = await Taro.request({
    url: fullUrl,
    method,
    header: headers,
    data: body,
    // 小程序最大 60s
    timeout: 60000,
  });
  if (res.statusCode >= 400) {
    const err: ApiError = Object.assign(new Error('request failed'), {
      status: res.statusCode,
      payload: res.data,
    });
    if (res.statusCode === 401) {
      setToken(null);
    }
    throw err;
  }
  return res.data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown, auth = true) => request<T>('POST', url, body, { auth }),
  put: <T,>(url: string, body?: unknown, auth = true) => request<T>('PUT', url, body, { auth }),
  patch: <T,>(url: string, body?: unknown, auth = true) => request<T>('PATCH', url, body, { auth }),
  del: <T,>(url: string) => request<T>('DELETE', url),
};

// ===== wxlogin =====
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
export async function wxLogin(code: string, creds?: { username: string; password: string }) {
  return api.post<WxLoginBound | WxLoginNeedBind>(
    '/api/auth/wxlogin',
    { code, ...creds },
    /* auth */ false
  );
}