import { useMemo, useState } from 'react';
import { LEVEL_LABELS, type AddressLevel } from '@mgms/shared';

export interface AddressNode {
  id: string;
  code: string;
  name: string;
  nameLocal?: string | null;
  level: string;
  parentId: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Address selection by drilling down the hierarchy, working entirely from the
 * offline bundle already on the device.
 *
 * The spec describes a map interface — touching state, then district, then
 * taluk, then village, then hamlet. This is that interaction without the map
 * tiles, which a camp tablet will not have a route to fetch. The result is the
 * same: a hamlet id, whose pre-fixed geocode is what the surveillance analysis
 * actually runs on.
 */
export function AddressPicker({
  units,
  rootId,
  value,
  onChange,
}: {
  units: AddressNode[];
  /** Start the drill-down at the camp's own district. */
  rootId: string;
  value: string | null;
  onChange: (unit: AddressNode | null) => void;
}) {
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, AddressNode[]>();
    for (const unit of units) {
      if (!unit.parentId) continue;
      const list = map.get(unit.parentId) ?? [];
      list.push(unit);
      map.set(unit.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [units]);

  const [trail, setTrail] = useState<AddressNode[]>(() => {
    // Reopen at the previously chosen unit so an edit does not restart the
    // drill-down from the district.
    if (!value) return [];
    const chain: AddressNode[] = [];
    let current = byId.get(value);
    while (current && current.id !== rootId) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain.slice(0, -1);
  });
  const [search, setSearch] = useState('');

  const parentId = trail[trail.length - 1]?.id ?? rootId;
  const options = search.trim()
    ? units
        .filter((u) => u.level === 'HAMLET' || u.level === 'VILLAGE')
        .filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 40)
    : (childrenOf.get(parentId) ?? []);

  const root = byId.get(rootId);
  const selected = value ? byId.get(value) : null;

  function choose(unit: AddressNode) {
    const hasChildren = (childrenOf.get(unit.id) ?? []).length > 0;
    if (hasChildren) {
      setSearch('');
      setTrail(search.trim() ? [unit] : [...trail, unit]);
      // Selecting a village that still has hamlets is valid — the hamlet is
      // an optional extra level of precision, not a requirement.
      onChange(unit);
    } else {
      onChange(unit);
    }
  }

  return (
    <div>
      <div className="crumbs">
        <button type="button" className={`crumb ${trail.length === 0 ? 'on' : ''}`} onClick={() => { setTrail([]); setSearch(''); }}>
          {root?.name ?? 'District'}
        </button>
        {trail.map((unit, index) => (
          <button
            key={unit.id}
            type="button"
            className={`crumb ${index === trail.length - 1 ? 'on' : ''}`}
            onClick={() => setTrail(trail.slice(0, index + 1))}
          >
            {unit.name}
          </button>
        ))}
      </div>

      <input
        className="text-input"
        placeholder="Or search for a village or hamlet"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search village or hamlet"
        style={{ marginBottom: 10 }}
      />

      {options.length === 0 ? (
        <p className="small muted">
          {search.trim() ? 'No village or hamlet matches that name.' : 'This is the lowest level available here.'}
        </p>
      ) : (
        <div className="pick-list">
          {options.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="pick"
              aria-pressed={value === unit.id}
              onClick={() => choose(unit)}
            >
              <span>
                {unit.name}
                {unit.nameLocal && <span className="local muted"> · {unit.nameLocal}</span>}
              </span>
              <span className="lvl">
                {LEVEL_LABELS[unit.level as AddressLevel] ?? unit.level}
                {(childrenOf.get(unit.id) ?? []).length > 0 && ' ›'}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <p className="small" style={{ marginTop: 10 }}>
          Selected: <strong>{selected.name}</strong>{' '}
          <button type="button" className="btn small" onClick={() => onChange(null)} style={{ marginLeft: 6 }}>
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
