/**
 * 统一 fetch 工具：自动注入 Authorization、处理 401 跳转。
 *
 * 设计要点：
 * - 后端所有业务接口都需要 JWT（除 /api/auth/* 公开）；
 *   http.ts 内不区分业务与认证，由调用方传不传 Authorization 决定。
 * - 401/403 任意一个发生：清掉本地 yd-token，并通过自定义事件
 *   通知 AuthContext 跳转 /login（避免此处直接 import React 依赖）。
 * - 多个 http 实例可同时存在（每个调用互不污染）。
 */

const TOKEN_KEY = 'yd-token';

let _onUnauthorized: (() => void) | null = null;

/**
 * 由 AuthContext 在挂载时注入。401 时由 http 工具回调，
 * 实现"token 失效 → 自动跳 /login"的全局行为。
 */
export function setUnauthorizedHandler(fn: () => void): void {
  _onUnauthorized = fn;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token == null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export class HttpError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  /** JSON body；若传 FormData 则自动不设 Content-Type */
  body?: unknown;
  headers?: Record<string, string>;
  /** 显式不附加 Authorization（默认附上 token） */
  noAuth?: boolean;
  /** 是否吞掉 401 跳转（用于登录/注册/找回等页面） */
  silent401?: boolean;
}

/**
 * 包装 fetch：
 * - 自动拼接相对路径到当前 origin
 * - 注入 Authorization: Bearer <token>
 * - JSON body 自动序列化 + 头；FormData 不动
 * - 非 2xx 抛 HttpError，message 优先取后端返回的 { error }
 */
export async function http<T = unknown>(
  url: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, noAuth = false, silent401 = false } = opts;

  const finalHeaders: Record<string, string> = { ...headers };
  let finalBody: BodyInit | undefined;

  if (body instanceof FormData) {
    finalBody = body;
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    finalBody = JSON.stringify(body);
  }

  if (!noAuth) {
    const token = getToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = url.startsWith('http') ? url : url;
  const res = await fetch(fullUrl, { method, headers: finalHeaders, body: finalBody });

  if (res.status === 401 || res.status === 403) {
    if (!silent401) {
      // 清 token，触发跳转
      setToken(null);
      if (_onUnauthorized) {
        try {
          _onUnauthorized();
        } catch (e) {
          console.warn('[http] unauthorized handler threw', e);
        }
      } else {
        // 没注册 handler 时，给个兜底：用 location 强制跳
        try {
          if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
            window.location.assign('/login');
          }
        } catch {
          /* ignore */
        }
      }
    }
    const data = await res.json().catch(() => ({}));
    throw new HttpError(res.status, (data as { error?: string })?.error || `请求失败 (${res.status})`, data);
  }

  if (res.status === 204) return undefined as T;

  // 文本响应也允许（如 music/lyrics）—— 尝试按 JSON 解析，失败就返回原始文本
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpError(
        res.status,
        (data as { error?: string })?.error || `请求失败 (${res.status})`,
        data,
      );
    }
    return data as T;
  }

  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, text || `请求失败 (${res.status})`, text);
  }
  return text as unknown as T;
}

/**
 * 便捷：从 JSON 响应里剥一层 `data` —— 当前后端都直接吐数组/对象，
 * 这里为兼容而保留空操作；后续如统一加 `{ data, meta }` 包装再启用。
 */
export async function httpJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  return http<T>(url, opts);
}