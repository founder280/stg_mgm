import { useState } from 'react';
import { useApi } from '../../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';

interface Symptom { id: string; code: string; name: string; nameLocal: string | null; group: string; redFlag: boolean; displayOrder: number; isActive: boolean }
interface Syndrome { id: string; code: string; name: string; caseDefinition: string; reference: string; priority: number; notifiable: boolean; version: number }
interface Drug { id: string; code: string; name: string; genericName: string; form: string; strength: string | null; emergencyTray: boolean; reorderLevel: number }
interface Equipment { code: string; name: string; critical: boolean }

type Tab = 'symptoms' | 'syndromes' | 'drugs' | 'equipment';

export function MastersPage() {
  const [tab, setTab] = useState<Tab>('symptoms');

  const symptoms = useApi<{ items: Symptom[] }>(['masters', 'symptoms'], '/masters/symptoms', { enabled: tab === 'symptoms' });
  const syndromes = useApi<{ items: Syndrome[] }>(['masters', 'syndromes'], '/masters/syndromes', { enabled: tab === 'syndromes' });
  const drugs = useApi<{ items: Drug[] }>(['masters', 'drugs'], '/masters/drugs', { enabled: tab === 'drugs' });
  const equipment = useApi<{ items: Equipment[] }>(['masters', 'equipment'], '/masters/equipment', { enabled: tab === 'equipment' });

  const active = { symptoms, syndromes, drugs, equipment }[tab];
  if (active.error) return <ErrorBanner error={active.error} />;

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="The lists the field form is built from. Symptoms can be tailored per gathering."
      />

      <div className="row" role="tablist" aria-label="Master data">
        {(['symptoms', 'syndromes', 'drugs', 'equipment'] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`chip ${tab === key ? 'on' : ''}`}
            type="button"
            onClick={() => setTab(key)}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {active.isLoading ? (
        <Loading />
      ) : tab === 'symptoms' ? (
        <Card title="Symptom master" subtitle="Screen 4 of the field form. A camp may present a subset of this list.">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th className="num">#</th><th>Symptom</th><th>Local name</th><th>Group</th><th>Sub-form</th><th>Red flag</th></tr>
              </thead>
              <tbody>
                {symptoms.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td className="num mono">{s.displayOrder}</td>
                    <td>{s.name}</td>
                    <td>{s.nameLocal ?? '—'}</td>
                    <td className="small muted">{s.group.toLowerCase()}</td>
                    <td className="small muted">{s.code === 'INJURY' ? 'injury detail' : s.code === 'BITE' ? 'bite detail' : '—'}</td>
                    <td className="small">{s.redFlag ? <span style={{ color: 'var(--status-serious)' }}>◆ yes</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'syndromes' ? (
        <Card
          title="Syndrome case definitions"
          subtitle="Stored as versioned rule trees, so a definition can be revised without a code release"
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Syndrome</th><th>Case definition</th><th>Reference</th><th className="num">Priority</th><th>Notifiable</th></tr>
              </thead>
              <tbody>
                {syndromes.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="tiny mono muted">{s.code} · v{s.version}</div>
                    </td>
                    <td className="small secondary" style={{ maxWidth: 420 }}>{s.caseDefinition}</td>
                    <td className="tiny muted" style={{ maxWidth: 200 }}>{s.reference}</td>
                    <td className="num mono">{s.priority}</td>
                    <td className="small">{s.notifiable ? '● yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'drugs' ? (
        <Card title="Drug master" subtitle="Camp inventory and prescription dropdowns are drawn from this list">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Drug</th><th>Generic</th><th>Form</th><th>Strength</th><th className="num">Reorder level</th><th>Emergency tray</th></tr>
              </thead>
              <tbody>
                {drugs.data?.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="small secondary">{d.genericName}</td>
                    <td className="small muted">{d.form.toLowerCase()}</td>
                    <td className="small">{d.strength ?? '—'}</td>
                    <td className="num mono">{d.reorderLevel}</td>
                    <td className="small">{d.emergencyTray ? '● required' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card title="Equipment master" subtitle="Checked in every pre-camp readiness report">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Equipment</th><th>Code</th><th>Critical</th></tr></thead>
              <tbody>
                {equipment.data?.items.map((e) => (
                  <tr key={e.code}>
                    <td>{e.name}</td>
                    <td className="mono tiny muted">{e.code}</td>
                    <td className="small">{e.critical ? <span style={{ color: 'var(--status-serious)' }}>◆ yes</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
