const ADMIN_TOKEN_KEY = 'yd-admin-token';

export interface AdminUser {
  id: number;
  username: string;
}

export interface AdminOverview {
  totalUsers: number;
  totalEvents: number;
  totalTodos: number;
  totalDiaries: number;
}

export interface ManagedUser {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
  wx_bound_at: string | null;
  event_count: number;
  todo_count: number;
  diary_count: number;
}

function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAdminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearAdminToken();
    throw new Error((data as { error?: string }).error || `请求失败 (${response.status})`);
  }
  return data as T;
}

export const adminApi = {
  async login(username: string, password: string): Promise<AdminUser> {
    const data = await adminRequest<{ user: AdminUser; token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    return data.user;
  },

  async me(): Promise<AdminUser> {
    const data = await adminRequest<{ user: AdminUser }>('/api/admin/me');
    return data.user;
  },

  overview(): Promise<AdminOverview> {
    return adminRequest('/api/admin/overview');
  },

  async users(q = ''): Promise<ManagedUser[]> {
    const data = await adminRequest<{ users: ManagedUser[] }>(
      `/api/admin/users?q=${encodeURIComponent(q)}`,
    );
    return data.users;
  },
};
