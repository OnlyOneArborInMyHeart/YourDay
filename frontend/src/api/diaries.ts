import { http } from './http';

const BASE = '/api/diaries';

export interface DiaryAttachment {
  id: number;
  date: string;
  kind: 'image' | 'video' | 'audio';
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  created_at: string;
  /** 上传后立即返回的访问 URL */
  url?: string;
}

export interface Diary {
  date: string;
  title: string;
  markdown_content: string;
  updated_at: string | null;
  attachments: DiaryAttachment[];
}

export const diariesApi = {
  get: (date: string) => http<Diary>(`${BASE}/${date}`),
  listRange: (from: string, to: string) =>
    http<Diary[]>(`${BASE}?from=${from}&to=${to}`),
  upsert: (date: string, body: { title?: string; markdown_content?: string }) =>
    http<Diary>(`${BASE}/${date}`, {
      method: 'PUT',
      body,
    }),
  remove: (date: string) =>
    http<void>(`${BASE}/${date}`, { method: 'DELETE' }),
  listAttachments: (date: string) =>
    http<DiaryAttachment[]>(`${BASE}/${date}/attachments`),
};