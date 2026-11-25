//components/org-structure/OrgGeographyView.tsx
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { cx } from './Popover';
import { geoHref } from '@/lib/org/paths';
import { CATEGORY_LABEL, type GeoCategory, type OrgOverview, type OrgZone } from '@/lib/org/types';
import s from './org.module.css';

interface Props {
  overview: OrgOverview;
  collapseTick: number;
  query: string;
}

/** "By geography" tab — geography-wide parent→children tree:
 *  Addis Ababa / Regions → zones → local units (dotted connectors).
 *  Everything starts collapsed and expands on click. */
export function OrgGeographyView({ overview, collapseTick, query }: Props) {
  const unitsByZone = useMemo(() => {
    const map = new Map<string, { id: string; name: string; division: string; department: string }[]>();
    for (const d of overview.divisions) {
      for (const p of d.departments) {
        for (const u of p.units) {
          const list = map.get(u.zoneId) ?? [];
          list.push({ id: u.id, name: u.name, division: d.name, department: p.name });
          map.set(u.zoneId, list);
        }
      }
    }
    return map;
  }, [overview.divisions]);

  const categories: GeoCategory[] = ['ADDIS_ABABA', 'REGION'];
  const [openCats, setOpenCats] = useState<Set<GeoCategory>>(() => new Set());
  const [openZones, setOpenZones] = useState<Set<string>>(() => new Set());

  // Collapse-all support.
  const [lastCollapse, setLastCollapse] = useState(collapseTick);
  if (collapseTick !== lastCollapse) {
    setLastCollapse(collapseTick);
    if (collapseTick > 0) {
      setOpenCats(new Set());
      setOpenZones(new Set());
    }
  }

  const needle = query.trim().toLowerCase();
  const zonesByCat = (cat: GeoCategory) =>
    overview.zones.filter(
      (z) =>
        z.category === cat &&
        (!needle ||
          z.code.toLowerCase().includes(needle) ||
          z.name.toLowerCase().includes(needle) ||
          (z.directorName ?? '').toLowerCase().includes(needle) ||
          (unitsByZone.get(z.id) ?? []).some((u) => `${u.name} ${u.department}`.toLowerCase().includes(needle)))
    );

  const flipCat = (cat: GeoCategory) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const flipZone = (id: string) =>
    setOpenZones((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <section className={s.fcard} aria-label="Geography-wide hierarchy">
      <header className={s.fcardHead}>
        <h2 className={s.fcardTitle}>Geography-wide hierarchy</h2>
        <span className={s.fcardMeta}>Zones &amp; regions · one Operational Director each</span>
      </header>

      {categories.map((cat) => {
        // A search opens matching groups so results are visible.
        const open = openCats.has(cat) || (!!needle && zonesByCat(cat).length > 0);
        const zones = zonesByCat(cat);
        const unitTotal = zones.reduce((n, z) => n + (unitsByZone.get(z.id)?.length ?? 0), 0);
        return (
          <div key={cat}>
            <button
              type="button"
              className={cx(s.geoCatRow, open && s.geoCatOpen)}
              onClick={() => flipCat(cat)}
              aria-expanded={open}
            >
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
              <Icon name="pin" size={15} />
              {CATEGORY_LABEL[cat]}
              <span className={s.geoCatMeta}>
                {zones.length} {cat === 'REGION' ? 'regions' : 'zones'} · {unitTotal} units
              </span>
            </button>

            {open && (
              <div className={s.geoBody}>
                {zones.map((z) => (
                  <ZoneNode
                    key={z.id}
                    zone={z}
                    units={unitsByZone.get(z.id) ?? []}
                    open={openZones.has(z.id)}
                    onToggle={() => flipZone(z.id)}
                  />
                ))}
                {!zones.length && <p className={s.empty}>Nothing matches your search.</p>}
              </div>
            )}
          </div>
        );
      })}

      <div className={s.noteInfo}>
        <Icon name="help" size={14} />
        <span>
          Local coordination is additional reporting, not a replacement for the functional department. Dotted
          connectors point to the geography-wide Operational Director shared by every unit in the zone or region.
        </span>
      </div>
    </section>
  );
}

/** A zone/region child — collapsed by default; expands to the units that report locally to its director. */
function ZoneNode({
  zone,
  units,
  open,
  onToggle,
}: {
  zone: OrgZone;
  units: { id: string; name: string; division: string; department: string }[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        className={cx(s.geoZoneRow, open && s.geoZoneOpen)}
        onClick={onToggle}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        <span className={s.railCode}>{zone.code}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          Operational Director
          <small style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>
            {zone.directorName ?? 'Unassigned'} · {units.length} local {units.length === 1 ? 'unit' : 'units'}
          </small>
        </span>
        <span className={s.geoDirTag}>{open ? 'Hide units' : `Show ${units.length} units`}</span>
      </button>

      {open && (
        <div className={s.geoUnits}>
          {units.map((u) => (
            <Link key={u.id} href={geoHref(zone.code, zone.category)} className={s.geoUnitRow}>
              <span className={s.dotTag}>local</span>
              {u.name}
              <span className={s.geoUnitMeta}>
                {u.division} · {u.department}
              </span>
            </Link>
          ))}
          {!units.length && <span className={s.miniUnitEmpty}>No local units created yet.</span>}
        </div>
      )}
    </div>
  );
}
