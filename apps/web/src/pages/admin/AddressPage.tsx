import { useState } from 'react';
import { ADDRESS_HIERARCHIES, LEVEL_LABELS, type AddressHierarchy } from '@mgms/shared';
import { useApi } from '../../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';

interface AddressUnit {
  id: string;
  code: string;
  name: string;
  nameLocal: string | null;
  level: string;
  hierarchy: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  childCount: number;
}

/**
 * The address hierarchy browser.
 *
 * The same villages are reachable through three parallel chains — administrative,
 * revenue (District > Mandal > Panchayat > Village > Habitation) and health
 * (District > HUD > Block > PHC > HSC > Village > Hamlet) — because a case has
 * to be routed to both the revenue officer and the health unit of its area.
 */
export function AddressPage() {
  const [hierarchy, setHierarchy] = useState<AddressHierarchy>('ADMIN');
  const [trail, setTrail] = useState<AddressUnit[]>([]);
  const [search, setSearch] = useState('');

  const parent = trail[trail.length - 1] ?? null;
  const query = search
    ? `/address?search=${encodeURIComponent(search)}&hierarchy=${hierarchy}&limit=100`
    : parent
      ? `/address?parentId=${parent.id}`
      : `/address?roots=true&hierarchy=${hierarchy}`;

  const { data, isLoading, error } = useApi<{ items: AddressUnit[] }>(['address', query], query);

  if (error) return <ErrorBanner error={error} />;

  return (
    <>
      <PageHeader
        title="Address hierarchy"
        subtitle="Administrative, revenue and health chains over the same villages and hamlets"
        action={
          <select
            className="select"
            value={hierarchy}
            onChange={(e) => {
              setHierarchy(e.target.value as AddressHierarchy);
              setTrail([]);
            }}
            aria-label="Hierarchy"
          >
            {ADDRESS_HIERARCHIES.map((h) => (
              <option key={h} value={h}>
                {h === 'ADMIN' ? 'Administrative' : h === 'REVENUE' ? 'Revenue' : 'Health'}
              </option>
            ))}
          </select>
        }
      />

      <div className="row">
        <nav aria-label="Breadcrumb" className="row" style={{ gap: 4 }}>
          <button className="chip" type="button" onClick={() => setTrail([])}>
            Root
          </button>
          {trail.map((unit, index) => (
            <button
              className="chip"
              type="button"
              key={unit.id}
              onClick={() => setTrail(trail.slice(0, index + 1))}
            >
              {unit.name}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <input
          className="input"
          placeholder="Search all units"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search address units"
        />
      </div>

      <Card
        title={search ? `Search results` : parent ? `Inside ${parent.name}` : 'Top level'}
        subtitle={parent ? `${LEVEL_LABELS[parent.level as keyof typeof LEVEL_LABELS] ?? parent.level} · ${parent.code}` : undefined}
      >
        {isLoading || !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <div className="empty">
            {search ? 'No units match that search.' : 'This unit has no children — it is a leaf of the hierarchy.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Level</th>
                  <th>Code</th>
                  <th className="num">Population</th>
                  <th>Geocode</th>
                  <th className="num">Children</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((unit) => (
                  <tr
                    key={unit.id}
                    onClick={() => {
                      if (unit.childCount > 0) {
                        setSearch('');
                        setTrail(search ? [unit] : [...trail, unit]);
                      }
                    }}
                    style={{ cursor: unit.childCount > 0 ? 'pointer' : 'default' }}
                  >
                    <td>
                      <div style={{ fontWeight: unit.childCount > 0 ? 600 : 400 }}>{unit.name}</div>
                      {unit.nameLocal && <div className="tiny muted">{unit.nameLocal}</div>}
                    </td>
                    <td className="small">{LEVEL_LABELS[unit.level as keyof typeof LEVEL_LABELS] ?? unit.level}</td>
                    <td className="mono tiny">{unit.code}</td>
                    <td className="num mono">{unit.population?.toLocaleString() ?? '—'}</td>
                    <td className="mono tiny muted">
                      {unit.latitude != null && unit.longitude != null
                        ? `${unit.latitude.toFixed(4)}, ${unit.longitude.toFixed(4)}`
                        : 'not set'}
                    </td>
                    <td className="num mono">{unit.childCount || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="tiny muted">
        Hamlet geocodes are what the offline map picker on the field device resolves an address to, and what the
        spatial cluster scan runs over.
      </p>
    </>
  );
}
