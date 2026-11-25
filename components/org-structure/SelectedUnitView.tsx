
'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from './Icon';
import { OperationalDirectorCard } from './OperationalDirectorCard';
import { WorkforceInline } from './WorkforceInline';
import type { UnitSelection } from './unitSelection';
import { geoHref } from '@/lib/org/paths';
import s from './org.module.css';
import w from './workforce.module.css';

interface Props {
  sel: UnitSelection;
  onBack: () => void;
  /** Passed on the zone/region page itself: the button returns to that
   *  page's overview instead of navigating. Omit it elsewhere (it links to the page). */
  onOpenZone?: () => void;
}

export function SelectedUnitView({ sel, onBack, onOpenZone }: Props) {
  const scope = { division: sel.division, department: sel.department };
  const corporate = sel.kind === 'corporate';
  const isRegion = sel.zoneCategory === 'REGION';
  const zoneLabel = isRegion ? 'Open region page' : 'Open zone page';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    window.scrollTo({ top: 0 });
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <section className={w.full} aria-label={`${sel.unitName} workforce`}>
      <header className={w.fullHead}>
        <button type="button" className={s.btn} onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Back
        </button>
        <div className={w.fullTitleWrap}>
          <p className={w.crumb}>
            {sel.division} › {sel.department} › {corporate ? 'Corporate' : sel.zoneCode}
          </p>
          <h2 className={w.fullTitle}>{sel.unitName}</h2>
        </div>

        {!corporate &&
          sel.zoneCode &&
          (onOpenZone ? (
            <button type="button" className={s.btn} onClick={onOpenZone}>
              <Icon name="arrowUpRight" size={13} /> {zoneLabel}
            </button>
          ) : (
            <Link href={geoHref(sel.zoneCode, sel.zoneCategory)} className={s.btn}>
              <Icon name="arrowUpRight" size={13} /> {zoneLabel}
            </Link>
          ))}
      </header>

      <div className={w.fullReport} data-single={corporate ? 'true' : undefined}>
        <div className={w.fullReportCard}>
          <span className={w.reportLabel}>Functional director</span>
          <strong>{sel.functionalDirector ?? 'Unassigned'}</strong>
          <span className={w.reportKind}>solid line · {sel.department}</span>
        </div>
        {!corporate && sel.zoneCode && (
          <OperationalDirectorCard
            zoneCode={sel.zoneCode}
            category={sel.zoneCategory}
            directorName={sel.operationalDirector}
          />
        )}
      </div>

      <div className={w.fullGrid} data-single="true">
        <div className={w.fullPanel}>
          <div className={w.fullPanelHead}>
            {corporate ? (
              <>
                <Icon name="building" size={14} /> Corporate · {sel.department}
              </>
            ) : (
              <>
                <Icon name="pin" size={14} /> {sel.zoneCode} · local workforce
              </>
            )}
          </div>
          <WorkforceInline
            scope={scope}
            zoneCode={corporate ? undefined : sel.zoneCode ?? undefined}
            full
          />
        </div>
      </div>
    </section>
  );
}
