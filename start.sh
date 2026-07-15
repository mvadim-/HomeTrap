#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="$ROOT_DIR/docker/docker-compose.dev.yml"

if ! command -v docker >/dev/null 2>&1; then
    echo "Помилка: Docker не встановлено або команда docker недоступна." >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "Помилка: потрібен Docker Compose v2 (команда: docker compose)." >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Помилка: Docker daemon не запущено." >&2
    exit 1
fi

compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

wait_for_backend() {
    attempt=0
    while [ "$attempt" -lt 60 ]; do
        if compose exec -T backend python -c \
            "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" \
            >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    return 1
}

wait_for_frontend() {
    attempt=0
    while [ "$attempt" -lt 60 ]; do
        if compose exec -T frontend node -e \
            "fetch('http://127.0.0.1:5173').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))" \
            >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    return 1
}

echo "Запускаю HomeTrap..."
compose up -d --build

if ! wait_for_backend || ! wait_for_frontend; then
    echo "Помилка: HomeTrap не став готовим вчасно. Останні логи:" >&2
    compose logs --tail=100 >&2
    exit 1
fi

cat <<'EOF'

HomeTrap запущено.

Відкрити:  http://localhost:5173
Логін:     admin
Пароль:    admin
API health: http://localhost:8000/api/health

Зупинка:
  docker compose -f docker/docker-compose.dev.yml down
EOF
