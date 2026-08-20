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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const diariesApi = {
  get: (date: string) => request<Diary>(`${BASE}/${date}`),
  listRange: (from: string, to: string) =>
    request<Diary[]>(`${BASE}?from=${from}&to=${to}`),
  upsert: (date: string, body: { title?: string; markdown_content?: string }) =>
    request<Diary>(`${BASE}/${date}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (date: string) =>
    request<void>(`${BASE}/${date}`, { method: 'DELETE' }),
  listAttachments: (date: string) =>
    request<DiaryAttachment[]>(`${BASE}/${date}/attachments`),
};
