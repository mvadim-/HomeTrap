#!/bin/sh
# synology-update.sh — безпечне оновлення HomeTrap на Synology:
#   перевірка оновлень -> бекап data/ -> git pull -> rebuild+restart ->
#   health-check -> ротація бекапів.
#
# Бекап робиться ПЕРШИМ (до git pull і rebuild) — це знімок відомо-справного
# стану до будь-яких змін.
#
# Запуск (користувач у docker-групі):   sh synology-update.sh
# Якщо docker потребує root:             SUDO=sudo sh synology-update.sh
#
# Змінні оточення (мають дефолти):
#   HOMETRAP_DIR             тека репозиторію          (типово /volume1/docker/hometrap)
#   HOMETRAP_BACKUP_DIR      куди класти бекапи        (типово /volume1/backup/hometrap)
#   HOMETRAP_KEEP_BACKUPS    скільки бекапів лишати    (типово 10)
#   HOMETRAP_HEALTH_TIMEOUT  скільки секунд чекати healthy (типово 120)
#   SUDO                     напр. "sudo", якщо docker потребує root

set -eu

HOMETRAP_DIR="${HOMETRAP_DIR:-/volume1/docker/hometrap}"
HOMETRAP_BACKUP_DIR="${HOMETRAP_BACKUP_DIR:-/volume1/backup/hometrap}"
HOMETRAP_KEEP_BACKUPS="${HOMETRAP_KEEP_BACKUPS:-10}"
HOMETRAP_HEALTH_TIMEOUT="${HOMETRAP_HEALTH_TIMEOUT:-120}"
SUDO="${SUDO:-}"

log() { printf '\n==> %s\n' "$1"; }
die() { printf '\nПОМИЛКА: %s\n' "$1" >&2; exit 1; }

# 1) Передумови ---------------------------------------------------------------
cd "$HOMETRAP_DIR" 2>/dev/null || die "Немає теки $HOMETRAP_DIR"
[ -f .env ] || die "Немає .env у $HOMETRAP_DIR"
[ -f docker/docker-compose.yml ] || die "Немає docker/docker-compose.yml (не той каталог?)"
command -v git >/dev/null 2>&1 || die "git не знайдено"
$SUDO docker version >/dev/null 2>&1 || die "docker недоступний (спробуйте SUDO=sudo)"
mkdir -p data "$HOMETRAP_BACKUP_DIR"

DC="$SUDO docker compose --env-file .env -f docker/docker-compose.yml"
PORT="$(sed -n 's/^HOMETRAP_PORT=//p' .env | head -n1)"; PORT="${PORT:-8000}"

# 2) Чи є що оновлювати (fetch, без змін робочого дерева) ----------------------
log "Перевіряю оновлення (git fetch)"
git fetch --quiet || die "git fetch не вдався (мережа/креденшали?)"
LOCAL="$(git rev-parse @)"
REMOTE="$(git rev-parse '@{u}' 2>/dev/null || git rev-parse origin/main)"
if [ "$LOCAL" = "$REMOTE" ]; then
  log "Уже актуально ($(git rev-parse --short @)) — бекап і rebuild не потрібні."
  exit 0
fi

# 3) Бекап data/ ПЕРШИМ — до будь-яких змін (консистентно, з зупиненим контейнером)
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$HOMETRAP_BACKUP_DIR/hometrap-$TS.tar.gz"
log "Бекап data/ (знімок до оновлення) -> $BACKUP_FILE"
$DC stop hometrap || true
tar -czf "$BACKUP_FILE" data || die "Не вдалося створити бекап"
log "Бекап готовий ($(du -h "$BACKUP_FILE" | cut -f1))"

# 4) Тягнемо зміни ------------------------------------------------------------
BEFORE="$(git rev-parse --short @)"
log "git pull --ff-only"
git pull --ff-only || die "git pull не вдався (розбіжність гілок?). Бекап: $BACKUP_FILE"
AFTER="$(git rev-parse --short @)"
log "Версія: $BEFORE -> $AFTER"

# 5) Rebuild + запуск (міграції Alembic застосуються на старті) ----------------
log "Rebuild і запуск контейнера"
$DC up -d --build || die "up --build не вдався — дивіться '$DC logs hometrap'. Бекап: $BACKUP_FILE"

# 6) Чекаємо healthy ----------------------------------------------------------
log "Чекаю healthy (до ${HOMETRAP_HEALTH_TIMEOUT}s)"
WAITED=0
while :; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  WAITED=$((WAITED + 3))
  if [ "$WAITED" -ge "$HOMETRAP_HEALTH_TIMEOUT" ]; then
    printf '\n'; $DC ps || true; $DC logs --tail=40 hometrap || true
    die "Сервіс не став healthy за ${HOMETRAP_HEALTH_TIMEOUT}s. Відкат нижче. Бекап: $BACKUP_FILE"
  fi
  sleep 3
done
log "Health OK: $(curl -fsS "http://127.0.0.1:$PORT/api/health")"

# 7) Прибирання старих бекапів (лишаємо останні N) ----------------------------
log "Лишаю останні $HOMETRAP_KEEP_BACKUPS бекапів у $HOMETRAP_BACKUP_DIR"
ls -1t "$HOMETRAP_BACKUP_DIR"/hometrap-*.tar.gz 2>/dev/null \
  | tail -n +"$((HOMETRAP_KEEP_BACKUPS + 1))" \
  | while IFS= read -r old; do
      rm -f "$old" && log "видалено старий бекап: $(basename "$old")"
    done

log "Готово: $BEFORE -> $AFTER. Бекап: $BACKUP_FILE"
printf '\nВідкат за потреби (код + дані):\n  git reset --hard %s\n  %s stop hometrap\n  tar -xzf %s -C %s\n  %s up -d --build\n' \
  "$BEFORE" "$DC" "$BACKUP_FILE" "$HOMETRAP_DIR" "$DC"
