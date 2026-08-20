import type { Todo, TodoDraft, TodoPatch } from '../types';

const BASE = '/api/todos';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export interface TodoListQuery {
  done?: boolean;
  priority?: 1 | 2 | 3;
  q?: string;
}

export const todosApi = {
  list: async (query: TodoListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.done !== undefined) params.set('done', query.done ? '1' : '0');
    if (query.priority !== undefined) params.set('priority', String(query.priority));
    if (query.q && query.q.trim()) params.set('q', query.q.trim());
    const qs = params.toString();
    const data = await request<unknown>(`${BASE}${qs ? `?${qs}` : ''}`);
    return Array.isArray(data) ? (data as Todo[]) : [];
  },
  get: (id: number) => request<Todo>(`${BASE}/${id}`),
  create: (draft: TodoDraft) =>
    request<Todo>(BASE, { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: number, patch: TodoPatch) =>
    request<Todo>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  remove: (id: number) => request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggle: (id: number) =>
    request<Todo>(`${BASE}/${id}/toggle`, { method: 'PATCH' }),
};