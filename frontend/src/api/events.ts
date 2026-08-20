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
  return data as T;
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
  create: (draft: EventPatch) =>
    request<Event>(BASE, { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: number, patch: EventPatch) =>
    request<Event>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  remove: (id: number) => request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggleDone: (id: number, done: boolean) =>
    request<Event>(`${BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ done: done ? 1 : 0 }),
    }),
};
