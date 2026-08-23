import type { DiaryAttachment } from './diaries';
import { http } from './http';

const BASE = '/api/uploads';

export const uploadsApi = {
  /**
   * 上传单个文件到指定日期；返回 attachment 记录 + url
   */
  upload: async (date: string, file: File): Promise<DiaryAttachment> => {
    const fd = new FormData();
    fd.append('file', file);
    return http<DiaryAttachment>(`${BASE}/${date}`, { method: 'POST', body: fd });
  },

  remove: async (id: number): Promise<void> => {
    await http<void>(`${BASE}/${id}`, { method: 'DELETE' });
  },

  /**
   * 文件的公开访问 URL（与上传后端返回的 url 字段一致）
   */
  url: (filename: string) => `${BASE}/${filename}`,
};