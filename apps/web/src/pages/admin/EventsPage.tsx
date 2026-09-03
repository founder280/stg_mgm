import { useState } from 'react';
import { useApi, useEvents } from '../../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';

interface Zone {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
  expectedFootfall: number | null;
}

export function EventsPage() {
  const { data, isLoading, error } = useEvents();
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <ErrorBanner error={error} />;
  if (isLoading || !data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Events & zones"
        subtitle="A gathering, the districts it spans, and the zones its festival area is divided into"
      />

      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Gathering</th>
                <th>Dates</th>
                <th>Districts</th>
                <th className="num">Expected footfall</th>
                <th className="num">Camps</th>
                <th className="num">Walk-ins</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => setSelected(event.id === selected ? null : event.id)}
                  style={{ cursor: 'pointer', fontWeight: event.id === selected ? 600 : 400 }}
                >
                  <td>
                    <div>{event.name}</div>
                    <div className="tiny mono muted">{event.code}{event.isActive && ' · active'}</div>
                  </td>
                  <td className="small">
                    {new Date(event.startDate).toLocaleDateString()} – {new Date(event.endDate).toLocaleDateString()}
                  </td>
                  <td className="small">{event.districts.map((d) => d.name).join(', ')}</td>
                  <td className="num mono">{event.expectedFootfall?.toLocaleString() ?? '—'}</td>
                  <td className="num mono">{event.campCount}</td>
                  <td className="num mono">{event.walkInCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <ZoneList eventId={selected} />}
    </>
  );
}

function ZoneList({ eventId }: { eventId: string }) {
  const { data, isLoading } = useApi<{ items: Zone[] }>(['zones', eventId], `/events/${eventId}/zones`);

  if (isLoading || !data) return <Loading />;

  const parents = data.items.filter((z) => !z.parentId);
  const childrenOf = (id: string) => data.items.filter((z) => z.parentId === id);

  return (
    <Card
      title="Festival zones"
      subtitle="Main divisions and their sub-divisions. Place of onset and the spatial cluster scan both work at this level."
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Zone</th><th>Code</th><th className="num">Expected footfall</th><th>Geocode</th></tr>
          </thead>
          <tbody>
            {parents.flatMap((parent) => [
              <tr key={parent.id}>
                <td style={{ fontWeight: 600 }}>{parent.name}</td>
                <td className="mono tiny muted">{parent.code}</td>
                <td className="num mono">{parent.expectedFootfall?.toLocaleString() ?? '—'}</td>
                <td className="mono tiny muted">
                  {parent.latitude != null ? `${parent.latitude.toFixed(4)}, ${parent.longitude?.toFixed(4)}` : '—'}
                </td>
              </tr>,
              ...childrenOf(parent.id).map((child) => (
                <tr key={child.id}>
                  <td style={{ paddingLeft: 26 }} className="small">{child.name}</td>
                  <td className="mono tiny muted">{child.code}</td>
                  <td className="num mono">{child.expectedFootfall?.toLocaleString() ?? '—'}</td>
                  <td className="mono tiny muted">
                    {child.latitude != null ? `${child.latitude.toFixed(4)}, ${child.longitude?.toFixed(4)}` : '—'}
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
