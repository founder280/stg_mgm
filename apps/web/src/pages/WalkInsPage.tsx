import { useState } from 'react';
import { PERMISSIONS, WALKIN_STAGES } from '@mgms/shared';
import { useApi } from '../api/hooks';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, ErrorBanner, Loading, PageHeader } from '../components/common';
import { Pill } from '../components/Pill';
import { STAGE_LABELS, TRIAGE_STYLES, statusStyle } from '../charts/status';
import { formatDateTime } from '../charts/scales';

interface WalkInRow {
  id: string;
  tokenNumber: string;
  name: string;
  ageYears: number;
  ageBand: string;
  gender: string;
  stage: string;
  triageLevel: string;
  triageScore: number;
  primarySyndromeCode: string | null;
  registeredAt: string;
  camp: { id: string; name: string };
}

export function WalkInsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [triage, setTriage] = useState('');
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (search) params.set('search', search);
  if (stage) params.set('stage', stage);
  if (triage) params.set('triageLevel', triage);
  if (waitingOnly) params.set('waiting', 'true');

  const { data, isLoading, error } = useApi<{ items: WalkInRow[]; total: number; page: number; pageSize: number }>(
    ['walk-ins', params.toString()],
    `/walk-ins?${params}`,
    { refetchInterval: 30_000 },
  );

  async function exportCsv() {
    const csv = await api.text(`/walk-ins/export/csv?${params}`);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `walk-ins-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <ErrorBanner error={error} />;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Walk-ins"
        subtitle="Line listing across the camps you are assigned to"
        action={
          can(PERMISSIONS.WALKIN_EXPORT) ? (
            <button className="btn" type="button" onClick={() => void exportCsv()}>
              Export CSV
            </button>
          ) : undefined
        }
      />

      <div className="row">
        <input
          className="input"
          placeholder="Token or name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search by token or name"
        />
        <select className="select" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }} aria-label="Stage">
          <option value="">All stages</option>
          {WALKIN_STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select className="select" value={triage} onChange={(e) => { setTriage(e.target.value); setPage(1); }} aria-label="Triage">
          <option value="">All triage levels</option>
          {Object.entries(TRIAGE_STYLES).map(([key, style]) => (
            <option key={key} value={key}>{style.label}</option>
          ))}
        </select>
        <label className="row small" style={{ gap: 5 }}>
          <input type="checkbox" checked={waitingOnly} onChange={(e) => { setWaitingOnly(e.target.checked); setPage(1); }} />
          Waiting only
        </label>
        <div className="spacer" />
        {data && <span className="small muted">{data.total.toLocaleString()} records</span>}
      </div>

      <Card>
        {isLoading || !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <div className="empty">No walk-ins match this filter.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Name</th>
                    <th className="num">Age</th>
                    <th>Gender</th>
                    <th>Camp</th>
                    <th>Syndrome</th>
                    <th>Triage</th>
                    <th>Stage</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="mono small">{row.tokenNumber}</td>
                      <td>{row.name}</td>
                      <td className="num mono">{row.ageYears}</td>
                      <td className="small">{row.gender.charAt(0) + row.gender.slice(1).toLowerCase()}</td>
                      <td className="small">{row.camp.name}</td>
                      <td className="small">{row.primarySyndromeCode ?? <span className="muted">—</span>}</td>
                      <td>
                        <Pill style={statusStyle(TRIAGE_STYLES, row.triageLevel)} text={row.triageLevel} />
                      </td>
                      <td className="small">{STAGE_LABELS[row.stage] ?? row.stage}</td>
                      <td className="small muted">{formatDateTime(row.registeredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className="small muted">
                Page {data.page} of {totalPages}
              </span>
              <button className="btn btn-sm" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
