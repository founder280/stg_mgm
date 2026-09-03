import { useState } from 'react';
import { useApi } from '../../api/hooks';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeLevel: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

interface Matrix {
  permissions: Array<{ code: string; module: string }>;
  roles: Array<{ code: string; name: string; scopeLevel: string; permissions: string[] }>;
}

/**
 * Roles and the permission matrix.
 *
 * The matrix is the artefact an auditor asks for: which role may do what,
 * on one screen, with no clicking through individual roles.
 */
export function RolesPage() {
  const roles = useApi<{ items: RoleRow[] }>(['roles'], '/roles');
  const matrix = useApi<Matrix>(['role-matrix'], '/roles/matrix');
  const [module, setModule] = useState<string>('');

  if (roles.error) return <ErrorBanner error={roles.error} />;
  if (roles.isLoading || !roles.data || !matrix.data) return <Loading />;

  const modules = [...new Set(matrix.data.permissions.map((p) => p.module))].sort();
  const shownPermissions = matrix.data.permissions.filter((p) => !module || p.module === module);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Ten roles from state super user to volunteer. Built-in role permissions are fixed so the console cannot be locked out."
      />

      <Card title="Roles">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Role</th>
                <th>Scope</th>
                <th className="num">Permissions</th>
                <th className="num">Users</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {roles.data.items.map((role) => (
                <tr key={role.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{role.name}</div>
                    <div className="tiny mono muted">{role.code}</div>
                  </td>
                  <td className="small">{role.scopeLevel.toLowerCase()}</td>
                  <td className="num mono">{role.permissions.length}</td>
                  <td className="num mono">{role.userCount}</td>
                  <td className="small secondary" style={{ maxWidth: 420 }}>{role.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Permission matrix"
        subtitle="A filled cell means the role holds that permission"
        action={
          <select className="select" value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module">
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        }
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface-1)' }}>Permission</th>
                {matrix.data.roles.map((role) => (
                  <th key={role.code} className="num" style={{ writingMode: 'vertical-rl', height: 118, padding: '6px 2px' }}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownPermissions.map((permission) => (
                <tr key={permission.code}>
                  <td className="mono tiny" style={{ position: 'sticky', left: 0, background: 'var(--surface-1)', whiteSpace: 'nowrap' }}>
                    {permission.code}
                  </td>
                  {matrix.data!.roles.map((role) => {
                    const held = role.permissions.includes(permission.code);
                    return (
                      <td key={role.code} className="num" title={`${role.name}: ${held ? 'granted' : 'not granted'}`}>
                        {held ? (
                          <span style={{ color: 'var(--series-1)' }} aria-label="granted">●</span>
                        ) : (
                          <span className="muted" aria-label="not granted">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
