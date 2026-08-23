import type { Todo, TodoDraft, TodoPatch } from '../types';
import { http } from './http';

const BASE = '/api/todos';

export interface TodoListQuery {
  done?: boolean;
  priority?: 1 | 2 | 3;
  q?: string;
}

export const todosApi = {
  list: async (query: TodoListQuery = {}): Promise<Todo[]> => {
    const params = new URLSearchParams();
    if (query.done !== undefined) params.set('done', query.done ? '1' : '0');
    if (query.priority !== undefined) params.set('priority', String(query.priority));
    if (query.q && query.q.trim()) params.set('q', query.q.trim());
    const qs = params.toString();
    const data = await http<unknown>(`${BASE}${qs ? `?${qs}` : ''}`);
    return Array.isArray(data) ? (data as Todo[]) : [];
  },
  get: (id: number) => http<Todo>(`${BASE}/${id}`),
  create: (draft: TodoDraft) =>
    http<Todo>(BASE, { method: 'POST', body: draft }),
  update: (id: number, patch: TodoPatch) =>
    http<Todo>(`${BASE}/${id}`, { method: 'PUT', body: patch }),
  remove: (id: number) => http<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  toggle: (id: number) =>
    http<Todo>(`${BASE}/${id}/toggle`, { method: 'PATCH' }),
};