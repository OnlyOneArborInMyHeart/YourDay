# 部署手册（B 档：腾讯云轻量 + 已备案域名）

按下面顺序操作，每一步骤都对应一个目录里的脚本或配置。

## 0. 备案 & 域名

- 域名：腾讯云 / DNSPod 注册一个 `.cn` 或 `.com`，年费 ~30-80 元。
- 备案：腾讯云控制台 → 备案管理 → 提交主体资料（身份证 + 人脸核验），备案号下放后 ~7-20 工作日下证。
- 期间可以先打开服务器做一个静态说明页占位。

## 1. 服务器初始化

```bash
ssh root@your-server

# 升级 & 安装基础
apt update && apt upgrade -y
apt install -y curl git ufw sqlite3 logrotate unattended-upgrades fail2ban

# ufw 只开 22/80/443
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# fail2ban
systemctl enable --now fail2ban

# Node 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# PM2 全局
npm i -g pm2

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 2. 上传代码 & 构建

```bash
mkdir -p /opt/yourday && cd /opt/yourday
# 从 git 拉取（或 scp 上传）
git clone <your-repo-url> app

# 后端
cd /opt/yourday/app/backend
npm ci --omit=dev
cp .env.example .env
# 编辑 .env：填 JWT_SECRET（≥32 位）、WX_APPID、ALLOWED_ORIGINS 等

# 前端（先设 API_BASE）
cd /opt/yourday/app/frontend
VITE_API_BASE=/ npm run build    # 留空走相对路径
```

## 3. 反代 + 进程

```bash
# 把 backend/Caddyfile 部署成 /etc/caddy/Caddyfile
# 把 YOUR_DOMAIN / API_DOMAIN 替换为你备案的域名
cp /opt/yourday/app/backend/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

# 起 PM2
cd /opt/yourday/app/backend
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup    # 把提示的命令复制粘贴执行，让 PM2 开机自启

# 起 Caddy
systemctl enable --now caddy
```

## 4. 备份 + 监控

```bash
# 备份 cron（每天 03:00）
echo '0 3 * * * root /opt/yourday/app/backend/scripts/backup.sh' > /etc/cron.d/yourday-backup

# 监控 cron（每 5 分钟）
echo '*/5 * * * * root /opt/yourday/app/backend/scripts/monitor.sh' > /etc/cron.d/yourday-monitor

# logrotate
cp /opt/yourday/app/backend/scripts/logrotate-yourday /etc/logrotate.d/yourday
```

## 5. 小程序

- 在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序 → 拿到 AppID
- 部署 `miniprogram/`（参考其 README），`project.config.json` 填入 AppID
- 小程序后台"开发设置 → 服务器域名"添加 API 域名
- 提交审核

## 6. 上线检查清单

- [ ] `https://yourday.app/` 首页 200，index.html 能加载
- [ ] `https://api.yourday.app/api/health` 返回 `{ok:true}`
- [ ] 注册 → 登录 → 创建事件 → 完成事件 → 写日记 → 看到日记
- [ ] 日志里没有 5xx
- [ ] 备份 cron 跑过一次，去 `/opt/yourday/backend/backups/` 验证 `.db.gz`
- [ ] 小程序里走完一次 wxlogin 流程（绑定或首次绑定）
- [ ] UptimeRobot 监控 `https://api.yourday.app/api/health`，5 分钟一次