// Plain serialisable shapes passed from server pages to client components.

export type GeoCategory = 'ADDIS_ABABA' | 'REGION';

export const CATEGORY_LABEL: Record<GeoCategory, string> = {
  ADDIS_ABABA: 'Addis Ababa',
  REGION: 'Regions',
};

export interface OrgZone {
  id: string;
  code: string; // EAAZ
  name: string;
  category: GeoCategory;
  directorName: string | null;
  /** The User account of the shared Operational Director (null = unassigned). */
  directorUserId: string | null;
  /** How many local units currently exist in this geography. */
  unitCount: number;
}

export interface OrgLocalUnit {
  id: string;
  name: string; // "EAAZ FN O&M"
  zoneId: string;
  zoneCode: string;
}

export interface OrgDepartment {
  id: string;
  /** The matching OrgNode (org-structure-v2) department id, when one exists.
   *  Used for the functional-director and add-unit flows, which are still
   *  OrgNode-backed. Null when the department has no OrgNode counterpart. */
  nodeId?: string | null;
  name: string;
  /** Functional director of the department — one per department (design §1). */
  directorName: string | null;
  directorUserId: string | null;
  /** Placement rule: "CORPORATE_ONLY" (head office only) or "SPREADABLE"
   *  (may branch into Zones/Regions field arm). NULL defaults to SPREADABLE. */
  placement: string | null;
  /** Geography workforce units on this department (LOCAL_UNIT nodes with zoneId). */
  units: OrgLocalUnit[];
  /** Field-arm grouping folders under this department — only present for
   *  SPREADABLE departments; corporate-only departments have none. */
  categories: OrgCategory[];
  /** Corporate-arm sections under this department — every department gets at
   *  least one section with group(s), where corporate workers sit. */
  sections: OrgSection[];
}

/** A field-arm grouping folder under a department: "Zones" or "Regions". */
export interface OrgCategory {
  id: string;
  name: string; // "Zones" | "Regions"
  kind: "CATEGORY";
}

/** A corporate-arm section under a department, with its groups. */
export interface OrgSection {
  id: string;
  name: string;
  groups: OrgGroup[];
  /** Users (manager, supervisor, user) sitting on this section or its groups. */
  users: OrgUser[];
}

/** A team under a section. */
export interface OrgGroup {
  id: string;
  name: string;
  /** Users sitting directly on this group. */
  users: OrgUser[];
}

/** A user (manager, supervisor, user) for display under org structure nodes. */
export interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  orgUnitName: string | null;
  orgUnitType: string | null;
}

export interface OrgDivision {
  id: string;
  code: string; // FN
  name: string; // "FN Division"
  subtitle: string; // "Fixed Network"
  departments: OrgDepartment[];
}

export interface OrgOverview {
  name: string; // "Telecom"
  corporate: { id: string; name: string; subtitle: string };
  divisions: OrgDivision[];
  zones: OrgZone[];
}

/** "<Zone> <Division code> <Department>" — e.g. "NAAZ WN Engineering". */
export const buildUnitName = (zoneCode: string, divisionCode: string, departmentName: string) =>
  `${zoneCode} ${divisionCode} ${departmentName}`;
