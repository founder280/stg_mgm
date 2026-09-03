import { useState, type FormEvent } from 'react';
import { useSync } from '../sync/SyncProvider';
import { ApiError, OfflineError } from '../api/client';

export function LoginScreen() {
  const { signIn, online, deviceId } = useSync();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(
        err instanceof OfflineError
          ? 'No connection. The first sign-in on this device needs a network — once signed in you can work offline.'
          : err instanceof ApiError
            ? err.message
            : 'Unable to sign in.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <form className="login" onSubmit={submit}>
        <h1>Onsite Medical Camp</h1>
        <p className="lead">Data collection · Mass Gathering Health Management System</p>

        {!online && (
          <div className="banner warn">
            This device is offline. Sign in once with a connection; after that the app works without one.
          </div>
        )}

        <div className="q">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="text-input"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="q">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="banner err" role="alert">{error}</div>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="small muted" style={{ marginTop: 20, textAlign: 'center' }}>
          Device {deviceId}
        </p>
      </form>
    </div>
  );
}
