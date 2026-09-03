# Deployment

## Before anything else

1. **Generate real secrets.** `openssl rand -hex 48` for `JWT_ACCESS_SECRET` and
   `JWT_REFRESH_SECRET`. The API refuses to start with a secret under 32
   characters, but it cannot tell a weak one from a strong one — that is on you.
2. **Change the seeded administrator password**, or do not run the seed at all
   outside development. `npm run db:seed` creates known accounts with a known
   password; it exists for demonstration and testing.
3. **Set `CORS_ORIGINS`** to the exact origins of the console and the field app.
4. **Terminate TLS** in front of everything. Refresh tokens and clinical data
   cross this connection.

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `production` in any deployment |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets, ≥ 32 characters |
| `ACCESS_TOKEN_TTL` | Access token lifetime (default `30m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime (default 30) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `ANALYTICS_INTERVAL_MINUTES` | Surveillance pass interval; `0` disables the in-process scheduler |
| `SYNC_STALE_MINUTES` | How long before a silent camp is flagged |
| `LOG_LEVEL` | pino level |

## Compose

```bash
cp .env.example .env
$EDITOR .env
docker compose up --build
```

Migrations run in the API container's start command, so the service can never
serve traffic against a schema it does not match.

Console on `:8080`, field app on `:8081`, API on `:4000`. Both web tiers are
nginx serving static builds and proxying `/api` to the API container.

## Scaling for a real gathering

**Database.** Use managed PostgreSQL with point-in-time recovery. A state-scale
gathering generates millions of walk-in rows; the indexes are in place, but plan
capacity from the expected footfall and keep read replicas for the dashboard if
the control room is busy.

**API.** Stateless apart from the database, so it scales horizontally. One
caveat: the analytics scheduler runs in-process, so **set
`ANALYTICS_INTERVAL_MINUTES=0` on all but one replica**, or run the pass as a
cron job invoking `npm run analytics:run --workspace @mgms/api` and disable it
everywhere. Several replicas racing the same pass will not corrupt anything —
alerts are de-duplicated by key — but it is wasted work.

**Field app.** Serve over HTTPS; a service worker will not register otherwise,
and without it the app is not offline-capable. `sw.js` must not be cached — the
supplied nginx config sets `no-store` on it. A cached service worker can pin a
tablet to an old shell for the length of the gathering.

**Sync load.** Expect a burst when connectivity returns after an outage: a whole
camp's queued day arrives at once. The batch limit is 200 operations and the body
limit 5 MB. Size the API tier for the reconnection spike, not the steady state.

## Operational checklist for a gathering

- Every camp device signs in **once with a connection** before deployment; that
  is what stores the refresh token and pulls the offline bundle.
- Confirm each camp appears in the console with a recent sync time before the
  gathering opens.
- Confirm the empanelled hospitals and their specialities are loaded, and that
  the 108 ambulance base contact is correct — the referral pathway depends on it.
- Load the camp inventories and set reorder levels; the stockout projection is
  only as good as the opening stock.
- Watch the `SYNC_STALE` and `CAMP_NOT_READY` alerts on day one. They are the
  cheapest signal that a camp has a device, a network or a staffing problem.

## Backups

Back up PostgreSQL on a schedule that matches the gathering, not the calendar:
during peak days a lost hour is thousands of clinical records. Test a restore
before the gathering, not during it.

## Monitoring

- `/health` for liveness, `/health/ready` for readiness — the compose
  healthcheck uses the latter.
- Logs are structured JSON (pino), with authorization headers, cookies,
  passwords, refresh tokens and patient names redacted.
- The `SyncBatch` table is the record of device traffic: rejections there are the
  first place to look when a camp reports missing records.
