# 小程序预览 / 调试指南

按"门槛从低到高"提供 4 种预览路径，从纯前端查看 UI，到真机扫码调试小程序都能跑起来。

## 路径 A：浏览器预览（最快，5 分钟）

> 适合：调 UI / 调布局 / 不依赖 wx.* 能力时。
> 不需要：AppID、不需要安装"微信开发者工具"。

### 步骤

1. 启动后端：

   ```bash
   cd backend
   # 开发环境放行 5174 来源即可（H5 dev server 默认端口）
   ALLOWED_ORIGINS=http://localhost:5174 \
   NODE_ENV=development \
   PORT=3001 \
   npm run dev
   ```

2. 启动浏览器预览：

   ```bash
   cd miniprogram/preview
   npm install
   npm run dev
   # 默认 http://localhost:5174
   ```

3. 浏览器打开 `http://localhost:5174`。
   - 默认账号：`root / 123456`
   - 默认路径：`#/` → 今日；`#/diary` → 日记；`#/login` → 登录
   - 点击卡片可切换事件完成状态
   - 顶部"今日主题"右侧铅笔可编辑

### 常见问题

- **端口被占用**：修改 `miniprogram/preview/vite.config.ts` 的 `server.port`。
- **白屏**：打开 DevTools Console，看具体错误；多半是后端没起来或 CORS 不放行 `5174`。
- **登录 401 / 403**：先确认后端 `JWT_SECRET` 已设且 `NODE_ENV` 不是 production（否则会强制要求 ≥ 32 位）。

### 实现说明

- `preview/src/lib/api.ts` 不依赖 `@tarojs/taro`，只用了 `fetch` + `localStorage`；和真实 Taro API 行为对齐（401 自动清 token、`Bearer` 头）。
- `mockWxLoginCode()` 模拟 `wx.login` 的 code；后端若没配 `WX_APPID/WX_SECRET` 会返 503 / "微信服务暂时不可用"，属正常现象——切到"账号密码登录"即可。

---

## 路径 B：微信开发者工具（推荐，正经体验）

> 适合：完整跑通 `wx.login` / `wx.uploadFile` / `wx.setStorageSync` 等所有小程序 API。

### 步骤

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（~200 MB）。
2. 打开开发者工具 → 小程序 → 导入项目 → 选择 `miniprogram/` 目录。
3. AppID 选项：
   - **已有 AppID**：填你自己的；
   - **没有 AppID**：选"测试号"（无 AppID 也能跑，但部分受限）。
4. 默认会读 `project.config.json` 的 `miniprogramRoot = dist/`，但目前还没有 `dist/`。

所以先把 Taro 工程跑起来产出 `dist/`：

```bash
cd miniprogram
npm install
npm run dev:weapp    # 监听并编译到 dist/
```

切回开发者工具，**点击"编译"**。你会看到左侧模拟器里跑出和浏览器版一样的界面，且右上角会显示"用户登录态"，可以真实触发 `wx.login`。

### 常见问题

- **编译报错 / 找不到组件**：确认 Taro 编译是否成功（终端里没有 `error`）。`dist/` 目录应该出现 `app.js` / `app.json` 等。
- **真机预览调试**：开发者工具右上角"预览"扫码，即可在真机上跑。但需要"小程序后台"已经加了后端域名白名单（路径 C 详情）。

---

## 路径 C：真机扫码（上线前必走）

> 适合：在手机上真实使用小程序，跟生产表现一致。

### 必要条件

- 已注册微信小程序账号并获得 AppID（与 `project.config.json` 一致）
- 后端域名已备案 + HTTPS（小程序强制要求）
- 已部署 `docs/DEPLOY.md` 的 B 档

### 步骤

1. 部署后端到 https://api.yourday.app ，验证 `https://api.yourday.app/api/health` 返回 200。
2. 小程序后台"开发管理 → 开发设置 → 服务器域名"：
   - `request 合法域名`：`https://api.yourday.app`
   - `uploadFile 合法域名`：同上
   - `downloadFile 合法域名`：同上
3. 重新构建：

   ```bash
   cd miniprogram
   API_BASE=https://api.yourday.app npm run build:weapp
   ```

4. 微信开发者工具里点"预览" → 扫码 → 在手机上体验。
5. 在手机上：
   - 第一次点"微信一键登录" → 进入"绑定账号"页 → 输入你已有的 YourDay 账号密码
   - 下一次再点"微信一键登录" → 直接无感登录
   - 在 web 端 / 小程序端操作同一账号，数据是同步的（SQLite 单库，所有客户端共享）。

---

## 路径 D：体验版（多人试用）

仅供团队成员或种子用户：

1. 微信开发者工具右上角"上传" → 填版本号 → 上传为开发版本。
2. 小程序后台"版本管理" → 把刚才的开发版本设为"体验版"。
3. "成员管理 → 体验成员"里添加微信号。
4. 体验成员扫码进入"体验版"小程序。

---

## 三种模式对照

| 能力 | A 浏览器预览 | B 开发者工具 | C 真机扫码 |
|---|---|---|---|
| 调 UI / 改样式 | ✅ 秒级热更新 | ✅ | ✅（慢） |
| `fetch` 调后端 | ✅ | ✅ | ✅ |
| `wx.login` / `code2Session` | ⚠️ 模拟 code | ✅ 真实 | ✅ 真实 |
| `wx.uploadFile` / `wx.setStorage` | ❌ 用浏览器等价物 | ✅ | ✅ |
| 微信登录态（tokenStorage） | localStorage | wx storage | wx storage |
| 上传文件 / 调用相机 | ❌ | ✅ | ✅ |
| 不需要 AppID | ✅ | ✅（测试号） | ❌ 必须有 |
| 不需要备案域名 | ✅ | ✅ | ❌ 必须 |
| 不需要开发者工具 | ✅ | ❌ | ❌ |

---

## 推荐的开发节奏

1. **先用 A** 调 UI，浏览器 F12 DevTools 配 mobile 模式看效果
2. **遇到 `wx.*` 相关问题再切 B**
3. **上线前走 C**，在真实手机上验收
4. **小范围试用走 D**