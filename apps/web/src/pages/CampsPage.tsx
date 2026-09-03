import { useState } from 'react';
import { useApi } from '../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../components/common';
import { Pill } from '../components/Pill';
import { STOCK_RISK_STYLES, statusStyle } from '../charts/status';
import { relativeTime } from '../charts/scales';

interface CampRow {
  id: string;
  code: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  lastSyncAt: string | null;
  district: { id: string; name: string };
  zone: { id: string; name: string } | null;
  incharge: { id: string; fullName: string; mobile: string | null } | null;
  event: { id: string; name: string };
  _count: { walkIns: number };
}

interface InventoryRow {
  id: string;
  drugCode: string;
  drugName: string;
  form: string;
  onHand: number;
  reorderLevel: number;
  emergencyTray: boolean;
  projection: { risk: string; daysToStockout: number | null; projectedDailyBurn: number; reorderQuantity: number } | null;
}

interface ReadinessRow {
  id: string;
  reportDate: string;
  venueReady: boolean;
  waterAvailable: boolean;
  powerAvailable: boolean;
  wasteDisposalReady: boolean;
  readinessPercent: number | null;
  feedback: string | null;
  equipment: Array<{ equipmentCode: string; status: string; quantity: number }>;
  photos: Array<{ kind: string; url: string }>;
}

export function CampsPage() {
  const { data, isLoading, error } = useApi<{ items: CampRow[] }>(['camps'], '/camps');
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <ErrorBanner error={error} />;
  if (isLoading || !data) return <Loading />;

  const camp = data.items.find((c) => c.id === selected) ?? null;

  return (
    <>
      <PageHeader title="Camps" subtitle="Temporary medical camps, first aid posts and mobile units" />

      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Camp</th>
                <th>Type</th>
                <th>Zone</th>
                <th>District</th>
                <th>In charge</th>
                <th className="num">Walk-ins</th>
                <th>Last sync</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row.id === selected ? null : row.id)}
                  style={{ cursor: 'pointer', fontWeight: row.id === selected ? 600 : 400 }}
                >
                  <td>{row.name}</td>
                  <td className="small">{row.type.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="small">{row.zone?.name ?? '—'}</td>
                  <td className="small">{row.district.name}</td>
                  <td className="small">{row.incharge?.fullName ?? <span className="muted">unassigned</span>}</td>
                  <td className="num mono">{row._count.walkIns.toLocaleString()}</td>
                  <td className="small muted">{relativeTime(row.lastSyncAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {camp && <CampDetail camp={camp} />}
    </>
  );
}

function CampDetail({ camp }: { camp: CampRow }) {
  const inventory = useApi<{ items: InventoryRow[] }>(['inventory', camp.id], `/camps/${camp.id}/inventory`);
  const readiness = useApi<{ items: ReadinessRow[] }>(['readiness', camp.id], `/camps/${camp.id}/readiness`);

  const latest = readiness.data?.items[0];
  const atRisk = inventory.data?.items.filter((i) => i.projection && i.projection.risk !== 'OK') ?? [];

  return (
    <div className="grid grid-2">
      <Card title={`${camp.name} — stock`} subtitle="Live camp inventory with a projection from its own burn rate">
        {inventory.isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder at</th>
                  <th className="num">Days left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(atRisk.length > 0 ? atRisk : (inventory.data?.items ?? []).slice(0, 12)).map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.drugName}
                      {row.emergencyTray && <span className="tiny muted"> · emergency tray</span>}
                    </td>
                    <td className="num mono">{row.onHand}</td>
                    <td className="num mono">{row.reorderLevel}</td>
                    <td className="num mono">{row.projection?.daysToStockout ?? '—'}</td>
                    <td>{row.projection && <Pill style={statusStyle(STOCK_RISK_STYLES, row.projection.risk)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {atRisk.length > 0 && (
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Showing the {atRisk.length} item(s) at risk. Everything else is adequate.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title={`${camp.name} — readiness`} subtitle="Pre-camp verification: venue, equipment, photographs">
        {readiness.isLoading ? (
          <Loading />
        ) : !latest ? (
          <div className="empty">No readiness report submitted for this camp.</div>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="chip chip-static">Venue {latest.venueReady ? '✓' : '✕'}</span>
              <span className="chip chip-static">Water {latest.waterAvailable ? '✓' : '✕'}</span>
              <span className="chip chip-static">Power {latest.powerAvailable ? '✓' : '✕'}</span>
              <span className="chip chip-static">Waste {latest.wasteDisposalReady ? '✓' : '✕'}</span>
              <span className="chip chip-static">Equipment {latest.readinessPercent ?? '—'}%</span>
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th className="num">Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.equipment
                    .filter((e) => e.status !== 'FUNCTIONAL')
                    .concat(latest.equipment.filter((e) => e.status === 'FUNCTIONAL').slice(0, 4))
                    .map((item) => (
                      <tr key={item.equipmentCode}>
                        <td className="small">{item.equipmentCode.replace(/_/g, ' ').toLowerCase()}</td>
                        <td className="num mono">{item.quantity}</td>
                        <td className="small">
                          {item.status === 'FUNCTIONAL' ? (
                            <span style={{ color: 'var(--status-good-text)' }}>■ functional</span>
                          ) : (
                            <span style={{ color: 'var(--status-critical)' }}>● {item.status.replace(/_/g, ' ').toLowerCase()}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {latest.feedback && (
              <p className="small secondary" style={{ marginTop: 10, marginBottom: 0 }}>
                <strong>Field feedback:</strong> {latest.feedback}
              </p>
            )}
            {latest.photos.length > 0 && (
              <p className="tiny muted" style={{ marginTop: 6, marginBottom: 0 }}>
                {latest.photos.length} site photograph(s) on file: {latest.photos.map((p) => p.kind.toLowerCase()).join(', ')}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
