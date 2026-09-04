import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';
import { ApiError } from '../api/client';
import { IS_DEMO } from '../api/transport';

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(IS_DEMO ? 'demo' : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="card login-card" onSubmit={onSubmit}>
        <div style={{ marginBottom: 18 }}>
          <h1>Mass Gathering Health Management</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            Administration console and live surveillance dashboard
          </p>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="banner banner-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {IS_DEMO ? (
          <div className="banner" style={{ marginTop: 16 }}>
            <strong>Demonstration.</strong> Any password works. Try{' '}
            <button type="button" className="btn btn-sm" onClick={() => setUsername('state.admin')} style={{ margin: '0 2px' }}>
              state.admin
            </button>
            for state-wide access,{' '}
            <button type="button" className="btn btn-sm" onClick={() => setUsername('district.mulugu')} style={{ margin: '0 2px' }}>
              district.mulugu
            </button>
            for one district, or{' '}
            <button type="button" className="btn btn-sm" onClick={() => setUsername('jatn1.sup')} style={{ margin: '0 2px' }}>
              jatn1.sup
            </button>
            for a camp supervisor — the scope rules are enforced here exactly as they are on the server.
          </div>
        ) : (
          <p className="tiny muted" style={{ marginTop: 16, marginBottom: 0 }}>
            Access is granted by your department. Contact the state administrator if you cannot sign in.
          </p>
        )}
      </form>
    </div>
  );
}
