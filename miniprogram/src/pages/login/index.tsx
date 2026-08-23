import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { wxLogin, getToken, setToken, type WxLoginBound } from '../../lib/api';

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onWxLogin() {
    setBusy(true);
    setMsg(null);
    try {
      const { code } = await Taro.login();
      const result = await wxLogin(code);
      if ('bound' in result) {
        setToken((result as WxLoginBound).token);
        Taro.switchTab({ url: '/pages/today/index' });
      } else {
        // 未绑定：跳转到"账号绑定"页
        Taro.navigateTo({
          url: `/pages/bind-account/index?openid=${encodeURIComponent(result.openid)}`,
        });
      }
    } catch (e: any) {
      setMsg(e?.message || '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="auth-page">
      <Text className="auth-page__title">登录 YourDay</Text>
      <Button
        className="auth-page__btn"
        loading={busy}
        onClick={onWxLogin}
        openType=""
      >
        微信一键登录
      </Button>
      {msg && <View className="auth-page__msg">{msg}</View>}
    </View>
  );
}