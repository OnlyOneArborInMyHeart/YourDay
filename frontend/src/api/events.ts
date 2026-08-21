import type { Event, EventPatch } from '../types';

const BASE = '/api/events';

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
  // 后端用 is_todo (0/1)，前端用 isTodo (boolean)，统一转换
  if (Array.isArray(data)) {
    return data.map(normalizeEvent) as T;
  }
  return normalizeEvent(data) as T;
}

function normalizeEvent(raw: unknown): Event {
  if (!raw || typeof raw !== 'object') return raw as Event;
  const r = raw as Record<string, unknown>;
  return {
    ...r,
    isTodo: !!(r.is_todo),
  } as Event;
}

export const eventsApi = {
  listByDate: async (date: string) => {
    const data = await request<unknown>(`${BASE}?date=${date}`);
    return Array.isArray(data) ? (data as Event[]) : [];
  },
  listRange: async (from: string, to: string) => {
    const data = await request<unknown>(`${BASE}?from=${from}&to=${to}`);
    return Array.isArray(data) ? (data as Event[]) : [];
  },
  create: (draft: EventPatch) => {
    // 后端字段名是 is_todo，转写一下
    const body: Record<string, unknown> = { ...draft };
    if ('isTodo' in body) {
      body.is_todo = draft.isTodo ? 1 : 0;
      delete body.isTodo;
    }
    return request<Event>(BASE, { method: 'POST', body: JSON.stringify(body) });
  },
  update: (id: number, patch: EventPatch) => {
    const body: Record<string, unknown> = { ...patch };
    if ('isTodo' in body) {
      body.is_todo = patch.isTodo ? 1 : 0;
      delete body.isTodo;
    }
    return request<Event>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  remove: (id: number) => request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggleDone: (id: number, done: boolean) =>
    request<Event>(`${BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ done: done ? 1 : 0 }),
    }),
};
