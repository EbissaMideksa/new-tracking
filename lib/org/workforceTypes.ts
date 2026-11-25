// Shared by the API route (server) and the drawer (client). No prisma imports here.

export type WorkforceUser = {
  id: string
  name: string
  email: string
  role: string
  status: string | null
  jobTitle: string | null
  /** Functional parent, e.g. "Fixed Network · O&M" */
  department: string | null
}

export type WorkforceNode = {
  id: string
  name: string
  type: string
  users: WorkforceUser[]
  children: WorkforceNode[]
  total: number
}

export type ZoneWorkforce = {
  zone: { id: string; code: string; name: string }
  /** null = whole zone (Operational Director view) */
  department: { id: string; name: string } | null
  scope: "department" | "zone"
  /** Zone-wide Operational Director (every worker here reports to this person) */
  operationalDirector: string | null
  /** Functional director of the department (department scope only) */
  functionalDirector: string | null
  /** Department labels present, for the filter chips */
  departments: string[]
  directUsers: WorkforceUser[]
  tree: WorkforceNode[]
  total: number
  roleCounts: Record<string, number>
}
