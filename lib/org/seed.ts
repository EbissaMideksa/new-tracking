// lib/org/seed.ts
import { buildUnitName, type GeoCategory, type OrgOverview } from './types';

// Single source of truth for the reference hierarchy.
// Used by prisma/seed-org.ts AND by buildSampleOverview() (dev preview / tests).
// NOTE: zone `name`s are placeholders (= code). Replace with the official names.

export const CORPORATE = {
  name: 'Corporate Office',
  subtitle: 'Functional ownership · divisions and departments',
};

export const DIVISIONS = [
  { code: 'FN', name: 'FN Division', subtitle: 'Fixed Network' },
  { code: 'WN', name: 'WN Division', subtitle: 'Wireless Network' },
  { code: 'NI', name: 'NI Division', subtitle: 'Network Infrastructure' },
];

export const DEPARTMENTS = ['O&M', 'Planning', 'Engineering'];

export const ZONES: { code: string; name: string; category: GeoCategory }[] = [
  { code: 'EAAZ', name: 'EAAZ', category: 'ADDIS_ABABA' },
  { code: 'NAAZ', name: 'NAAZ', category: 'ADDIS_ABABA' },
  { code: 'SAAZ', name: 'SAAZ', category: 'ADDIS_ABABA' },
  { code: 'WAAZ', name: 'WAAZ', category: 'ADDIS_ABABA' },
  { code: 'CWR', name: 'CWR', category: 'REGION' },
  { code: 'WR', name: 'WR', category: 'REGION' },
  { code: 'SWR', name: 'SWR', category: 'REGION' },
  { code: 'SER', name: 'SER', category: 'REGION' },
  { code: 'WWR', name: 'WWR', category: 'REGION' },
  { code: 'SR', name: 'SR', category: 'REGION' },
];

/** Full in-memory overview (every zone × department has a unit). Handy for UI dev without a DB. */
export function buildSampleOverview(opts?: { skip?: string[] }): OrgOverview {
  const skip = new Set(opts?.skip ?? []);
  const zones = ZONES.map((z) => ({ id: `zone-${z.code}`, ...z, directorName: null, directorUserId: null, unitCount: 0 }));
  return {
    name: 'Telecom',
    corporate: { id: 'corp', ...CORPORATE },
    zones,
    divisions: DIVISIONS.map((d) => ({
      id: `div-${d.code}`,
      ...d,
      departments: DEPARTMENTS.map((dept) => {
        const id = `dept-${d.code}-${dept}`;
        return {
          id,
          name: dept,
          directorName: null,
          directorUserId: null,
          placement: null,
          units: zones
            .map((z) => ({
              id: `unit-${z.code}-${d.code}-${dept}`,
              name: buildUnitName(z.code, d.code, dept),
              zoneId: z.id,
              zoneCode: z.code,
            }))
            .filter((u) => !skip.has(u.name)),
          categories: [],
          sections: [],
        };
      }),
    })),
  };
}
