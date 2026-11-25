
'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Icon } from './Icon';
import { Popover, cx } from './Popover';
import { SelectedUnitView } from './SelectedUnitView';
import { WorkforceInline } from './WorkforceInline';
import type { UnitSelection } from './unitSelection';
import { geoHref } from '@/lib/org/paths';
import type { GeoCategory, OrgDepartment, OrgDivision, OrgOverview } from '@/lib/org/types';
import s from './org.module.css';
import w from './workforce.module.css';

interface Props {
  overview: OrgOverview;
  canEdit: boolean;
  /** When true, pencils + division menus are shown. */
  editMode: boolean;
  /** Search box value — filters divisions / departments / units. */
  query: string;
  /** Bump these numbers from the toolbar to expand / collapse every node. */
  expandTick: number;
  collapseTick: number;
  onRenameNode: (node: { id: string; name: string; kind: 'DIVISION' | 'DEPARTMENT' }) => void;
  onAddDepartment: (division: OrgDivision) => void;
  onAssignDeptDirector: (department: OrgDepartment) => void;
  onDeleteDivision: (division: OrgDivision) => void;
  onDeleteDepartment: (division: OrgDivision, dept: OrgDepartment) => void;
}

type Zone = OrgOverview['zones'][number];

const GROUPS: { cat: GeoCategory; panelLabel: string }[] = [
  { cat: 'ADDIS_ABABA', panelLabel: 'Addis Ababa · Zones' },
  { cat: 'REGION', panelLabel: 'Regions' },
];

type UnitLike = { id: string; name: string; zoneId: string; zoneCode: string };
type SelectUnit = (division: OrgDivision, dept: OrgDepartment, unit: UnitLike) => void;
type SelectCorporate = (division: OrgDivision, dept: OrgDepartment) => void;

/** Users attached to a section / group. Read defensively — these fields may
 *  not exist on the shared types. */
type NodeUser = { id: string; name: string; role: string; orgUnitName?: string | null };

function usersOf(node: unknown): NodeUser[] {
  const users = (node as { users?: NodeUser[] } | null | undefined)?.users;
  return Array.isArray(users) ? users : [];
}

const userTitle = (users: NodeUser[]) =>
  users.map((u) => `${u.name} (${u.role})`).join('\n') || undefined;

function UserRows({ users }: { users: NodeUser[] }) {
  return (
    <div className={s.deptUserList}>
      {users.map((u) => (
        <div key={u.id} className={s.deptUserRow}>
          <Icon name="user" size={12} />
          <span className={s.deptUserName}>{u.name}</span>
          <span className={s.deptUserRole}>{u.role}</span>
          {u.orgUnitName && <span className={s.deptUserOrgUnit}>{u.orgUnitName}</span>}
        </div>
      ))}
    </div>
  );
}

/** Plain click selects; ctrl/cmd/shift/middle-click keeps the normal link behaviour. */
const isPlainClick = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0);

const flipSet = (set: Set<string>, id: string) => {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
};

/** "Zones" / "Regions" CATEGORY folder name → geography category. */
const catOf = (name: string): GeoCategory => (/region/i.test(name) ? 'REGION' : 'ADDIS_ABABA');

export function OrgHierarchyView({
  overview,
  canEdit,
  editMode,
  query,
  expandTick,
  collapseTick,
  onRenameNode,
  onAddDepartment,
  onAssignDeptDirector,
  onDeleteDivision,
  onDeleteDepartment,
}: Props) {
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<UnitSelection | null>(null);

  const needle = query.trim().toLowerCase();
  const zonesByCat = useMemo(
    () => ({
      ADDIS_ABABA: overview.zones.filter((z) => z.category === 'ADDIS_ABABA'),
      REGION: overview.zones.filter((z) => z.category === 'REGION'),
    }),
    [overview.zones]
  );

  const zoneHref = (code: string) =>
    geoHref(code, overview.zones.find((z) => z.code === code)?.category);

  // Search-filtered view of the tree.
  const divisions = useMemo(() => {
    if (!needle) return overview.divisions;
    return overview.divisions
      .map((d) => {
        const divHit = `${d.name} ${d.code} ${d.subtitle}`.toLowerCase().includes(needle);
        const departments = d.departments
          .map((p) => ({
            ...p,
            units: p.units.filter((u) => divHit || `${u.name} ${u.zoneCode}`.toLowerCase().includes(needle)),
          }))
          .filter((p) => divHit || p.name.toLowerCase().includes(needle) || p.units.length > 0);
        return { ...d, departments };
      })
      .filter((d) => d.departments.length > 0);
  }, [overview.divisions, needle]);

  useEffect(() => {
    if (needle) setOpenDepts(new Set(divisions.flatMap((d) => d.departments.map((p) => p.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle]);

  useEffect(() => {
    if (expandTick > 0) setOpenDepts(new Set(divisions.flatMap((d) => d.departments.map((p) => p.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandTick]);

  useEffect(() => {
    if (collapseTick > 0) setOpenDepts(new Set());
  }, [collapseTick]);

  // Drop a zone/region selection if the unit disappears after a refresh.
  // Corporate selections have no zone, so they are left alone.
  useEffect(() => {
    if (!sel || sel.kind === 'corporate') return;
    const exists = overview.divisions.some((d) =>
      d.departments.some((p) => p.id === sel.deptId && p.units.some((u) => u.zoneId === sel.zoneId))
    );
    if (!exists) setSel(null);
  }, [overview, sel]);

  const toggleDept = (id: string) => setOpenDepts((prev) => flipSet(prev, id));

  const selectUnit: SelectUnit = (division, dept, unit) => {
    const zone = overview.zones.find((z) => z.id === unit.zoneId);
    setSel({
      kind: 'zone',
      divisionId: division.id,
      deptId: dept.id,
      zoneId: unit.zoneId,
      zoneCode: unit.zoneCode,
      zoneName: zone?.name ?? unit.zoneCode,
      zoneCategory: zone?.category ?? null,
      unitName: unit.name,
      division: division.subtitle || division.name,
      department: dept.name,
      functionalDirector: dept.directorName ?? null,
      operationalDirector: zone?.directorName ?? null,
    });
  };

  const selectCorporate: SelectCorporate = (division, dept) => {
    setSel({
      kind: 'corporate',
      divisionId: division.id,
      deptId: dept.id,
      zoneId: null,
      zoneCode: null,
      zoneName: null,
      unitName: `${division.code} ${dept.name} · Corporate`,
      division: division.subtitle || division.name,
      department: dept.name,
      functionalDirector: dept.directorName ?? null,
      operationalDirector: null,
    });
  };

  // All hooks are above this line — the early return is safe.
  if (sel) {
    return <SelectedUnitView sel={sel} onBack={() => setSel(null)} />;
  }

  return (
    <>
      {/* ── Card 1 · Functional hierarchy ─────────────────────────── */}
      <section className={s.fcard} aria-label="Functional hierarchy">
        <header className={s.fcardHead}>
          <h2 className={s.fcardTitle}>Functional hierarchy</h2>
          <span className={s.fcardMeta}>Divisions &amp; departments · {overview.corporate.name}</span>
        </header>

        <div className={s.rootWrap}>
          <div className={s.rootPill}>
            <span className={s.rootTitle}>
              <Icon name="globe" size={17} /> {overview.corporate.name}
            </span>
            <span className={s.rootSub}>{overview.corporate.subtitle || 'Organization root'}</span>
          </div>
          <span className={s.fxStem} />
        </div>
        <div className={s.fxBus} />

        <div className={s.divGrid}>
          {divisions.map((division) => (
            <DivisionCard
              key={division.id}
              division={division}
              corporate={overview.corporate.name}
              zones={overview.zones}
              zoneHref={zoneHref}
              openDepts={openDepts}
              toggleDept={toggleDept}
              canEdit={canEdit}
              editMode={editMode}
              onSelectUnit={selectUnit}
              onSelectCorporate={selectCorporate}
              onRenameNode={onRenameNode}
              onAddDepartment={onAddDepartment}
              onAssignDeptDirector={onAssignDeptDirector}
              onDeleteDivision={onDeleteDivision}
              onDeleteDepartment={onDeleteDepartment}
            />
          ))}
          {!divisions.length && (
            <p className={s.empty}>
              {needle ? 'No divisions, departments or units match your search.' : 'No divisions yet.'}
            </p>
          )}
        </div>
      </section>

      {/* ── Card 2 · Distributed workforce ────────────────────────── */}
      <section className={s.fcard} aria-label="Distributed workforce" style={{ marginTop: 16 }}>
        <p className={s.wfEyebrow}>Distributed workforce · all divisions</p>
        <div className={s.wfHeadRow}>
          <h2 className={s.wfTitle}>Workers by location — Corporate · Addis Ababa · Regions</h2>
          <Link href="/dashboard/organization/manage/new" className={s.btnTeal}>
            <Icon name="plus" size={14} /> Add unit
          </Link>
        </div>
        <p className={s.wfDesc}>
          Each division&apos;s departments have workers at Corporate Office, Addis Ababa zones, and regions.
          Workers retain functional department reporting and also report to their geography&apos;s Operational Director.
          Click Corporate or a unit to see its people.
        </p>

        {divisions.map((division) => (
          <div key={division.id} className={s.wfDiv}>
            <div className={s.wfDivHead}>
              <Icon name="branch" size={15} />
              {division.name}
              <span className={s.codeChip}>{overview.corporate.name}</span>
              <span className={s.wfDivLine} />
            </div>

            {division.departments.map((dept) => {
              const unitByZone = new Map(dept.units.map((u) => [u.zoneId, u]));
              return (
                <div key={dept.id} className={s.wfDept}>
                  <div className={s.wfDeptLabel}>
                    <span className={s.deptTag}>{dept.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Workforce by location</span>
                  </div>

                  <div className={s.wfCols}>
                    {/* Corporate — click to view this department's corporate people */}
                    <div className={s.wfPanel}>
                      <div className={s.wfPanelHead}>
                        <Icon name="building" size={12} /> Corporate
                      </div>
                      <button
                        type="button"
                        className={w.corpBtn}
                        title="Click to view the corporate workers of this department"
                        onClick={() => selectCorporate(division, dept)}
                      >
                        <strong>Corporate workers</strong>
                        <span>Click to view people · Section → Group</span>
                      </button>
                    </div>

                    {GROUPS.map((g) => (
                      <div key={g.cat} className={s.wfPanel}>
                        <div className={s.wfPanelHead}>
                          <Icon name="pin" size={12} /> {g.panelLabel}
                        </div>
                        <div className={s.wfChips}>
                          {zonesByCat[g.cat].map((z) => {
                            const unit = unitByZone.get(z.id);
                            return unit ? (
                              <Link
                                key={z.id}
                                href={geoHref(z.code, z.category)}
                                className={s.uChip}
                                title={`${unit.name} — click to show its people`}
                                onClick={(e) => {
                                  if (!isPlainClick(e)) return;
                                  e.preventDefault();
                                  selectUnit(division, dept, unit);
                                }}
                              >
                                {unit.name} <Icon name="arrowUpRight" size={11} />
                              </Link>
                            ) : (
                              <Link
                                key={z.id}
                                href={`/dashboard/organization/manage/new?department=${dept.nodeId ?? dept.id}&zone=${z.id}`}
                                className={s.addChip}
                                title={`Create ${z.code} ${division.code} ${dept.name}`}
                              >
                                <Icon name="plus" size={11} /> {z.code} {division.code} {dept.name}
                              </Link>
                            );
                          })}
                          {!zonesByCat[g.cat].length && (
                            <span className={s.miniUnitEmpty}>No geographies seeded.</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div className={s.noteInfo}>
          <Icon name="help" size={14} />
          <span>
            All zone and region units shown carry dual reporting: functional to their division department, and
            operational to their geography&apos;s single Operational Director. Corporate workers are excluded from
            geographic oversight.
          </span>
        </div>

        <div className={s.nameStrip}>
          <span className={s.nameStripLabel}>
            <Icon name="branch" size={13} /> Combined unit naming pattern
          </span>
          {overview.divisions.slice(0, 3).map((d, i) => (
            <span key={d.id} className={s.nameTag}>
              {zonesByCat.ADDIS_ABABA[i % Math.max(zonesByCat.ADDIS_ABABA.length, 1)]?.code ?? 'EAAZ'} {d.code}{' '}
              {d.departments[0]?.name ?? 'O&M'}
            </span>
          ))}
          <span>Geography + Division + Department</span>
        </div>

        <p className={s.privLine}>
          <Icon name="lock" size={13} />
          Only privileged users can create units, change parents or assign geography-wide Operational Directors.
        </p>
      </section>
    </>
  );
}

/** One division in the "Functional hierarchy" card — expandable department rows. */
function DivisionCard({
  division,
  corporate,
  zones,
  zoneHref,
  openDepts,
  toggleDept,
  canEdit,
  editMode,
  onSelectUnit,
  onSelectCorporate,
  onRenameNode,
  onAddDepartment,
  onAssignDeptDirector,
  onDeleteDivision,
  onDeleteDepartment,
}: {
  division: OrgDivision;
  corporate: string;
  zones: Zone[];
  zoneHref: (code: string) => string;
  openDepts: Set<string>;
  toggleDept: (id: string) => void;
  canEdit: boolean;
  editMode: boolean;
  onSelectUnit: SelectUnit;
  onSelectCorporate: SelectCorporate;
  onRenameNode: Props['onRenameNode'];
  onAddDepartment: Props['onAddDepartment'];
  onAssignDeptDirector: Props['onAssignDeptDirector'];
  onDeleteDivision: Props['onDeleteDivision'];
  onDeleteDepartment: Props['onDeleteDepartment'];
}) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openFieldUnits, setOpenFieldUnits] = useState<Set<string>>(new Set());

  const zoneById = new Map(zones.map((z) => [z.id, z]));

  return (
    <div className={s.divCard}>
      <div className={s.divCardTop}>
        <span className={s.divName}>{division.name}</span>
        {canEdit && editMode && (
          <Popover
            buttonClass={s.divMenuBtn}
            label={`Actions for ${division.name}`}
            buttonContent={<Icon name="dots" size={14} />}
          >
            {(close) => (
              <div className={s.menuPanel}>
                <button
                  type="button"
                  className={s.menuBtn}
                  onClick={() => {
                    close();
                    onRenameNode({ id: division.id, name: division.name, kind: 'DIVISION' });
                  }}
                >
                  <Icon name="pencil" size={13} /> Rename division
                </button>
                <button
                  type="button"
                  className={s.menuBtn}
                  onClick={() => {
                    close();
                    onAddDepartment(division);
                  }}
                >
                  <Icon name="plus" size={13} /> Add department
                </button>
                <div className={s.menuSep} />
                <button
                  type="button"
                  className={cx(s.menuBtn, s.menuBtnDanger)}
                  onClick={() => {
                    close();
                    onDeleteDivision(division);
                  }}
                >
                  <Icon name="close" size={13} /> Delete division
                </button>
              </div>
            )}
          </Popover>
        )}
      </div>
      <div className={s.divMeta}>
        <Icon name="building" size={12} /> {corporate}
      </div>

      <div className={s.deptList}>
        {division.departments.map((dept) => {
          const open = openDepts.has(dept.id);
          const openSectionUsers = dept.sections.filter(
            (sec) => usersOf(sec).length > 0 && openSections.has(sec.id)
          );
          const scope = { division: division.subtitle || division.name, department: dept.name };
          const spreadable = dept.placement !== 'CORPORATE_ONLY';

          return (
            <div key={dept.id}>
              <button
                type="button"
                className={cx(s.deptRow, open && s.deptRowOpen)}
                onClick={() => toggleDept(dept.id)}
                aria-expanded={open}
              >
                <span className={s.deptChev}>{open ? '▾' : '▸'}</span>
                <span className={s.deptInfo}>
                  <span className={s.deptTitle}>{dept.name}</span>
                  <span className={s.deptSub}>{corporate}</span>
                </span>
                {canEdit && editMode && (
                  <span
                    role="button"
                    tabIndex={0}
                    className={s.deptPencil}
                    aria-label={`Rename ${dept.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameNode({ id: dept.id, name: dept.name, kind: 'DEPARTMENT' });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onRenameNode({ id: dept.id, name: dept.name, kind: 'DEPARTMENT' });
                      }
                    }}
                  >
                    <Icon name="pencil" size={13} />
                  </span>
                )}
              </button>

              <div className={s.deptDirector}>
                <Icon name="shield" size={12} />
                <span>Functional director ·</span>
                {dept.directorName ? (
                  <span className={s.deptDirectorName}>{dept.directorName}</span>
                ) : (
                  <span className={s.deptDirectorUnassigned}>Unassigned</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className={s.deptAssignBtn}
                    onClick={() => onAssignDeptDirector(dept)}
                    aria-label={`Assign functional director to ${dept.name}`}
                  >
                    <Icon name="pencil" size={11} /> {dept.directorName ? 'Change' : 'Assign'}
                  </button>
                )}
              </div>

              {open && (
                <div className={s.deptUnits}>
                  <div className={s.deptUnitHead}>
                    <span className={cx(s.placementBadge, !spreadable && s.placementCorporate)}>
                      {spreadable ? 'Spreadable' : 'Corporate-only'}
                    </span>

                    {/* Field arm: Zones / Regions folders — click to load their users */}
                    {spreadable && dept.categories.length > 0 && (
                      <>
                        <span className={s.deptCatLabel}>Field arm:</span>
                        {dept.categories.map((c) => {
                          const key = `${dept.id}:${c.id}`;
                          const count = dept.units.filter(
                            (u) => zoneById.get(u.zoneId)?.category === catOf(c.name)
                          ).length;
                          return (
                            <span
                              key={c.id}
                              className={s.deptCatChip}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setOpenCats((p) => flipSet(p, key))}
                              title={`Show ${c.name.toLowerCase()} and their users`}
                            >
                              {openCats.has(key) ? '▾' : '▸'} {c.name} · {count}
                            </span>
                          );
                        })}
                      </>
                    )}

                    {dept.sections.length > 0 && (
                      <>
                        <span
                          className={s.deptCatLabel}
                          style={{ cursor: 'pointer', textDecoration: 'underline' }}
                          title="View corporate workers"
                          onClick={() => onSelectCorporate(division, dept)}
                        >
                          Corporate arm:
                        </span>

                        {dept.sections.map((sec) => {
                          const secUsers = usersOf(sec);
                          return (
                            <span
                              key={sec.id}
                              className={s.deptSectionChip}
                              onClick={() => setOpenSections((p) => flipSet(p, sec.id))}
                              style={{ cursor: 'pointer' }}
                              title={userTitle(secUsers)}
                            >
                              {sec.name}
                              {secUsers.length > 0 && <span className={s.deptUserCount}>· {secUsers.length}</span>}
                            </span>
                          );
                        })}

                        {openSectionUsers.length > 0 && (
                          <UserRows users={openSectionUsers.flatMap((sec) => usersOf(sec))} />
                        )}

                        {dept.sections.map((sec) => (
                          <span key={`${sec.id}-groups`} className={s.deptGroupList}>
                            {sec.groups.map((g) => {
                              const groupUsers = usersOf(g);
                              return (
                                <Fragment key={g.id}>
                                  <span
                                    className={s.deptGroupChip}
                                    onClick={() => setOpenGroups((p) => flipSet(p, g.id))}
                                    style={{ cursor: 'pointer' }}
                                    title={userTitle(groupUsers)}
                                  >
                                    {g.name}
                                    {groupUsers.length > 0 && (
                                      <span className={s.deptUserCount}>· {groupUsers.length}</span>
                                    )}
                                  </span>
                                  {groupUsers.length > 0 && openGroups.has(g.id) && <UserRows users={groupUsers} />}
                                </Fragment>
                              );
                            })}
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Opened Zones / Regions folders → units → Area → Site → users.
                      Same people as the Operational Director view, fetched, not copied. */}
                  {spreadable &&
                    dept.categories
                      .filter((c) => openCats.has(`${dept.id}:${c.id}`))
                      .map((c) => {
                        const units = dept.units.filter(
                          (u) => zoneById.get(u.zoneId)?.category === catOf(c.name)
                        );
                        return (
                          <div key={c.id} className={s.deptUserList}>
                            {!units.length && (
                              <span className={s.miniUnitEmpty}>No {c.name.toLowerCase()} units yet.</span>
                            )}
                            {units.map((u) => {
                              const k = `${dept.id}:${u.zoneId}`;
                              const isOpen = openFieldUnits.has(k);
                              return (
                                <div key={u.id}>
                                  <button
                                    type="button"
                                    className={s.menuBtn}
                                    onClick={() => setOpenFieldUnits((p) => flipSet(p, k))}
                                    aria-expanded={isOpen}
                                  >
                                    {isOpen ? '▾' : '▸'} {u.name}
                                  </button>
                                  {isOpen && <WorkforceInline scope={scope} zoneCode={u.zoneCode} />}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}

                  {dept.units.map((u) => (
                    <Link
                      key={u.id}
                      href={zoneHref(u.zoneCode)}
                      className={s.miniUnit}
                      title="Click to view this unit's people"
                      onClick={(e) => {
                        if (!isPlainClick(e)) return;
                        e.preventDefault();
                        onSelectUnit(division, dept, u);
                      }}
                    >
                      <Icon name="users" size={12} /> {u.name}
                      <span className={s.miniUnitCode}>{u.zoneCode}</span>
                    </Link>
                  ))}
                  {!dept.units.length && <span className={s.miniUnitEmpty}>No local units yet.</span>}
                  {canEdit && editMode && (
                    <button
                      type="button"
                      className={cx(s.menuBtn, s.menuBtnDanger)}
                      style={{ marginTop: 2 }}
                      onClick={() => onDeleteDepartment(division, dept)}
                    >
                      <Icon name="close" size={12} /> Delete department
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={s.divCardFoot}>All department workforce units shown below</div>
    </div>
  );
}
