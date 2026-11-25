'use client';

import { Icon } from './Icon';
import { CATEGORY_LABEL, type GeoCategory } from '@/lib/org/types';
import s from './org.module.css';

interface Props {
  zoneCode: string;
  category?: GeoCategory | null;
  directorName: string | null;
}

/** Same card as the one on the zone/region page. */
export function OperationalDirectorCard({ zoneCode, category, directorName }: Props) {
  const isRegion = category === 'REGION';
  return (
    <div className={s.dirCard} style={{ maxWidth: 420 }}>
      <div className={s.dirCardTop}>
        <Icon name="pin" size={18} />
        <div>
          <strong>{zoneCode}</strong>
          <span>
            {category ? `${CATEGORY_LABEL[category]} · ` : ''}
            {isRegion ? 'Region' : 'Zone'}
          </span>
        </div>
      </div>
      <h3>Operational Director</h3>
      <p className={s.dirName}>{directorName ?? 'Unassigned'}</p>
      <p>Shared local coordination across every department in this {isRegion ? 'region' : 'zone'}.</p>
      <div className={s.dirInherit}>Inherited by all {zoneCode} units</div>
    </div>
  );
}
