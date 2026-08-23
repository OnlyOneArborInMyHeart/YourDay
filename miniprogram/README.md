# YourDay 微信小程序

基于 **Taro 4 + React 18** 的微信小程序，与现有 `frontend/` SPA 共享后端 API。

## 快速开始

```bash
# 进入目录
cd miniprogram

# 安装依赖
npm install

# 开发模式（产出会输出到 dist/，用"微信开发者工具"打开 miniprogram/dist 即可）
npm run dev:weapp

# 生产构建
npm run build:weapp
```

## 配置

1. 在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序；拿到 AppID。
2. 把 `project.config.json` 和 `project.private.config.json` 中的 `appid` 替换为你的 AppID。
3. 在小程序后台"开发设置 → 服务器域名"里，把后端域名（已备案 + HTTPS）加入：
   - `request 合法域名`：你的后端 API 域名（如 `https://api.yourday.app`）
   - `uploadFile 合法域名`：同上
   - `downloadFile 合法域名`：同上

## 后端环境变量

后端需配置 `WX_APPID` / `WX_SECRET`（在 [微信公众平台 → 开发管理 → 开发设置] 获取）。`wxlogin` 与 `wxbind` 路由依赖这两个变量。

## API 基础 URL

通过 `API_BASE` 环境变量注入：

```bash
# 编译时设置
API_BASE=https://api.yourday.app npm run build:weapp
```

默认 `https://api.yourday.app`。开发期可指向本地 `https://api.localtest.me:3001`（需在小程序后台把域名加入白名单，或者开启开发者工具的"不校验合法域名"）。

## 目录结构

```
miniprogram/
├── src/
│   ├── app.tsx          # 应用入口（当前是 Provider 占位）
│   ├── app.css
│   ├── app.json         # 路由 / 窗口配置
│   ├── sitemap.json
│   ├── lib/
│   │   ├── api.ts       # fetch 封装 + token + wxlogin
│   │   └── types.ts     # 与前端共享的领域类型
│   └── pages/
│       ├── index/       # 启动占位 → 跳转到 today / login
│       ├── today/       # 今日日程（只读示例）
│       ├── diary/       # 日记列表（只读示例）
│       ├── login/       # wx.login → 后端 wxlogin
│       └── bind-account/  # 已有账号 + 密码绑定
├── config/index.ts      # Taro 构建配置
├── docs/                # 内置隐私政策 + 用户协议
└── project.config.json  # 微信开发者工具工程文件
```

## 下一步

- [ ] 复用 `frontend/src/components/` 中纯展示组件（如 `EventCalendar`、`Timeline`）
- [ ] 上传走 `Taro.uploadFile` 直传对象存储
- [ ] 引入 Redux 或 Zustand 做全局状态
- [ ] 订阅消息推送（如每晚 22:00 提醒沉淀日记）
- [ ] 自定义转发卡片