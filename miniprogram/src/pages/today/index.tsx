import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Event } from '../../lib/types';

export default function Today() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLoading(true);
    api.get<Event[]>(`/api/events?date=${today}`)
      .then(setEvents)
      .catch((e) => setErr(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View className="page">
      <View className="page__title">今日</View>
      {loading && <View className="page__hint">加载中…</View>}
      {err && <View className="page__error">{err}</View>}
      {events.length === 0 && !loading && !err && (
        <View className="page__hint">今天还没有安排哦</View>
      )}
      {events.map((e) => (
        <View key={e.id} className="event-card">
          <Text className="event-card__title">{e.title}</Text>
          {e.start_time && (
            <Text className="event-card__time">
              {e.start_time}–{e.end_time ?? ''}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}