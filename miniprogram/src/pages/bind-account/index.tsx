import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { wxLogin, setToken, type WxLoginBound } from '../../lib/api';

export default function BindAccount() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // openid 通过 url query 传入；wxlogin 内部会用 code 重新校验一致性。
  async function onSubmit() {
    setBusy(true);
    setErr(null);
    try {
      const { code } = await Taro.login();
      const result = await wxLogin(code, { username, password });
      if ('bound' in result) {
        setToken((result as WxLoginBound).token);
        Taro.switchTab({ url: '/pages/today/index' });
      } else {
        setErr('绑定失败：账号校验未通过');
      }
    } catch (e: any) {
      setErr(e?.message || '绑定失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="auth-page">
      <Text className="auth-page__title">绑定已有 YourDay 账号</Text>
      <View className="auth-page__field">
        <Text className="auth-page__label">用户名</Text>
        <Input value={username} onInput={(e) => setUsername(e.detail.value)} placeholder="YourDay 用户名" />
      </View>
      <View className="auth-page__field">
        <Text className="auth-page__label">密码</Text>
        <Input value={password} onInput={(e) => setPassword(e.detail.value)} password placeholder="YourDay 密码" />
      </View>
      <Button className="auth-page__btn" loading={busy} onClick={onSubmit}>
        绑定并登录
      </Button>
      {err && <View className="auth-page__msg">{err}</View>}
    </View>
  );
}