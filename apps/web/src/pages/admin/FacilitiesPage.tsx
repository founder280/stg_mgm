import { useState } from 'react';
import { FACILITY_TYPES, SPECIALITIES } from '@mgms/shared';
import { useApi } from '../../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';

interface Facility {
  id: string;
  code: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  specialities: string[];
  bedCapacity: number | null;
  contactPhone: string | null;
  isEmpanelled: boolean;
  district: { id: string; name: string } | null;
}

export function FacilitiesPage() {
  const [type, setType] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [empanelledOnly, setEmpanelledOnly] = useState(false);

  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (speciality) params.set('speciality', speciality);
  if (empanelledOnly) params.set('empanelledOnly', 'true');

  const { data, isLoading, error } = useApi<{ items: Facility[] }>(
    ['facilities', params.toString()],
    `/facilities?${params}`,
  );

  if (error) return <ErrorBanner error={error} />;

  return (
    <>
      <PageHeader
        title="Facilities"
        subtitle="Hospitals, laboratories, drug warehouses and ambulance bases the camps refer into"
      />

      <div className="row">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Facility type">
          <option value="">All types</option>
          {FACILITY_TYPES.map((t) => (
            <option key={t.code} value={t.code}>{t.name}</option>
          ))}
        </select>
        <select className="select" value={speciality} onChange={(e) => setSpeciality(e.target.value)} aria-label="Speciality">
          <option value="">Any speciality</option>
          {SPECIALITIES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>
        <label className="row small" style={{ gap: 5 }}>
          <input type="checkbox" checked={empanelledOnly} onChange={(e) => setEmpanelledOnly(e.target.checked)} />
          Empanelled only
        </label>
        <div className="spacer" />
        {data && <span className="small muted">{data.items.length} facilities</span>}
      </div>

      <Card>
        {isLoading || !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <div className="empty">No facilities match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>District</th>
                  <th>Specialities</th>
                  <th className="num">Beds</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((facility) => (
                  <tr key={facility.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{facility.name}</div>
                      <div className="tiny mono muted">
                        {facility.code}
                        {facility.isEmpanelled && ' · empanelled'}
                      </div>
                    </td>
                    <td className="small">
                      {FACILITY_TYPES.find((t) => t.code === facility.type)?.name ?? facility.type}
                    </td>
                    <td className="small">{facility.district?.name ?? '—'}</td>
                    <td className="tiny secondary" style={{ maxWidth: 260 }}>
                      {facility.specialities.length > 0
                        ? facility.specialities.map((s) => s.replace(/_/g, ' ').toLowerCase()).join(', ')
                        : '—'}
                    </td>
                    <td className="num mono">{facility.bedCapacity ?? '—'}</td>
                    <td className="mono tiny">{facility.contactPhone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
