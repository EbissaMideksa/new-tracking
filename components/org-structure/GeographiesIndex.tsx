'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OrgShell } from './OrgShell';
import { DirectorPickerDialog } from './DirectorPickerDialog';
import { Icon } from './Icon';
import { setZoneDirector, type DirectorCandidate } from '@/lib/org/orgApi';
import { type GeoCategory, type OrgOverview, type OrgZone } from '@/lib/org/types';
import { useOrg } from '@/lib/org/useOrg';
import s from './org.module.css';

/** Per-page copy — one screen per category (Zones | Regions), same component. */
const PAGE_COPY: Record<GeoCategory, { title: string; sub: string; noun: string }> = {
  ADDIS_ABABA: {
    title: 'Zones',
    sub: 'Every Addis Ababa field zone — one shared Operational Director each, coordinating all local departments and divisions.',
    noun: 'zones',
  },
  REGION: {
    title: 'Regions',
    sub: 'Every regional field unit — one shared Operational Director each, coordinating all local departments and divisions.',
    noun: 'regions',
  },
};

/** Geographies index for ONE category — zones (/dashboard/organization/zones)
 *  or regions (/dashboard/organization/regions). Each card opens the
 *  geography's local-coordination page; privileged users can assign the shared
 *  Operational Director inline. The list starts collapsed so the page header
 *  stays scannable, and expands via the group toggle or by searching. */
export function GeographiesIndex({
  overview,
  canEdit,
  category,
}: {
  overview: OrgOverview;
  canEdit: boolean;
  category: GeoCategory;
}) {
  const { overview: live, loading, error, refetch } = useOrg();
  const current = live ?? overview;
  const copy = PAGE_COPY[category];
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dialogZone, setDialogZone] = useState<OrgZone | null>(null);

  const needle = query.trim().toLowerCase();
  const zones = useMemo(
    () =>
      current.zones.filter(
        (z) =>
          z.category === category &&
          (!needle || `${z.code} ${z.name} ${z.directorName ?? ''}`.toLowerCase().includes(needle)),
      ),
    [current.zones, category, needle],
  );

  const assigned = zones.filter((z) => z.directorName).length;
  const zoneIds = useMemo(() => new Set(zones.map((z) => z.id)), [zones]);
  const unitTotal = current.divisions.reduce(
    (n, d) =>
      n +
      d.departments.reduce(
        (m, p) => m + p.units.filter((u) => zoneIds.has(u.zoneId)).length,
        0,
      ),
    0,
  );

  // Typing in the search implies the list is wanted — open it automatically.
  const showList = expanded || needle.length > 0;

  return (
    <OrgShell canEdit={canEdit}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        Organization <span>›</span> <b>{copy.title}</b>
      </nav>

      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>{copy.title}</h1>
          <p className={s.sub}>{copy.sub}</p>
        </div>
        <div className={s.headBtns}>
          <span className={s.badge}>
            {zones.length} {copy.noun} · {assigned} assigned
          </span>
        </div>
      </div>

      <section className={s.card} aria-label={`${copy.title} list`}>
        <div className={s.cardHead}>
          <button
            type="button"
            className={s.cardTitle}
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={showList}
            aria-label={showList ? `Collapse ${copy.noun}` : `Expand ${copy.noun}`}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <Icon name={showList ? 'chevronDown' : 'chevronRight'} size={16} />
            <Icon name="pin" size={16} />
            <span>{copy.title}</span>
            <span className={s.badge}>{unitTotal} local units</span>
          </button>
          <label className={s.searchBox2}>
            <Icon name="search" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${copy.noun} or director…`}
              aria-label={`Search ${copy.noun}`}
            />
          </label>
        </div>

        {loading && !live && <p className={s.empty}>Loading {copy.noun}…</p>}
        {error && <p className={s.empty}>⚠ {error}</p>}
        {!loading && !zones.length && (
          <p className={s.empty}>
            No {copy.noun} yet. Run the organization seed (<code>npx tsx prisma/seed.ts</code>) to add
            them.
          </p>
        )}

        {showList && zones.length > 0 && (
          <div className={s.geoGrid}>
            {zones.map((z) => (
              <article key={z.id} className={s.geoCard}>
                <div className={s.geoCardTop}>
                  <span className={s.geoChip}>{z.code}</span>
                  <span className={s.geoName}>{z.name}</span>
                </div>
                <p className={s.geoMeta}>
                  <Icon name="users" size={12} /> {z.unitCount} local unit{z.unitCount === 1 ? '' : 's'}
                </p>
                <p className={s.geoDir}>
                  <Icon name="pin" size={12} />
                  {z.directorName ? (
                    <span className={s.geoDirName}>{z.directorName}</span>
                  ) : (
                    <span className={s.geoDirUnassigned}>Operational Director · Unassigned</span>
                  )}
                </p>
                <div className={s.geoFoot}>
                  <Link href={`/dashboard/organization/zones/${z.code}`} className={s.btn}>
                    <Icon name="chevronRight" size={13} /> Open
                  </Link>
                  {canEdit && (
                    <button
                      type="button"
                      className={s.btnGhost}
                      onClick={() => setDialogZone(z)}
                      aria-label={`Assign ${z.code} Operational Director`}
                    >
                      <Icon name="pencil" size={13} />{' '}
                      {z.directorName ? 'Change director' : 'Assign director'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={s.noteInfo}>
          <Icon name="shield" size={14} />
          <span>
            Directors are geography-wide, never department-specific. These screens read the database
            directly — geographies are created by the organization seed.
          </span>
        </p>
      </section>

      {dialogZone && (
        <DirectorPickerDialog
          title={`${dialogZone.code} Operational Director`}
          subtitle="One geography-wide role shared by every local worker in this zone or region, across all divisions and departments."
          currentUserId={dialogZone.directorUserId}
          unassignLabel="Clear assignment"
          onClose={() => setDialogZone(null)}
          onSubmit={async (user: DirectorCandidate | null) => {
            await setZoneDirector(dialogZone.id, {
              directorUserId: user?.id ?? null,
              directorName: null,
            });
            await refetch();
          }}
        />
      )}
    </OrgShell>
  );
}
