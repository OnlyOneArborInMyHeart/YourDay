export interface MusicTrack {
  id: number;
  title: string;
  filename: string;
  mime: string;
  size: number;
  original_name: string;
  cover_filename: string | null;
  lyrics: string | null;
  url: string;
  cover_url: string | null;
  created_at: string;
}

/** 解析 LRC 格式歌词文本 → { time: 秒, text: 歌词内容 }[] */
export function parseLRC(raw: string): { time: number; text: string }[] {
  const lines = raw.split(/\r?\n/);
  const result: { time: number; text: string }[] = [];

  for (const line of lines) {
    // 匹配 [mm:ss.xx] 或 [mm:ss:xx] 格式的时间标签
    const tagMatches = [...line.matchAll(/\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g)];
    if (tagMatches.length === 0) continue;

    const text = line.replace(/\[\d{1,2}:\d{2}[.:]\d{2,3}\]/g, '').trim();

    for (const m of tagMatches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const cs  = parseInt(m[3].padEnd(3, '0').slice(0, 3), 10);
      result.push({ time: min * 60 + sec + cs / 1000, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

const BASE = '/api/music';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const musicApi = {
  list: async (): Promise<MusicTrack[]> => {
    const data = await request<unknown>(BASE);
    return Array.isArray(data) ? (data as MusicTrack[]) : [];
  },
  upload: async (file: File): Promise<MusicTrack> => {
    const form = new FormData();
    form.append('file', file);
    return request<MusicTrack>(BASE, { method: 'POST', body: form });
  },
  rename: (id: number, title: string): Promise<MusicTrack> =>
    request<MusicTrack>(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  uploadCover: async (
    id: number,
    file: File,
    crop?: {
      shape: 'circle' | 'square' | 'rect';
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
      imageWidth: number;
      imageHeight: number;
    }
  ): Promise<MusicTrack> => {
    const form = new FormData();
    form.append('file', file);
    if (crop) {
      form.append('cropShape', crop.shape);
      form.append('cropX', String(crop.cropX));
      form.append('cropY', String(crop.cropY));
      form.append('cropW', String(crop.cropW));
      form.append('cropH', String(crop.cropH));
      form.append('imageWidth', String(crop.imageWidth));
      form.append('imageHeight', String(crop.imageHeight));
    }
    return request<MusicTrack>(`${BASE}/${id}/cover`, { method: 'POST', body: form });
  },
  removeCover: (id: number): Promise<void> =>
    request<void>(`${BASE}/${id}/cover`, { method: 'DELETE' }),
  uploadLyrics: async (id: number, lrcText: string): Promise<MusicTrack> =>
    request<MusicTrack>(`${BASE}/${id}/lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lyrics: lrcText }),
    }),
  removeLyrics: (id: number): Promise<void> =>
    request<void>(`${BASE}/${id}/lyrics`, { method: 'DELETE' }),
  remove: (id: number): Promise<void> =>
    request<void>(`${BASE}/${id}`, { method: 'DELETE' }),
};
