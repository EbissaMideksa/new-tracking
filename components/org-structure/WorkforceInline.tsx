
'use client';

import { useEffect, useState } from 'react';
import { useLiveChannel } from '@/hooks/useLiveChannel';
import { Icon } from './Icon';
import { fetchCorporateWorkforce, fetchZoneWorkforce } from '@/lib/org/workforceApi';
import type { WorkforceNode, ZoneWorkforce } from '@/lib/org/workforceTypes';
import { TreeNode, UserList } from './LocalWorkforceDrawer';
import w from './workforce.module.css';

interface Props {
  /** Department scope. Omit together with zoneCode → nothing to load. Omit with zoneCode → whole zone. */
  scope?: { division: string; department: string } | null;
  /** Present → the zone/region's workers. Absent → the department's corporate arm (scope required). */
  zoneCode?: string;
  /** true → no inner scroll box; the page scrolls instead */
  full?: boolean;
}

function collectIds(nodes: WorkforceNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id);
    collectIds(n.children, out);
  }
  return out;
}

export function WorkforceInline({ scope = null, zoneCode, full = false }: Props) {
  const [data, setData] = useState<ZoneWorkforce | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  // Live-link: any user create/update/delete re-pulls this workforce view.
  useLiveChannel<{ event: string; user?: unknown; userId?: string }>('/api/users/events', (payload) => {
    if (payload.event === 'created' || payload.event === 'updated' || payload.event === 'deleted') {
      setRefreshKey((k) => k + 1);
    }
  });

  const loadKey = `${zoneCode ?? 'corp'}|${scope?.division ?? '*'}|${scope?.department ?? '*'}|${refreshKey}`;
  const showDept = !scope; // whole-zone view → show each person's department

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    let req: Promise<ZoneWorkforce>;
    if (zoneCode) req = fetchZoneWorkforce(zoneCode, scope, ctrl.signal);
    else if (scope) req = fetchCorporateWorkforce(scope, ctrl.signal);
    else req = Promise.reject(new Error('Nothing to load'));

    req
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
  }, [loadKey]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className={w.inline}>
      {loading && <p className={w.state}>Loading workforce…</p>}
      {error && <p className={w.stateErr}>{error}</p>}
      {data && (
        <>
          <div className={w.inlineHead}>
            <span className={w.sumTotal}>
              <Icon name="users" size={13} /> {data.total} {data.total === 1 ? 'person' : 'people'}
            </span>
            {Object.entries(data.roleCounts).map(([role, n]) => (
              <span key={role} className={w.roleChip}>{role} · {n}</span>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" className={w.linkBtn} onClick={() => setOpen(new Set(collectIds(data.tree)))}>
              Expand all
            </button>
            <button type="button" className={w.linkBtn} onClick={() => setOpen(new Set())}>
              Collapse
            </button>
          </div>

          <div className={full ? undefined : w.inlineScroll}>
            {!data.total && <p className={w.state}>No users are assigned here yet.</p>}
            {data.directUsers.length > 0 && <UserList users={data.directUsers} showDept={showDept} />}
            {data.tree.map((n) => (
              <TreeNode
                key={n.id}
                node={n}
                depth={0}
                isOpen={(id) => open.has(id)}
                toggle={toggle}
                showDept={showDept}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
