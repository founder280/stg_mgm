/**
 * The single point where this app talks to the outside world.
 *
 * In a normal build this is `fetch`. In the published demonstration build
 * (`VITE_DEMO=1`) there is no server to talk to — GitHub Pages serves files —
 * so requests are answered in the browser by `@mgms/demo`, which runs the same
 * `@mgms/shared` domain code the real API runs.
 *
 * The demo returns a genuine `Response`, so nothing downstream of here knows or
 * cares which mode it is in.
 */

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

export async function transport(url: string, init?: RequestInit): Promise<Response> {
  if (!IS_DEMO) return fetch(url, init);

  const { handleDemoRequest } = await import('@mgms/demo');
  const path = url.replace(/^\/api/, '');
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  const result = await handleDemoRequest(path, { method: init?.method, body });
  if (result.status === 204) return new Response(null, { status: 204 });

  const isText = typeof result.body === 'string';
  return new Response(isText ? (result.body as string) : JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': isText ? 'text/csv; charset=utf-8' : 'application/json' },
  });
}
