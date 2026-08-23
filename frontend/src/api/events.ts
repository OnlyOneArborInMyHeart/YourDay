import type { Event, EventPatch } from '../types';
import { http } from './http';

const BASE = '/api/events';

/**
 * 后端事件 payload → 前端 Event：
 * - 后端用 snake_case（is_todo 0/1、background_image_id），前端用 camelCase（isTodo boolean、background_image object）。
 * - 旧版前端代码依赖这个规范化，所以放在这里集中处理。
 */
function normalizeEvent(raw: unknown): Event {
  if (!raw || typeof raw !== 'object') return raw as Event;
  const r = raw as Record<string, unknown> & {
    background_image?: unknown;
    background_image_id?: unknown;
  };
  const { background_image_id, ...rest } = r as Record<string, unknown>;
  return {
    ...(rest as unknown as Event),
    isTodo: !!(rest.is_todo),
    background_image: (r.background_image ?? null) as Event['background_image'],
  };
}

async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const value = await http<T>(url, {
    method: init?.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined,
    body: init?.body,
  });
  return value;
}

function normalizeList<T>(data: T | T[]): T[] | T {
  if (Array.isArray(data)) return (data as unknown[]).map(normalizeEvent) as T[];
  return normalizeEvent(data) as T;
}

export const eventsApi = {
  listByDate: async (date: string): Promise<Event[]> => {
    const data = await request<unknown>(`${BASE}?date=${date}`);
    return (normalizeList(data) as unknown as Event[]) ?? [];
  },
  listRange: async (from: string, to: string): Promise<Event[]> => {
    const data = await request<unknown>(`${BASE}?from=${from}&to=${to}`);
    return (normalizeList(data) as unknown as Event[]) ?? [];
  },
  create: (draft: EventPatch) => {
    const body: Record<string, unknown> = { ...draft };
    if ('isTodo' in body) {
      body.is_todo = draft.isTodo ? 1 : 0;
      delete body.isTodo;
    }
    return request<Event>(BASE, { method: 'POST', body }).then(normalizeEvent);
  },
  update: (id: number, patch: EventPatch) => {
    const body: Record<string, unknown> = { ...patch };
    if ('isTodo' in body) {
      body.is_todo = patch.isTodo ? 1 : 0;
      delete body.isTodo;
    }
    return request<Event>(`${BASE}/${id}`, { method: 'PUT', body }).then(normalizeEvent);
  },
  remove: (id: number) => request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggleDone: (id: number, done: boolean) =>
    request<Event>(`${BASE}/${id}`, {
      method: 'PUT',
      body: { done: done ? 1 : 0 },
    }).then(normalizeEvent),
};
