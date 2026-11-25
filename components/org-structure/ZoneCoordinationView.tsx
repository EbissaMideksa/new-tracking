
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectorLayer, type Measure, type PathSpec } from './ConnectorLayer';
import { Icon } from './Icon';
import { Popover, cx } from './Popover';
import { OrgShell } from './OrgShell';
import { DirectorPickerDialog } from './DirectorPickerDialog';
import { SelectedUnitView } from './SelectedUnitView';
import { ZoneWideView } from './ZoneWideView';
import type { UnitSelection } from './unitSelection';
import { ZoomPanCanvas, type CanvasHandle } from './ZoomPanCanvas';
import { setZoneDirector, type DirectorCandidate } from '@/lib/org/orgApi';
import { geoHref } from '@/lib/org/paths';
import { CATEGORY_LABEL, buildUnitName, type GeoCategory, type OrgOverview, type OrgZone } from '@/lib/org/types';
import s from './org.module.css';

interface Props {
  overview: OrgOverview;
  zone: OrgZone;
  canEdit: boolean;
}

/** What the page body is narrowed to. null → the normal diagram. */
type Picked =
  | { type: 'unit'; sel: UnitSelection }
  | { type: 'all' }
  | null;

/** Screen 2 — "EAAZ · Local coordination": one zone, all divisions/departments, one shared director. */
export function ZoneCoordinationView({ overview, zone, canEdit }: Props) {
  const router = useRouter();
  const canvas = useRef<CanvasHandle>(null);
  const scrollToDirector = useRef(false);
  const [hot, setHot] = useState<string | null>(null); // 'director' | unit id
  const [hiddenDivs, setHiddenDivs] = useState<Set<string>>(new Set());
  const [hiddenDepts, setHiddenDepts] = useState<Set<string>>(new Set()); // by department name
  const [picked, setPicked] = useState<Picked>(null);
  const [directorDialog, setDirectorDialog] = useState(false);

  const deptNames = useMemo(
    () => Array.from(new Set(overview.divisions.flatMap((d) => d.departments.map((p) => p.name)))),
    [overview],
  );
  const divisions = useMemo(
    () =>
      overview.divisions
        .filter((d) => !hiddenDivs.has(d.id))
        .map((d) => ({ ...d, departments: d.departments.filter((p) => !hiddenDepts.has(p.name)) }))
        .filter((d) => d.departments.length),
    [overview, hiddenDivs, hiddenDepts],
  );
  const filterCount = hiddenDivs.size + hiddenDepts.size;
  const zonesInCategory = overview.zones.filter((z) => z.category === zone.category);
  const catLabel = CATEGORY_LABEL[zone.category];
  const divCodes = overview.divisions.map((d) => d.code);
  const addHref = (extra = '') => `/dashboard/organization/manage/new?zone=${zone.id}${extra}`;

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  };

  // "Edit assignment" on the director card opens the shared-director dialog.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const zoneId = (e as CustomEvent<{ zoneId: string }>).detail?.zoneId;
      if (zoneId === zone.id) setDirectorDialog(true);
    };
    window.addEventListener('org:edit-director', onEdit as EventListener);
    return () => window.removeEventListener('org:edit-director', onEdit as EventListener);
  }, [zone.id]);

  // Leave the narrowed view when navigating to another zone/region.
  useEffect(() => {
    setPicked(null);
  }, [zone.id]);

  // Re-fit the diagram whenever it (re)appears so a stale pan/zoom offset
  // can't leave the body pushed right/down. Runs twice: once next frame,
  // once after fonts/layout settle.
  useEffect(() => {
    if (picked) return;
    const raf = requestAnimationFrame(() => canvas.current?.fit());
    const t = setTimeout(() => canvas.current?.fit(), 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [picked, zone.id]);

  // After "Open zone page": return to the overview, then bring the director card into view.
  useEffect(() => {
    if (picked || !scrollToDirector.current) return;
    scrollToDirector.current = false;
    const t1 = setTimeout(() => {
      document
        .querySelector('[data-node="director"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHot('director'); // highlight the card and its dashed lines
    }, 300);
    const t2 = setTimeout(() => setHot(null), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [picked]);

  const goCategory = (cat: GeoCategory) => {
    const first = overview.zones.find((z) => z.category === cat);
    if (first) router.push(geoHref(first.code, cat));
  };

  const pickUnit = (
    d: { id: string; code: string; name: string; subtitle: string },
    p: { id: string; name: string; directorName?: string | null },
    unitName: string,
  ) =>
    setPicked({
      type: 'unit',
      sel: {
        kind: 'zone',
        divisionId: d.id,
        deptId: p.id,
        zoneId: zone.id,
        zoneCode: zone.code,
        zoneName: zone.name,
        zoneCategory: zone.category,
        unitName,
        division: d.subtitle || d.name,
        department: p.name,
        functionalDirector: p.directorName ?? null,
        operationalDirector: zone.directorName ?? null,
      },
    });

  const pickAll = () => setPicked({ type: 'all' });

  const build = (m: Measure): PathSpec[] => {
    const out: PathSpec[] = [];
    const corp = m('corp');
    const dir = m('director');
    if (!corp) return out;

    const solidX = corp.r + 16; // functional trunk (solid)
    const dashX = corp.r + 36; // local trunk (dashed) — sits right of the solid one
    const busYs: number[] = [];
    const divBoxes = divisions.map((d) => m(`div:${d.id}`)).filter(Boolean);

    if (divBoxes.length) {
      const lastCy = divBoxes[divBoxes.length - 1]!.cy;
      out.push({
        key: 'corp-trunk',
        kind: 'functional',
        d:
          `M${corp.r} ${corp.cy}H${solidX}V${lastCy}` +
          divBoxes.map((b) => `M${solidX} ${b!.cy}H${b!.r}`).join(''),
      });
    }

    for (const d of divisions) {
      const dv = m(`div:${d.id}`);
      if (!dv) continue;
      const depts = d.departments.map((p) => ({ p, box: m(`dept:${p.id}`) })).filter((x) => x.box);
      if (depts.length) {
        const busY = Math.round(dv.b + (depts[0].box!.t - dv.b) / 2);
        const xs = depts.map((x) => x.box!.cx);
        out.push({
          key: `fx-${d.id}`,
          kind: 'functional',
          d:
            `M${dv.cx} ${dv.b}V${busY}M${Math.min(...xs)} ${busY}H${Math.max(...xs)}` +
            depts.map((x) => `M${x.box!.cx} ${busY}V${x.box!.t}`).join(''),
        });
      }

      // department → its local unit (short solid stub) + unit → local bus (dashed)
      const unitBoxes: { id: string; box: NonNullable<ReturnType<Measure>> }[] = [];
      for (const { p, box } of depts) {
        const unit = p.units.find((u) => u.zoneId === zone.id);
        const ub = unit && m(`unit:${unit.id}`);
        if (unit && ub && box) {
          out.push({ key: `stub-${unit.id}`, kind: 'functional', d: `M${box.cx} ${box.b}V${ub.t}` });
          unitBoxes.push({ id: unit.id, box: ub });
        }
      }
      if (unitBoxes.length) {
        const busY = Math.max(...unitBoxes.map((u) => u.box.b)) + 14;
        busYs.push(busY);
        const minX = Math.min(...unitBoxes.map((u) => u.box.cx));
        out.push({
          key: `bus-${d.id}`,
          kind: 'local',
          hot: hot === 'director',
          d: `M${minX} ${busY}H${dashX}`,
        });
        for (const u of unitBoxes) {
          out.push({
            key: `lx-${u.id}`,
            kind: 'local',
            hot: hot === u.id || hot === 'director',
            d: `M${u.box.cx} ${u.box.b}V${busY}`,
          });
        }
      }
    }

    if (dir && busYs.length) {
      const top = Math.min(dir.cy, ...busYs);
      const bottom = Math.max(dir.cy, ...busYs);
      out.push({
        key: 'dir-trunk',
        kind: 'local',
        hot: hot !== null,
        d: `M${dashX} ${top}V${bottom}M${dashX} ${dir.cy}H${dir.l}`,
      });
    }
    return out;
  };

  const directorDialogEl = directorDialog && (
    <DirectorPickerDialog
      title={`${zone.code} Operational Director`}
      subtitle="One geography-wide role shared by every local worker in this zone or region, across all divisions and departments."
      currentUserId={zone.directorUserId}
      unassignLabel="Clear assignment"
      onClose={() => setDirectorDialog(false)}
      onSubmit={async (user: DirectorCandidate | null) => {
        await setZoneDirector(zone.id, {
          directorUserId: user?.id ?? null,
          directorName: null,
        });
        router.refresh();
      }}
    />
  );

  // ── Narrowed view: only the selected part, with a Back button ──────────
  // All hooks are above this line, so the early return is safe.
  if (picked) {
    return (
      <OrgShell canEdit={canEdit}>
        <nav className={s.crumbs} aria-label="Breadcrumb">
          <Link href="/dashboard/organization">Organization</Link> <span>›</span> Geographies / {catLabel} /{' '}
          <b>{zone.code}</b>
        </nav>

        {picked.type === 'unit' ? (
          <SelectedUnitView
            sel={picked.sel}
            onBack={() => setPicked(null)}
            onOpenZone={() => {
              scrollToDirector.current = true;
              setPicked(null);
            }}
          />
        ) : (
          <ZoneWideView
            zoneCode={zone.code}
            zoneName={zone.name}
            category={zone.category}
            operationalDirector={zone.directorName ?? null}
            onBack={() => setPicked(null)}
          />
        )}

        {directorDialogEl}
      </OrgShell>
    );
  }

  return (
    <OrgShell canEdit={canEdit}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        <Link href="/dashboard/organization">Organization</Link> <span>›</span> Geographies / {catLabel} /{' '}
        <b>{zone.code}</b>
      </nav>

      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>{zone.code} · local coordination</h1>
          <p className={s.sub}>
            One {zone.category === 'REGION' ? 'region' : 'zone'}. One Operational Director. Functional reporting across
            all {divisions.length === overview.divisions.length ? 'three' : 'visible'} divisions remains unchanged.
          </p>
        </div>
        {canEdit && (
          <div className={s.headBtns}>
            <Link href="/dashboard/organization/manage/new" className={s.btn}>
              <Icon name="pencil" /> Edit hierarchy
            </Link>
            <Link href={addHref()} className={s.btnPrimary}>
              <Icon name="plus" /> Add local unit
            </Link>
          </div>
        )}
      </div>

      <div className={s.zoneBar}>
        <div className={s.zoneSelectors}>
          <label className={s.pillSelect}>
            <Icon name="pin" size={14} />
            <select
              value={zone.category}
              onChange={(e) => goCategory(e.target.value as GeoCategory)}
              aria-label="Category"
            >
              <option value="ADDIS_ABABA">{CATEGORY_LABEL.ADDIS_ABABA}</option>
              <option value="REGION">{CATEGORY_LABEL.REGION}</option>
            </select>
          </label>
          <label className={s.pillSelect}>
            <select
              value={zone.code}
              onChange={(e) => router.push(geoHref(e.target.value, zone.category))}
              aria-label="Zone"
            >
              {zonesInCategory.map((z) => (
                <option key={z.id} value={z.code}>
                  {z.code}
                </option>
              ))}
            </select>
          </label>
          <span className={s.badgeTeal}>Dual reporting enabled</span>
        </div>

        <div className={s.headBtns}>
          <Popover
            buttonClass={s.btn}
            label="Filter departments"
            buttonContent={
              <>
                <Icon name="filter" /> Departments{filterCount ? ` (${filterCount} hidden)` : ''}
              </>
            }
          >
            <fieldset className={s.filterSet}>
              <legend>Divisions</legend>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Select all divisions"
                  checked={hiddenDivs.size === 0}
                  ref={(el) => {
                    if (el) el.indeterminate = hiddenDivs.size > 0 && hiddenDivs.size < overview.divisions.length
                  }}
                  onChange={(e) =>
                    setHiddenDivs(e.target.checked ? new Set() : new Set(overview.divisions.map((d) => d.id)))
                  }
                />
                <span className="text-[11px] font-semibold text-slate-600">All divisions</span>
              </label>
              {overview.divisions.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={!hiddenDivs.has(d.id)}
                    onChange={() => setHiddenDivs((p) => flip(p, d.id))}
                  />
                  {d.name}
                </label>
              ))}
            </fieldset>
            <fieldset className={s.filterSet}>
              <legend>Departments</legend>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Select all departments"
                  checked={hiddenDepts.size === 0}
                  ref={(el) => {
                    if (el) el.indeterminate = hiddenDepts.size > 0 && hiddenDepts.size < deptNames.length
                  }}
                  onChange={(e) =>
                    setHiddenDepts(e.target.checked ? new Set() : new Set(deptNames))
                  }
                />
                <span className="text-[11px] font-semibold text-slate-600">All departments</span>
              </label>
              {deptNames.map((n) => (
                <label key={n}>
                  <input
                    type="checkbox"
                    checked={!hiddenDepts.has(n)}
                    onChange={() => setHiddenDepts((p) => flip(p, n))}
                  />
                  {n}
                </label>
              ))}
            </fieldset>
            {filterCount > 0 && (
              <button
                type="button"
                className={s.linkBtn}
                onClick={() => {
                  setHiddenDivs(new Set());
                  setHiddenDepts(new Set());
                }}
              >
                Reset filters
              </button>
            )}
          </Popover>
          <button type="button" className={s.btn} onClick={() => canvas.current?.fit()}>
            <Icon name="fit" /> Fit view
          </button>
        </div>
      </div>

      <section className={s.card} aria-label={`${zone.code} workforce and reporting`}>
        <header className={s.cardHead}>
          <div className={s.cardTitle}>
            <span>{zone.code} workforce &amp; reporting</span>
          </div>
          <div className={s.legend}>
            <span>
              <i className={s.legSolid} /> Functional reporting
            </span>
            <span>
              <i className={s.legDash} /> Local operational reporting
            </span>
          </div>
        </header>

        <ZoomPanCanvas ref={canvas} minWidth={1000}>
          <div className={s.zGrid}>
            <div className={s.zMain}>
              <div className={cx(s.corpBar, s.corpBarSlim)} data-node="corp">
                <Icon name="building" size={18} />
                <strong>{overview.corporate.name}</strong>
                <span>{divCodes.join(', ').replace(/, ([^,]*)$/, ' and $1')} functional divisions</span>
              </div>

              {divisions.map((d) => (
                <div key={d.id} className={s.zDivision}>
                  <div className={s.zDivBar} data-node={`div:${d.id}`}>
                    <Icon name="branch" size={14} />
                    <strong>{d.name}</strong>
                    <span>{d.subtitle}</span>
                    <em>{overview.corporate.name}</em>
                  </div>
                  <div
                    className={s.zDeptRow}
                    style={{ gridTemplateColumns: `repeat(${d.departments.length}, minmax(0, 1fr))` }}
                  >
                    {d.departments.map((p) => {
                      const unit = p.units.find((u) => u.zoneId === zone.id);
                      const openUnit = () => unit && pickUnit(d, p, unit.name);
                      return (
                        <div key={p.id} className={s.zDeptCol}>
                          <div
                            className={s.zDept}
                            data-node={`dept:${p.id}`}
                            title="Functional parent is fixed — change it in Manage hierarchy"
                          >
                            <div>
                              <strong>{p.name}</strong>
                              <span>Functional parent · {overview.corporate.name}</span>
                            </div>
                            <Icon name="lock" size={13} />
                          </div>
                          {unit ? (
                            <div
                              className={cx(s.zUnit, hot === unit.id && s.zUnitHot)}
                              data-node={`unit:${unit.id}`}
                              tabIndex={0}
                              role="button"
                              aria-haspopup="dialog"
                              title="Click to view this unit's workforce"
                              style={{ cursor: 'pointer' }}
                              onClick={openUnit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openUnit();
                                }
                              }}
                              onMouseEnter={() => setHot(unit.id)}
                              onMouseLeave={() => setHot(null)}
                              onFocus={() => setHot(unit.id)}
                              onBlur={() => setHot(null)}
                            >
                              <strong>{unit.name}</strong>
                              <span>
                                <Icon name="users" size={13} /> Local workforce
                              </span>
                            </div>
                          ) : canEdit ? (
                            <Link className={s.zUnitMissing} href={addHref(`&department=${p.nodeId ?? p.id}`)}>
                              <Icon name="plus" size={13} /> Add {buildUnitName(zone.code, d.code, p.name)}
                            </Link>
                          ) : (
                            <div className={s.zUnitMissing}>No {zone.code} unit</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!divisions.length && <p className={s.empty}>All departments are hidden by the filter.</p>}
            </div>

            <aside className={s.zSide}>
              <div className={s.noteCard}>
                <small>ONE DIRECTOR PER {zone.category === 'REGION' ? 'REGION' : 'ZONE'}</small>
                <p>
                  All {zone.code} workers across the {overview.divisions.reduce((n, d) => n + d.departments.length, 0)}{' '}
                  functional departments report locally to one shared director.
                </p>
              </div>

              <div
                className={cx(s.dirCard, hot !== null && s.dirCardHot)}
                data-node="director"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                title="Click to view every worker reporting to this director"
                style={{ cursor: 'pointer' }}
                onClick={pickAll}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickAll();
                  }
                }}
                onMouseEnter={() => setHot('director')}
                onMouseLeave={() => setHot(null)}
              >
                <div className={s.dirCardTop}>
                  <Icon name="pin" size={18} />
                  <div>
                    <strong>{zone.code}</strong>
                    <span>
                      {catLabel} · {zone.category === 'REGION' ? 'Region' : 'Zone'}
                    </span>
                  </div>
                </div>
                <h3>Operational Director</h3>
                {zone.directorName && <p className={s.dirName}>{zone.directorName}</p>}
                <p>Shared local coordination across {divCodes.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p>
                <div className={s.dirInherit}>Inherited by all {zone.code} units</div>
                {canEdit && (
                  <button
                    type="button"
                    className={s.btn}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('org:edit-director', { detail: { zoneId: zone.id } }));
                    }}
                  >
                    <Icon name="pencil" /> Edit assignment
                  </button>
                )}
              </div>

              <div className={s.noteCard}>
                <strong>Functional reporting stays intact</strong>
                <p>These are the same workers, not a second team. Their original department remains the functional parent.</p>
              </div>
            </aside>
          </div>

          <div className={s.footNote}>
            <Icon name="shield" />
            <span>
              Corporate Office workers are not included in this local view and do not report to the {zone.code}{' '}
              Operational Director. Dashed teal lines show the additional local relationship only.
            </span>
          </div>

          <ConnectorLayer build={build} />
        </ZoomPanCanvas>
      </section>

      <div className={s.zonePageFoot}>
        <span>Geography focus · {zone.code} / {catLabel}</span>
        <Link href="/dashboard/organization">
          <Icon name="arrowLeft" size={14} /> Back to organization
        </Link>
      </div>

      {directorDialogEl}
    </OrgShell>
  );
}
