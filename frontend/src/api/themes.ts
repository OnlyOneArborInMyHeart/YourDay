const BASE = '/api/themes';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export interface DayTheme {
  date: string;
  title: string;
  updated_at: string;
}

export const themesApi = {
  listByDates: (dates: string[]) =>
    request<DayTheme[]>(`${BASE}?dates=${dates.join(',')}`),
  listRange: (from: string, to: string) =>
    request<DayTheme[]>(`${BASE}?from=${from}&to=${to}`),
  upsert: (date: string, title: string) =>
    request<DayTheme>(`${BASE}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),
  remove: (date: string) =>
    request<void>(`${BASE}/${date}`, { method: 'DELETE' }),
};
