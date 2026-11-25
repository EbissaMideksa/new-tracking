
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { fetchZoneWorkforce } from '@/lib/org/workforceApi';
import type { WorkforceNode, WorkforceUser, ZoneWorkforce } from '@/lib/org/workforceTypes';
import w from './workforce.module.css';

interface Props {
  zoneCode: string;
  title: string;
  /** Present → one functional department. Absent → whole zone (Operational Director view). */
  scope?: { division: string; department: string } | null;
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  AREA: 'Area', SITE: 'Site', SECTION: 'Section', GROUP: 'Group', CORPORATE: 'Corporate',
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

type Pred = (u: WorkforceUser) => boolean;

/** Keep only branches that contain a matching user (or whose own name matches). */
function filterNode(node: WorkforceNode, needle: string, dept: string | null): WorkforceNode | null {
  if (!needle && !dept) return node;
  const selfHit = !!needle && node.name.toLowerCase().includes(needle);
  const match: Pred = (u) =>
    (!dept || u.department === dept) &&
    (!needle || selfHit || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(needle));
  const users = node.users.filter(match);
  const children = node.children
    .map((c) => filterNode(c, needle, dept))
    .filter((c): c is WorkforceNode => !!c);
  if (!users.length && !children.length) return null;
  const total = users.length + children.reduce((s, c) => s + c.total, 0);
  return { ...node, users, children, total };
}

function collectIds(nodes: WorkforceNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id);
    collectIds(n.children, out);
  }
  return out;
}

export function LocalWorkforceDrawer({ zoneCode, title, scope = null, onClose }: Props) {
  const [data, setData] = useState<ZoneWorkforce | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const scopeKey = scope ? `${scope.division}|${scope.department}` : 'zone';

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setDeptFilter(null);
    fetchZoneWorkforce(zoneCode, scope, ctrl.signal)
      .then((d) => {
        setData(d);
        setOpen(new Set(d.tree.map((n) => n.id)));
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(e?.message ?? 'Failed to load workforce');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneCode, scopeKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const filtering = !!needle || !!deptFilter;

  const tree = useMemo(
    () =>
      (data?.tree ?? [])
        .map((n) => filterNode(n, needle, deptFilter))
        .filter((n): n is WorkforceNode => !!n),
    [data, needle, deptFilter],
  );
  const directUsers = useMemo(
    () =>
      (data?.directUsers ?? []).filter(
        (u) =>
          (!deptFilter || u.department === deptFilter) &&
          (!needle || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(needle)),
      ),
    [data, needle, deptFilter],
  );

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const isOpen = (id: string) => filtering || open.has(id);

  const zoneWide = data?.scope === 'zone';

  return (
    <>
      <div className={w.backdrop} onClick={onClose} />
      <aside className={w.drawer} role="dialog" aria-modal="true" aria-label={`${title} workforce`}>
        <header className={w.head}>
          <div>
            <h3 className={w.title}>{title}</h3>
            <p className={w.sub}>
              {zoneWide
                ? `All departments · ${zoneCode}`
                : `Local workforce · ${scope?.department} · ${zoneCode}`}
            </p>
          </div>
          <button type="button" className={w.iconBtn} onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        {data && (
          <div className={w.reportBox}>
            {!zoneWide && (
              <div className={w.reportRow}>
                <span className={w.reportLabel}>Functional</span>
                <span className={w.reportName}>{data.functionalDirector ?? 'Unassigned'}</span>
                <span className={w.reportKind}>solid line</span>
              </div>
            )}
            <div className={w.reportRow}>
              <span className={w.reportLabel}>Operational</span>
              <span className={w.reportName}>{data.operationalDirector ?? 'Unassigned'}</span>
              <span className={w.reportKind}>dashed line</span>
            </div>
            <p className={w.reportNote}>
              Same people, two reporting lines — functional to their department,
              operational to the {zoneCode} Operational Director.
            </p>
          </div>
        )}

        {data && (
          <div className={w.summary}>
            <span className={w.sumTotal}>
              <Icon name="users" size={13} /> {data.total} {data.total === 1 ? 'person' : 'people'}
            </span>
            {Object.entries(data.roleCounts).map(([role, n]) => (
              <span key={role} className={w.roleChip}>{role} · {n}</span>
            ))}
          </div>
        )}

        {zoneWide && data && data.departments.length > 1 && (
          <div className={w.filters}>
            <button
              type="button"
              className={w.fChip}
              data-on={!deptFilter ? 'true' : undefined}
              onClick={() => setDeptFilter(null)}
            >
              All
            </button>
            {data.departments.map((d) => (
              <button
                key={d}
                type="button"
                className={w.fChip}
                data-on={deptFilter === d ? 'true' : undefined}
                onClick={() => setDeptFilter(deptFilter === d ? null : d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        <div className={w.tools}>
          <input
            className={w.search}
            type="search"
            placeholder="Search name, email, role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {data && (
            <>
              <button type="button" className={w.linkBtn} onClick={() => setOpen(new Set(collectIds(data.tree)))}>
                Expand all
              </button>
              <button type="button" className={w.linkBtn} onClick={() => setOpen(new Set())}>
                Collapse
              </button>
            </>
          )}
        </div>

        <div className={w.body}>
          {loading && <p className={w.state}>Loading workforce…</p>}
          {error && <p className={w.stateErr}>{error}</p>}
          {data && !loading && !tree.length && !directUsers.length && (
            <p className={w.state}>
              {filtering ? 'No one matches your filter.' : 'No users are assigned here yet.'}
            </p>
          )}

          {directUsers.length > 0 && <UserList users={directUsers} showDept={zoneWide} />}

          {tree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} isOpen={isOpen} toggle={toggle} showDept={zoneWide} />
          ))}
        </div>
      </aside>
    </>
  );
}

export function TreeNode({
  node, depth, isOpen, toggle, showDept,
}: {
  node: WorkforceNode;
  depth: number;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  showDept: boolean;
}) {
  const open = isOpen(node.id);
  const expandable = node.users.length > 0 || node.children.length > 0;
  return (
    <div className={w.node} style={{ marginLeft: depth ? 14 : 0 }}>
      <button
        type="button"
        className={w.nodeRow}
        onClick={() => expandable && toggle(node.id)}
        aria-expanded={open}
      >
        <span className={w.chev}>{expandable ? (open ? '▾' : '▸') : ''}</span>
        <Icon name={node.type === 'SITE' || node.type === 'GROUP' ? 'pin' : 'branch'} size={13} />
        <span className={w.nodeName}>{node.name}</span>
        <span className={w.typeTag}>{TYPE_LABEL[node.type] ?? node.type}</span>
        <span className={w.count}>{node.total}</span>
      </button>
      {open && (
        <div className={w.nodeBody}>
          {node.users.length > 0 && <UserList users={node.users} showDept={showDept} />}
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} isOpen={isOpen} toggle={toggle} showDept={showDept} />
          ))}
        </div>
      )}
    </div>
  );
}

export function UserList({ users, showDept }: { users: WorkforceUser[]; showDept: boolean }) {
  return (
    <ul className={w.users}>
      {users.map((u) => (
        <li key={u.id} className={w.user}>
          <span className={w.avatar}>{initials(u.name)}</span>
          <span className={w.userInfo}>
            <span className={w.userName}>{u.name}</span>
            <span className={w.userMail}>{u.email}</span>
            {showDept && u.department && <span className={w.deptBadge}>{u.department}</span>}
          </span>
          <span className={w.role}>{u.role}</span>
          {u.status && (
            <span
              className={w.dot}
              data-off={u.status !== 'ACTIVE' ? 'true' : undefined}
              title={u.status}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
