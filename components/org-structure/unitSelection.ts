
import type { GeoCategory } from '@/lib/org/types';

export type UnitSelection = {
  /** 'zone' → a zone/region unit; 'corporate' → the department's corporate arm */
  kind: 'zone' | 'corporate';
  divisionId: string;
  deptId: string;
  zoneId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  /** ADDIS_ABABA → "zone", REGION → "region" */
  zoneCategory?: GeoCategory | null;
  unitName: string;
  division: string; // subtitle, e.g. "Fixed Network" (sent to the workforce API)
  department: string;
  functionalDirector: string | null;
  operationalDirector: string | null;
};
