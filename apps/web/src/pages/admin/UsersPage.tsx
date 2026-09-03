import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@mgms/shared';
import { useApi } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Card, ErrorBanner, Loading, PageHeader } from '../../components/common';
import { formatDateTime } from '../../charts/scales';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  designation: string | null;
  roleCode: string;
  roleName: string;
  scopeLevel: string;
  department: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  assignmentCount: number;
}

interface RoleOption { code: string; name: string; scopeLevel: string }
interface AddressOption { id: string; name: string; level: string }
interface CampOption { id: string; name: string }

export function UsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams({ pageSize: '100' });
  if (search) params.set('search', search);
  if (roleCode) params.set('roleCode', roleCode);

  const users = useApi<{ items: UserRow[]; total: number }>(['users', params.toString()], `/users?${params}`);
  const roles = useApi<{ items: RoleOption[] }>(['roles'], '/roles');

  if (users.error) return <ErrorBanner error={users.error} />;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="You can only see and create users inside your own assigned area"
        action={
          can(PERMISSIONS.USER_WRITE) ? (
            <button className="btn btn-primary" type="button" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Add user'}
            </button>
          ) : undefined
        }
      />

      {showForm && <CreateUserForm roles={roles.data?.items ?? []} onDone={() => setShowForm(false)} />}

      <div className="row">
        <input
          className="input"
          placeholder="Name or username"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <select className="select" value={roleCode} onChange={(e) => setRoleCode(e.target.value)} aria-label="Role">
          <option value="">All roles</option>
          {roles.data?.items.map((role) => (
            <option key={role.code} value={role.code}>{role.name}</option>
          ))}
        </select>
        <div className="spacer" />
        {users.data && <span className="small muted">{users.data.total} users</span>}
      </div>

      <Card>
        {users.isLoading || !users.data ? (
          <Loading />
        ) : users.data.items.length === 0 ? (
          <div className="empty">No users match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th className="num">Areas</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{user.fullName}</div>
                      {user.designation && <div className="tiny muted">{user.designation}</div>}
                    </td>
                    <td className="mono small">{user.username}</td>
                    <td className="small">{user.roleName}</td>
                    <td className="small">{user.department ?? '—'}</td>
                    <td className="num mono">{user.assignmentCount}</td>
                    <td className="small">
                      {user.isActive ? (
                        <span style={{ color: 'var(--status-good-text)' }}>■ active</span>
                      ) : (
                        <span style={{ color: 'var(--status-critical)' }}>● disabled</span>
                      )}
                    </td>
                    <td className="small muted">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'never'}</td>
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

function CreateUserForm({ roles, onDone }: { roles: RoleOption[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    mobile: '',
    password: '',
    roleCode: roles[0]?.code ?? '',
    designation: '',
  });
  const [scopeType, setScopeType] = useState<'DISTRICT' | 'CAMP' | 'NONE'>('NONE');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const districts = useApi<{ items: AddressOption[] }>(['address', 'districts'], '/address?level=DISTRICT&hierarchy=ADMIN');
  const camps = useApi<{ items: CampOption[] }>(['camps'], '/camps');

  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the user'),
  });

  const selectedRole = roles.find((r) => r.code === form.roleCode);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate({
      ...form,
      email: form.email || undefined,
      mobile: form.mobile || undefined,
      designation: form.designation || undefined,
      assignments: scopeType === 'NONE' || !scopeId ? [] : [{ scopeType, scopeId }],
    });
  }

  return (
    <Card title="Add user" subtitle="The user is asked to change this password at first sign-in">
      <form onSubmit={submit}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} required />
          <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} required />
          <Field label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="9876543210" />
          <Field label="Initial password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />

          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" className="select" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
              {roles.map((role) => (
                <option key={role.code} value={role.code}>{role.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="scope-type">Assign to</label>
            <select
              id="scope-type"
              className="select"
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as typeof scopeType);
                setScopeId('');
              }}
            >
              <option value="NONE">No area (state-wide role)</option>
              <option value="DISTRICT">A district</option>
              <option value="CAMP">A camp</option>
            </select>
          </div>

          {scopeType !== 'NONE' && (
            <div className="field">
              <label htmlFor="scope-id">{scopeType === 'DISTRICT' ? 'District' : 'Camp'}</label>
              <select id="scope-id" className="select" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                <option value="">Select…</option>
                {(scopeType === 'DISTRICT' ? districts.data?.items : camps.data?.items)?.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedRole && (
          <p className="tiny muted" style={{ marginTop: 10 }}>
            {selectedRole.name} operates at <strong>{selectedRole.scopeLevel.toLowerCase()}</strong> level.
            {selectedRole.scopeLevel === 'CAMP' && ' Camp roles need a camp assignment to see any data.'}
          </p>
        )}

        {error && <div className="banner banner-error" style={{ marginTop: 10 }} role="alert">{error}</div>}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
          <button className="btn" type="button" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
