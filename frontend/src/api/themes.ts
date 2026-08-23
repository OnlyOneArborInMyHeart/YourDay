import { http } from './http';

const BASE = '/api/themes';

export interface DayTheme {
  date: string;
  title: string;
  updated_at: string;
}

export const themesApi = {
  listByDates: (dates: string[]) =>
    http<DayTheme[]>(`${BASE}?dates=${dates.join(',')}`),
  listRange: (from: string, to: string) =>
    http<DayTheme[]>(`${BASE}?from=${from}&to=${to}`),
  upsert: (date: string, title: string) =>
    http<DayTheme>(`${BASE}/${date}`, {
      method: 'PUT',
      body: { title },
    }),
  remove: (date: string) =>
    http<void>(`${BASE}/${date}`, { method: 'DELETE' }),
};