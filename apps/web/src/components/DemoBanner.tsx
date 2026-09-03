import { IS_DEMO } from '../api/transport';

/**
 * States plainly that this is a demonstration.
 *
 * A dashboard that looks live but is not is dangerous in a public-health
 * setting: someone could act on it. The banner is not dismissable.
 */
export function DemoBanner() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="note"
      style={{
        background: 'var(--status-warning)',
        color: '#1a1a19',
        padding: '6px 24px',
        fontSize: 12,
        fontWeight: 600,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <span aria-hidden>▲</span>
      <span>
        Demonstration — seeded data, no server, no database. Everything is computed in your browser and nothing you
        change is saved.
      </span>
    </div>
  );
}
