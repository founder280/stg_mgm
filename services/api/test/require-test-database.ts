/**
 * Refuse to run the integration suite against anything but a test database.
 *
 * These suites truncate every table between tests. A DATABASE_URL exported in
 * a developer's shell wins over `.env.test` by design — CI relies on that — so
 * without this check a bare `npm test` silently destroys whatever that URL
 * happens to point at, a seeded development gathering included.
 *
 * CI's own databases (mgms_test, mgms_e2e) already satisfy the rule.
 */
export function requireTestDatabase(url: string | undefined): void {
  const name = (url ?? '').split('?')[0]?.split('/').pop() ?? '';
  if (/(^|[_-])(test|e2e)$/.test(name)) return;
  throw new Error(
    `Refusing to run the integration suite against database "${name}": it truncates every table. ` +
      'Point DATABASE_URL at a database whose name ends in _test or _e2e, or unset it to use services/api/.env.test.',
  );
}
