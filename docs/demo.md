# The browser demonstration

Two ways to see this working without installing anything.

## 1. The static demonstration — a plain link

Published to GitHub Pages from `.github/workflows/pages.yml`:

```
https://<owner>.github.io/<repo>/            landing page
https://<owner>.github.io/<repo>/console/    administration console and dashboard
https://<owner>.github.io/<repo>/camp/       field app
```

**One-time setup by a repository admin:** Settings → Pages → *Build and
deployment* → Source: **GitHub Actions**. The workflow then publishes on every
push to the default branch, and can be run on demand from the Actions tab.

### What is real in it

GitHub Pages serves static files. There is no Node process and no database, so
the apps carry a snapshot of the seeded gathering and answer their own requests
in the browser via `@mgms/demo`.

Everything that constitutes *judgement* is the real thing, delegated to
`@mgms/shared` — the same module the API imports:

- IDSP syndrome classification, with its case definitions and citations
- triage scoring and its escalation rules
- EARS C1/C2/C3, EWMA and CUSUM aberration detection
- the Kulldorff spatial scan
- Holt forecasting and stockout projection
- the role, permission and data-scope rules

So when the demonstration says *Acute Diarrhoeal Disease at Girivalam North
Medical Camp, 30 observed against 1.7 expected, flagged by four detectors*, that
is the same computation the server performs, on the same data.

### What is not real

- **Persistence.** Anything you create lives for the life of the page. Reload
  and it is gone.
- **Authentication.** Any password is accepted for a seeded username. Scope and
  permission enforcement, however, *is* applied — sign in as `district.cud` and
  you will see nothing outside Cuddalore, because the same scope resolution runs.
- **Aggregation** happens in JavaScript rather than SQL.
- **The scheduled surveillance pass**, sync between real devices, the audit
  trail and the stock ledger's transactional guarantees all need a server.

A non-dismissable banner says so on every screen. A dashboard that looks live
but is not is dangerous in a public-health setting.

### The offline behaviour is genuinely real

The field app's service worker, IndexedDB outbox and queue-and-flush cycle are
the production code, unchanged. Open `/camp/`, register a walk-in, turn your
network off, keep working, reload the page — it all behaves exactly as it does
in the field. The only difference is what sits on the other side of the sync.

## 2. Codespaces — the real stack, in a browser tab

For everything the static demo cannot show:

```
https://github.com/codespaces/new?repo=<owner>/<repo>
```

`.devcontainer/` brings up Node and a real PostgreSQL, installs, migrates,
seeds a gathering and runs the surveillance pass. Then:

```bash
npm run dev
```

API on 4000, console on 5173, field app on 5174 — forwarded automatically. This
is the actual API against an actual database: real authentication, the scheduled
analytics pass, the audit trail, and sync between two browser tabs acting as two
camp devices.

Sign in as `state.admin` / `ChangeMe@2026`.

## Building the demonstration site yourself

```bash
npm run demo:build        # → site-dist/
npx serve site-dist
```

`packages/demo/src/snapshot.json` is committed, so this works from a clean clone
with no database. To regenerate it against your own seed:

```bash
npm run db:seed
npm run analytics:run
npm run demo:snapshot
```

To build for a subdirectory, set the base:

```bash
MGMS_SITE_BASE=/stg_mgm/ npm run demo:build
```
