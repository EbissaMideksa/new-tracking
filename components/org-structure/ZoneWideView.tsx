
'use client';

import { useEffect } from 'react';
import { Icon } from './Icon';
import { OperationalDirectorCard } from './OperationalDirectorCard';
import { WorkforceInline } from './WorkforceInline';
import type { GeoCategory } from '@/lib/org/types';
import s from './org.module.css';
import w from './workforce.module.css';

interface Props {
  zoneCode: string;
  zoneName: string;
  category: GeoCategory;
  operationalDirector: string | null;
  onBack: () => void;
}

/** The Operational Director card, then everyone who reports to it (all departments). */
export function ZoneWideView({ zoneCode, zoneName, category, operationalDirector, onBack }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    window.scrollTo({ top: 0 });
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <section className={w.full} aria-label={`${zoneCode} operational director`}>
      <header className={w.fullHead}>
        <button type="button" className={s.btn} onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Back
        </button>
        <div className={w.fullTitleWrap}>
          <p className={w.crumb}>{zoneName} › all departments</p>
          <h2 className={w.fullTitle}>{zoneCode} · Operational Director</h2>
        </div>
      </header>

      <div className={w.fullReport} data-single="true">
        <OperationalDirectorCard zoneCode={zoneCode} category={category} directorName={operationalDirector} />
      </div>

      <div className={w.fullGrid} data-single="true">
        <div className={w.fullPanel}>
          <div className={w.fullPanelHead}>
            <Icon name="users" size={14} /> Reporting to this director · all departments
          </div>
          <WorkforceInline zoneCode={zoneCode} full />
        </div>
      </div>
    </section>
  );
}
