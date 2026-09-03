#!/usr/bin/env bash
# Bring a fresh Codespace to a state where `npm run dev` just works.
set -euo pipefail

echo "Installing dependencies…"
npm ci

echo "Writing services/api/.env…"
if [ ! -f services/api/.env ]; then
  cat > services/api/.env <<ENV
DATABASE_URL="postgresql://mgms:mgms@localhost:5432/mgms?schema=public"
PORT=4000
NODE_ENV=development
CORS_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175"
JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
ACCESS_TOKEN_TTL="30m"
REFRESH_TOKEN_TTL_DAYS=30
SEED_ADMIN_USERNAME="state.admin"
SEED_ADMIN_PASSWORD="ChangeMe@2026"
ANALYTICS_INTERVAL_MINUTES=10
SYNC_STALE_MINUTES=60
ENV
fi

echo "Building the shared domain package…"
npm run build --workspace @mgms/shared

echo "Waiting for PostgreSQL…"
until pg_isready -h localhost -U mgms -q 2>/dev/null; do sleep 1; done

echo "Applying migrations and seeding a gathering…"
npx prisma generate --schema services/api/prisma/schema.prisma
npm run db:migrate
npm run db:seed
npm run analytics:run

cat <<'DONE'

  Ready.

    npm run dev        API :4000 · Console :5173 · Field app :5174

  Sign in as state.admin / ChangeMe@2026
  Other accounts: district.tvm, girin1.sup, girin1.mo, girin1.vol1

DONE
