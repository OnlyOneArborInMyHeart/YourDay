import type { EventBackground } from '../types';
import { http } from './http';

const BASE = '/api/event-backgrounds';

export const eventBackgroundsApi = {
  /**
   * 上传一张图，返回数据库记录 + url。
   * 之后把返回的 id 通过 EventDraft.background_image_id 与一个事件绑定。
   */
  upload: async (file: File): Promise<EventBackground> => {
    const fd = new FormData();
    fd.append('file', file);
    return http<EventBackground>(BASE, { method: 'POST', body: fd });
  },

  remove: async (id: number): Promise<void> => {
    await http<void>(`${BASE}/${id}`, { method: 'DELETE' });
  },
};