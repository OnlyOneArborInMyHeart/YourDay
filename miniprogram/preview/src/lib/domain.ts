import { api, uploadFile } from './api';
import type {
  Event, EventDraft, EventPatch,
  Todo, TodoDraft, TodoPatch,
  Diary, DiaryAttachment,
  MusicTrack,
} from './types';

// ========== events ==========
export const eventsApi = {
  listByDate: (date: string) => api.get<Event[]>(`/api/events?date=${date}`),
  listRange: (from: string, to: string) =>
    api.get<Event[]>(`/api/events?from=${from}&to=${to}`),
  create: (draft: EventDraft) => {
    const body = { ...draft, is_todo: draft.isTodo ? 1 : 0 };
    return api.post<Event>('/api/events', body);
  },
  update: (id: number, patch: EventPatch) => {
    const body: any = { ...patch };
    if ('isTodo' in body) {
      body.is_todo = body.isTodo ? 1 : 0;
      delete body.isTodo;
    }
    if ('done' in body) {
      body.done = body.done ? 1 : 0;
    }
    return api.put<Event>(`/api/events/${id}`, body);
  },
  toggleDone: (id: number, done: boolean) =>
    api.put<Event>(`/api/events/${id}`, { done: done ? 1 : 0 }),
  remove: (id: number) => api.del<void>(`/api/events/${id}`),
};

// ========== todos ==========
export const todosApi = {
  list: (q: { done?: boolean; priority?: 1 | 2 | 3; q?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.done !== undefined) p.set('done', q.done ? '1' : '0');
    if (q.priority !== undefined) p.set('priority', String(q.priority));
    if (q.q && q.q.trim()) p.set('q', q.q.trim());
    const qs = p.toString();
    return api.get<Todo[]>(`/api/todos${qs ? `?${qs}` : ''}`);
  },
  create: (draft: TodoDraft) => api.post<Todo>('/api/todos', draft),
  update: (id: number, patch: TodoPatch) => api.put<Todo>(`/api/todos/${id}`, patch),
  toggle: (id: number) => api.patch<Todo>(`/api/todos/${id}/toggle`),
  remove: (id: number) => api.del<void>(`/api/todos/${id}`),
};

// ========== diaries ==========
export const diariesApi = {
  get: (date: string) => api.get<Diary>(`/api/diaries/${date}`),
  listRange: (from: string, to: string) =>
    api.get<Diary[]>(`/api/diaries?from=${from}&to=${to}`),
  upsert: (date: string, body: { title?: string; markdown_content?: string }) =>
    api.put<Diary>(`/api/diaries/${date}`, body),
  remove: (date: string) => api.del<void>(`/api/diaries/${date}`),
  listAttachments: (date: string) =>
    api.get<DiaryAttachment[]>(`/api/diaries/${date}/attachments`),
  upload: (date: string, file: File) =>
    uploadFile<DiaryAttachment>(`/api/uploads/${date}`, file),
  removeAttachment: (id: number) => api.del<void>(`/api/uploads/${id}`),
};

// ========== themes ==========
export const themesApi = {
  listByDates: (dates: string[]) =>
    api.get<{ date: string; title: string }[]>(
      `/api/themes?dates=${encodeURIComponent(dates.join(','))}`
    ),
  listByDate: (date: string) =>
    api.get<{ date: string; title: string }[]>(`/api/themes?date=${date}`),
  upsert: (date: string, title: string) =>
    api.put<{ date: string; title: string }>(`/api/themes/${date}`, { title }),
  remove: (date: string) => api.del<void>(`/api/themes/${date}`),
};

// ========== music ==========
export const musicApi = {
  list: () => api.get<MusicTrack[]>('/api/music'),
  upload: (file: File) => uploadFile<MusicTrack>('/api/music', file),
  rename: (id: number, title: string) =>
    api.patch<MusicTrack>(`/api/music/${id}`, { title }),
  remove: (id: number) => api.del<void>(`/api/music/${id}`),
  uploadCover: (id: number, file: File) =>
    uploadFile<MusicTrack>(`/api/music/${id}/cover`, file),
  removeCover: (id: number) => api.del<void>(`/api/music/${id}/cover`),
  uploadLyrics: (id: number, lyrics: string) =>
    api.post<MusicTrack>(`/api/music/${id}/lyrics`, { lyrics }),
  removeLyrics: (id: number) => api.del<void>(`/api/music/${id}/lyrics`),
};