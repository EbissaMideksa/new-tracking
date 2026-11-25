'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { CATEGORY_LABEL, type OrgOverview } from '@/lib/org/types';
import s from './org.module.css';

/** "Units directory" tab — flat, searchable list of every local unit. */
export function UnitsDirectory({ overview }: { overview: OrgOverview }) {
  const [q, setQ] = useState('');
  const [zone, setZone] = useState('');

  const rows = useMemo(() => {
    const zoneByCode = new Map(overview.zones.map((z) => [z.code, z]));
    return overview.divisions.flatMap((d) =>
      d.departments.flatMap((p) =>
        p.units.map((u) => ({
          id: u.id,
          name: u.name,
          division: d.name,
          department: p.name,
          zoneCode: u.zoneCode,
          category: zoneByCode.get(u.zoneCode)?.category,
        })),
      ),
    );
  }, [overview]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (!zone || r.zoneCode === zone) && (!needle || `${r.name} ${r.division} ${r.department}`.toLowerCase().includes(needle)),
  );

  return (
    <section className={s.card} aria-label="Units directory">
      <header className={s.cardHead}>
        <div className={s.cardTitle}>
          <Icon name="users" size={16} />
          <span>Local units</span>
          <span className={s.badge}>
            {shown.length} of {rows.length}
          </span>
        </div>
        <div className={s.headBtns}>
          <label className={s.searchBox}>
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search units…" aria-label="Search units" />
          </label>
          <select className={s.input} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Filter by zone">
            <option value="">All zones &amp; regions</option>
            {overview.zones.map((z) => (
              <option key={z.id} value={z.code}>
                {z.code}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Functional parent</th>
              <th>Geography</th>
              <th>Reports locally to</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/dashboard/organization/zones/${r.zoneCode}`}>{r.name}</Link>
                </td>
                <td>
                  {r.division} · {r.department}
                </td>
                <td>
                  {r.zoneCode} <span className={s.muted}>({r.category ? CATEGORY_LABEL[r.category] : '—'})</span>
                </td>
                <td>{r.zoneCode} Operational Director</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={4} className={s.empty}>
                  No units match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
