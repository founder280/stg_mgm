# @mgms/demo

An in-browser stand-in for the API, so the console and the field app can be
published as a static demonstration on GitHub Pages — where there is no Node
process and no database.

`src/snapshot.json` is **generated**, not hand-written: it is a dump of the
seeded gathering, produced by

```bash
npm run demo:snapshot        # needs a seeded database
```

It is committed so that a fresh clone can build and run the demonstration with
no database at all. The published site regenerates it during the Pages build, so
what is deployed always reflects the current seed.

Everything that constitutes *judgement* — syndrome classification, triage,
aberration detection, the spatial scan, stockout projection — is delegated to
`@mgms/shared`, the same code the real API runs. What the demonstration
concludes is what the server concludes.

What is deliberately **not** real here:

- **Persistence.** Anything you create lives in memory for the life of the page.
- **Authentication.** Any password is accepted for a seeded username. Scope and
  permission rules, however, *are* enforced exactly as they are server-side.
- **Aggregation.** Done in JavaScript rather than SQL.
- **The scheduled surveillance pass**, real sync between devices, and everything
  else that needs a server.

To exercise those, run the real stack — see `docs/testing.md`.
