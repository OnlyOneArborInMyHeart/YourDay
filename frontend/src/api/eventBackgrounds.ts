import type { EventBackground } from '../types';

const BASE = '/api/event-backgrounds';

export const eventBackgroundsApi = {
  /**
   * 上传一张图，返回数据库记录 + url。
   * 之后把返回的 id 通过 EventDraft.background_image_id 与一个事件绑定。
   */
  upload: async (file: File): Promise<EventBackground> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(BASE, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `上传失败 (${res.status})`);
    }
    return data as EventBackground;
  },

  remove: async (id: number): Promise<void> => {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (res.status === 204) return;
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `删除失败 (${res.status})`);
  },
};
