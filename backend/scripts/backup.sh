#!/usr/bin/env bash
# SQLite 在线热备份 —— 用 .backup 而不是直接 cp，避免与 WAL 写入冲突。
# 用法： crontab -e → 0 3 * * * /opt/yourday/backend/scripts/backup.sh
#
# 需要的工具：sqlite3 (apt: sudo apt install -y sqlite3)
# 可选：配置 OSS / COS 上传（见末尾）。

set -euo pipefail

APP_DIR="/opt/yourday/backend"
DATA_DIR="$APP_DIR/data"
DB_FILE="$DATA_DIR/yourday.db"
BACKUP_DIR="$APP_DIR/backups"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/yourday-${STAMP}.db"

if [ ! -f "$DB_FILE" ]; then
  echo "[backup] $DB_FILE 不存在，退出" >&2
  exit 1
fi

# 在线热备：sqlite3 .backup 会等当前 WAL 落盘后再拷
sqlite3 "$DB_FILE" ".backup '$OUT'"
gzip -f "$OUT"

echo "[backup] 已写入 ${OUT}.gz ($(stat -c%s "${OUT}.gz") bytes)"

# 滚动清理
find "$BACKUP_DIR" -type f -name 'yourday-*.db.gz' -mtime +$KEEP_DAYS -delete

# ---------- 同步到对象存储（OSS / COS，可选） ----------
# 二选一，去掉行首注释即可。

# aliyun OSS（需要 ossutil64）
# /usr/local/bin/ossutil64 cp "${OUT}.gz" \
#   "oss://YOUR_BUCKET/yourday-backups/yourday-${STAMP}.db.gz" \
#   --meta x-oss-storage-class:IA

# tencent COS（需要 coscli）
# /usr/local/bin/coscli cp "${OUT}.gz" \
#   "cos://yourday-backups-1250000000/yourday/${STAMP}.db.gz"

echo "[backup] 完成"