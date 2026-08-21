import type { TodoNoteImage } from '../types';

const BASE = '/api/todo-attachments';

/**
 * 上传一张图片，返回数据库记录 + url。
 * 之后把返回的 id 通过 `![todo-img:ID](caption)` 嵌入到 todo 的 note 中。
 */
export const todoAttachmentsApi = {
  upload: async (file: File): Promise<TodoNoteImage> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(BASE, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `上传失败 (${res.status})`);
    }
    return data as TodoNoteImage;
  },

  remove: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (res.status === 204) return;
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `删除失败 (${res.status})`);
  },
};