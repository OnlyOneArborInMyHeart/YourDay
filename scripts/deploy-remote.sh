#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/yourday"
SERVICE="yourday"
ARCHIVE="${1:-}"
SCRIPT_PATH="/tmp/deploy-remote.sh"

cleanup() {
  if [ -n "$ARCHIVE" ]; then rm -f "$ARCHIVE"; fi
  rm -f "$SCRIPT_PATH"
}
trap cleanup EXIT

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "[deploy] deployment archive not found: $ARCHIVE" >&2
  exit 1
fi

for command in node npm sqlite3 systemctl curl tar; do
  command -v "$command" >/dev/null || {
    echo "[deploy] required command not found: $command" >&2
    exit 1
  }
done

if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "[deploy] production environment file is missing: $APP_DIR/backend/.env" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$APP_DIR/backend/backups"
DB_FILE="$APP_DIR/backend/data/yourday.db"
mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
  DB_BACKUP="$BACKUP_DIR/yourday-before-deploy-$STAMP.db"
  sqlite3 "$DB_FILE" ".backup '$DB_BACKUP'"
  gzip "$DB_BACKUP"
  echo "[deploy] database backup: ${DB_BACKUP}.gz"
fi

echo "[deploy] extracting release..."
tar -xzf "$ARCHIVE" -C "$APP_DIR"
chown -R ecs-user:ecs-user "$APP_DIR/frontend/dist" "$APP_DIR/backend"

echo "[deploy] installing backend production dependencies..."
sudo -u ecs-user npm --prefix "$APP_DIR/backend" ci --omit=dev --no-audit --no-fund

echo "[deploy] restarting services..."
nginx -t
systemctl restart "$SERVICE"
systemctl reload nginx

for attempt in 1 2 3 4 5 6; do
  if curl --fail --silent http://127.0.0.1/api/health >/dev/null; then
    echo "[deploy] health check passed"
    systemctl --no-pager --full status "$SERVICE" | head -n 12
    exit 0
  fi
  sleep 2
done

echo "[deploy] health check failed" >&2
journalctl -u "$SERVICE" -n 50 --no-pager >&2
exit 1
