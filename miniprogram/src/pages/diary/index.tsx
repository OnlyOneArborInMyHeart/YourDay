import { View, Text } from '@tarojs/components';
import { api } from '../../lib/api';
import type { Diary } from '../../lib/types';
import { useEffect, useState } from 'react';

export default function DiaryPage() {
  const [items, setItems] = useState<Diary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Diary[]>('/api/diaries')
      .then(setItems)
      .catch((e) => setErr(e.message || '加载失败'));
  }, []);

  return (
    <View className="page">
      <View className="page__title">最近日记</View>
      {err && <View className="page__error">{err}</View>}
      {items.length === 0 && !err && <View className="page__hint">还没有写过日记</View>}
      {items.map((d) => (
        <View key={d.date} className="diary-card">
          <Text className="diary-card__date">{d.date}</Text>
          <Text className="diary-card__title">{d.title || '(无标题)'}</Text>
        </View>
      ))}
    </View>
  );
}