#!/usr/bin/env bash
# 健康检查 + 日志轮转。适合放进 crontab 每 5 分钟跑一次。
# 用法：crontab -e → */5 * * * * /opt/yourday/backend/scripts/monitor.sh
#
# 失败时通过 webhook 报警（企业微信 / 飞书机器人）。配置：
#   export WEBHOOK_URL="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"

set -euo pipefail

APP_DIR="/opt/yourday/backend"
LOG_DIR="$APP_DIR/logs"
HEALTH_URL="http://127.0.0.1:3001/api/health"
PID_FILE="/var/run/yourday-api.pid"

mkdir -p "$LOG_DIR"

log() { echo "[$(date +%F\ %T)] $*" >> "$LOG_DIR/monitor.log"; }

alert() {
  local text="$1"
  log "ALERT: $text"
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -sS -X POST "$WEBHOOK_URL" \
      -H 'content-type: application/json' \
      -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"YourDay: $text\"}}" \
      >/dev/null || true
  fi
}

# 1. 健康检查
code="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" || echo 000)"
if [ "$code" != "200" ]; then
  alert "API 健康检查失败 (HTTP $code)，尝试拉起"
  pm2 restart yourday-api || true
fi

# 2. 进程存活
if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    alert "API 主进程不存在 (pid=$pid)"
  fi
fi

# 3. 磁盘使用
use="$(df -P "$APP_DIR" | awk 'NR==2 {sub("%","",$5); print $5}')"
if [ "$use" -gt 90 ]; then
  alert "磁盘使用 ${use}%，请清理上传或扩容"
fi

# 4. 日志按大小切割
find "$LOG_DIR" -type f -name 'app.log' -size +200M -exec logrotate -f /etc/logrotate.d/yourday {} \; || true

log "ok"