import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';

export default function Index() {
  // 占位首页：跳到"今日"或登录
  const tk = Taro.getStorageSync('yd-token');
  Taro.switchTab({ url: tk ? '/pages/today/index' : '/pages/login/index' });
  return (
    <View className="page">
      <Text>正在跳转…</Text>
    </View>
  );
}