import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AlertDto } from '@mgms/shared';
import { PERMISSIONS } from '@mgms/shared';
import { useAlerts } from '../api/hooks';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, ErrorBanner, Loading, PageHeader } from '../components/common';
import { Pill } from '../components/Pill';
import { SEVERITY_STYLES, statusStyle } from '../charts/status';
import { formatDateTime } from '../charts/scales';

const TYPE_LABELS: Record<string, string> = {
  ABERRATION: 'Syndrome aberration',
  SPATIAL_CLUSTER: 'Spatial cluster',
  CRITICAL_CASE: 'Critical case',
  STOCKOUT: 'Drug stockout',
  CAMP_NOT_READY: 'Camp readiness',
  SYNC_STALE: 'Data not syncing',
  REFERRAL_DELAY: 'Referral delay',
};

export function AlertsPage() {
  const { can } = useAuth();
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [type, setType] = useState<string>('');

  const { data, isLoading, error } = useAlerts({
    acknowledged: showAcknowledged ? undefined : false,
    type: type || undefined,
    limit: 200,
  });

  const queryClient = useQueryClient();
  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (error) return <ErrorBanner error={error} />;
  if (isLoading || !data) return <Loading />;

  const bySeverity = (severity: string) => data.items.filter((a) => a.severity === severity).length;

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Raised by the surveillance pass: aberrations, clusters, critical cases, stock and operations"
      />

      <div className="row">
        <Pill style={statusStyle(SEVERITY_STYLES, 'CRITICAL')} text={`${bySeverity('CRITICAL')} critical`} />
        <Pill style={statusStyle(SEVERITY_STYLES, 'WARNING')} text={`${bySeverity('WARNING')} warning`} />
        <div className="spacer" />
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Alert type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="row small" style={{ gap: 5 }}>
          <input type="checkbox" checked={showAcknowledged} onChange={(e) => setShowAcknowledged(e.target.checked)} />
          Include acknowledged
        </label>
      </div>

      <Card>
        {data.items.length === 0 ? (
          <div className="empty">Nothing outstanding. The surveillance pass found no open conditions.</div>
        ) : (
          data.items.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              canAcknowledge={can(PERMISSIONS.ALERT_ACK)}
              onAcknowledge={() => acknowledge.mutate(alert.id)}
              busy={acknowledge.isPending && acknowledge.variables === alert.id}
            />
          ))
        )}
      </Card>
    </>
  );
}

function AlertRow({
  alert,
  canAcknowledge,
  onAcknowledge,
  busy,
}: {
  alert: AlertDto;
  canAcknowledge: boolean;
  onAcknowledge: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = statusStyle(SEVERITY_STYLES, alert.severity);

  return (
    <div className="alert-item">
      <div className="alert-bar" style={{ background: style.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <Pill style={style} />
          <span className="tiny muted">{TYPE_LABELS[alert.type] ?? alert.type}</span>
          {alert.campName && <span className="tiny muted">· {alert.campName}</span>}
          {alert.districtName && !alert.campName && <span className="tiny muted">· {alert.districtName}</span>}
        </div>
        <div className="alert-title" style={{ marginTop: 4 }}>{alert.title}</div>
        <div className="alert-body">{alert.body}</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Raised {formatDateTime(alert.createdAt)}
          {alert.acknowledgedAt && ` · acknowledged by ${alert.acknowledgedByName ?? 'a user'}`}
        </div>

        {open && (
          <pre
            className="tiny mono"
            style={{
              marginTop: 8,
              padding: 10,
              background: 'var(--surface-3)',
              borderRadius: 4,
              overflowX: 'auto',
              maxHeight: 220,
            }}
          >
            {JSON.stringify(alert.evidence, null, 2)}
          </pre>
        )}
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <button className="btn btn-sm" type="button" onClick={() => setOpen(!open)}>
          {open ? 'Hide evidence' : 'Evidence'}
        </button>
        {canAcknowledge && !alert.acknowledgedAt && (
          <button className="btn btn-sm" type="button" onClick={onAcknowledge} disabled={busy}>
            {busy ? 'Saving…' : 'Acknowledge'}
          </button>
        )}
      </div>
    </div>
  );
}
