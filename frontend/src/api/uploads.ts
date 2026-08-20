import type { DiaryAttachment } from './diaries';

const BASE = '/api/uploads';

export const uploadsApi = {
  /**
   * 上传单个文件到指定日期；返回 attachment 记录 + url
   */
  upload: async (date: string, file: File): Promise<DiaryAttachment> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/${date}`, {
      method: 'POST',
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `上传失败 (${res.status})`);
    }
    return data as DiaryAttachment;
  },

  remove: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `删除失败 (${res.status})`);
    }
  },

  /**
   * 文件的公开访问 URL（与上传后端返回的 url 字段一致）
   */
  url: (filename: string) => `${BASE}/${filename}`,
};
