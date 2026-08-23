import type { TodoNoteImage } from '../types';
import { http } from './http';

const BASE = '/api/todo-attachments';

/**
 * 上传一张图片，返回数据库记录 + url。
 * 之后把返回的 id 通过 `![todo-img:ID](caption)` 嵌入到 todo 的 note 中。
 */
export const todoAttachmentsApi = {
  upload: async (file: File): Promise<TodoNoteImage> => {
    const fd = new FormData();
    fd.append('file', file);
    return http<TodoNoteImage>(BASE, { method: 'POST', body: fd });
  },

  remove: async (id: number): Promise<void> => {
    await http<void>(`${BASE}/${id}`, { method: 'DELETE' });
  },
};