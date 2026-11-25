AI Coder Spec: Organization Structure (Interactive Hierarchy)
Implementation brief for the Asset Tracking ERP (Ethio Telecom). Based on a 3-screen Figma prototype.
0. How to use this brief
You are modifying an existing production app, not building a new one. Work in this order:
1. Inspect the repo first. Find the current Organization page, the Prisma OrgUnit (or equivalent) model, the org type enum, the RBAC/permission helpers, lib/broadcast.ts, and existing dashboard layout/theme tokens. Summarize what exists in a short plan before writing code.
2. Reuse existing patterns: singleton Prisma/Redis clients, role-based access control, path-based org-unit scoping, SSE live updates via lib/broadcast.ts, and the declarative permission-matrix approach used for work orders.
3. Do not break existing org data. Prefer additive Prisma migrations. Anything in section 9 marked DECISION needs to be resolved against the real schema; state your choice in the plan.
4. Implement in the phases listed in section 12 and verify against the acceptance criteria in section 13.
Stack: Next.js (App Router), TypeScript, Prisma, PostgreSQL, Redis, Docker Compose. Deployed on a private LAN, so no external CDNs or remote fonts at runtime (bundle fonts and icons).
1. Product concept (read this first)
The organization has two relationships that must never be confused:
• Functional hierarchy (corporate): Corporate Office → 3 Divisions → 3 Departments each. Divisions are FN (Fixed Network), WN (Wireless Network), NI (Network Infrastructure). Each division has the same three departments: O&M, Planning, Engineering (9 functional departments total). Departments stay at Corporate Office.
• Local operational reporting (geography): Workers located in a geography (an Addis Ababa zone or a region) belong to a local workforce unit named like EAAZ FN O&M. That unit keeps its functional parent (the department) and additionally reports to one shared Operational Director per geography.
Key rules (enforce in UI and backend):
1. A local unit = one geography x one department. Name is auto-generated: {GEO_CODE} {DIVISION_CODE} {DEPARTMENT} (e.g. NAAZ WN Engineering). Not editable.
2. The Operational Director is per geography, never per department. Creating a unit never creates a director; it inherits the geography's existing one.
3. Corporate Office workers are not part of any local view and have no local director (functional reporting only).
4. The two relationships describe the same workers, not two teams.
5. Geography lists are extensible (admins can add zones/regions later); do not hardcode them in UI code. Seed with the values below.
Seed geographies
• Category Addis Ababa (zones): EAAZ, NAAZ, SAAZ, WAAZ
• Category Regions: CWR, WR, SWR, SER, WWR, SR
Seed divisions/departments: FN "Fixed Network", WN "Wireless Network", NI "Network Infrastructure"; each with O&M, Planning, Engineering.
2. Routes and navigation
Adapt names to the existing routing convention.
Screen
Suggested route
Breadcrumb
1. Organization overview (hierarchy + units directory)
/dashboard/organization
Organization > Overview
2. Geography local coordination
/dashboard/organization/geo/[code] (e.g. EAAZ)
Organization > Addis Ababa / EAAZ
3. Create unit
/dashboard/organization/manage/create-unit
Organization > Manage hierarchy / Create unit
Navigation flow: Overview -> click an Operational Director row (right panel) -> Geography page. Overview -> Create unit / Manage hierarchy -> Create unit page. Geography page Add local unit -> Create unit page with geography prefilled. Back to hierarchy and Back return to the previous page. Support deep links and browser back.
3. Visual design system (approximate; verify in Figma Dev Mode)
Values below are estimated from screenshots. Put them in CSS variables / Tailwind theme extension, not inline.
• Font: Inter (or the app's current font). Page title ~32px semibold; card titles 16-18px semibold; body 13-14px; captions 11-12px.
• Page background: very light teal-gray (~#F1F6F6). Cards: white, 1px border #E1E8EA, radius 12-16px, subtle shadow.
• Deep teal (Corporate Office banner, white text): ~#17404A.
• Primary teal (primary buttons, links, active tab text, dashed lines): ~#0F7F82; hover slightly darker.
• Mint (local units, Operational Director panel/cards, selected states): background ~#E4F3F0, border ~#B5DCD4, text teal.
• Neutral panel (division headers, info notes, read-only inputs): ~#EEF2F2.
• Text: heading #1F3A44, muted #6B7F86.
• Chips: small rounded rectangles; geography code chips (EAAZ, CWR...) are mint with bold teal text.
• Line styles: solid gray = functional reporting; dashed teal = local operational reporting. Always show a legend with both.
• Icons: Lucide (building, git-branch, map-pin, users, lock, shield-check, pencil, plus, sliders-horizontal, maximize, chevrons, more-horizontal).
• Responsive: desktop-first layout as shown; at narrower widths collapse the right-side panels under the main content and let the diagram scroll horizontally inside its card. Follow the app's existing five breakpoints.
4. Screen 1: Organization structure (overview)
Header
• Breadcrumb: Organization > Overview.
• Title: Organization structure. Subtitle: "One functional hierarchy. Shared local coordination across every zone and region."
• Right actions: Manage hierarchy (secondary, sliders icon) and Create unit (primary teal, plus icon). Both visible only to privileged users (see section 8); others see neither.
• Tabs below: Hierarchy (default) | Units directory. Right of tabs: legend (solid gray = Functional reporting, dashed teal = Local operational reporting).
Hierarchy tab: main card "Telecom organization" (badge: "Hierarchy view"; buttons Expand all and Fit view)
Left/main area (diagram) and right panel (Operational Directors) side by side.
Diagram
1. Corporate Office root banner (deep teal, building icon): title "Corporate Office", subtitle "Functional ownership · divisions and departments".
2. Elbow connectors (solid gray) from the root down to three division columns.
3. Each Division column is a card with header (git-branch icon, "FN Division", subtitle "Fixed Network · Corporate Office"; WN: "Wireless Network"; NI: "Network Infrastructure") containing three department cards: O&M, Planning, Engineering.
4. Department card: chevron (expand/collapse), name, "..." overflow menu, subtitle "Corporate Office department", and a link row with users icon "View workforce by location". When expanded, the card gets a teal border and shows a mint chip "Workforce expanded below" and the link row is replaced by it.
5. Division columns for departments that are not expanded show footer note (shield icon, neutral panel): "Departments stay at Corporate Office. Local units retain this functional parent." (The prototype shows it under WN and NI; the FN column shows the expanded panel instead.)
6. Expanded workforce panel appears below the division row, connected by a short solid connector to the expanded department. Title: "FN / O&M · Workforce by location" (collapse chevron), right-aligned caption "One department, grouped workforce". Three columns:
    ◦ Corporate Office (neutral card, building icon): "Corporate FN O&M workers", caption "Functional reporting only".
    ◦ Addis Ababa (mint card, map-pin icon): rows EAAZ FN O&M, NAAZ FN O&M, SAAZ FN O&M, WAAZ FN O&M, each with a users icon; caption "Also report to their geography's shared director".
    ◦ Regions (mint card): rows CWR, WR, SWR, SER, WWR, SR + " FN O&M"; same caption.
    ◦ Footer line with a dashed teal sample: "Each local unit also reports to the matching geography's shared Operational Director ->".
    ◦ Clicking a local unit row navigates to that geography page (Screen 2), optionally pre-filtered to that department.
7. Only one department's workforce panel is expanded at a time unless Expand all is used (then each expanded department gets its panel stacked in order, or the panel shows a combined list; pick the simplest clean behavior and document it).
Right panel: "Operational Directors" (mint card, map-pin icon)
• Intro: "One shared director per geography coordinates all local workers."
• Section Addis Ababa · Zones: rows for EAAZ, NAAZ, SAAZ, WAAZ.
• Section Regions: rows for CWR, WR, SWR, SER, WWR, SR.
• Row layout: mint code chip, title "{CODE} Operational Director", caption "All local departments & divisions", right chevron. Click -> Screen 2.
• Footnote: "Geography examples are extensible. Directors are never department-specific."
• Show the assigned person's name/avatar if one is assigned (design shows a role label only; if unassigned show "Unassigned" subtly).
Bottom info banner (shield icon, neutral): "One workforce, two relationships: local workers keep their functional department and also report to their zone or region's shared Operational Director. Corporate Office workers have no local director."
Interactions
• Expand all / Collapse all toggles every department. Fit view scales the diagram to fit its container (CSS transform scale, recomputed on resize); optionally support pan and zoom on the diagram surface.
• Keyboard: department cards focusable, Enter/Space toggles expand, Esc closes the overflow menu. Provide aria-expanded and descriptive labels.
• Overflow menu (...) on a department: View workforce by location, Open in units directory (add Edit only if privileged).
• Units directory tab: not designed in the prototype. Implement a standard data table (search, filters for geography and division/department, columns: Unit name, Geography, Functional parent, Operational Director, Workforce count, Status) reusing the app's existing table component and mobile table fixes. Keep it simple and mark it as a design assumption.
5. Screen 2: Geography local coordination (e.g. EAAZ)
Header
• Breadcrumb: Organization > Addis Ababa / EAAZ. Title: EAAZ · Local coordination. Subtitle: "One zone. One Operational Director. Functional reporting across all three divisions remains unchanged."
• Right actions (privileged only): Edit hierarchy (pencil, secondary) and Add local unit (plus, primary -> Screen 3 prefilled).
• Context row: pill "Addis Ababa" (map-pin; the category), a dropdown "EAAZ" (switch zone/region, updates route), mint badge "Dual reporting enabled". Right: Departments (filter button: toggle which departments/divisions are shown) and Fit view.
Main card: "EAAZ workforce & reporting" with the legend at top right.
• Root: Corporate Office banner with caption "FN, WN and NI functional divisions".
• Then for each division (FN, WN, NI) a stacked section:
    ◦ Division bar (neutral): git-branch icon, "FN Division", muted "Fixed Network", right-aligned "Corporate Office".
    ◦ Row of three department cards (O&M, Planning, Engineering) with a lock icon (read-only here) and caption "Functional parent · Corporate Office"; solid gray elbow connector from the division bar into the three cards.
    ◦ Directly beneath each department card, connected by a short solid line, a local unit card (mint): e.g. "EAAZ FN O&M" with users icon and "Local workforce". If a unit does not exist yet for that department, show a dashed empty placeholder "No local unit · Add" (privileged) instead.
    ◦ A dashed teal connector runs from the bottom of each local unit card, along a horizontal dashed line under the row, up/down a shared vertical dashed line on the right, ending at the Operational Director card.
• Operational Director card (right, mint, sticky while scrolling the diagram): map-pin icon, "EAAZ", caption "Addis Ababa · Zone", heading Operational Director, text "Shared local coordination across FN, WN and NI.", divider, teal caption "Inherited by all EAAZ units", button Edit assignment (pencil; privileged only; opens a user picker, see section 7).
• Side notes (neutral cards): "ONE DIRECTOR PER ZONE: All EAAZ workers across the nine functional departments report locally to one shared director." and "Functional reporting stays intact: These are the same workers, not a second team. Their original department remains the functional parent."
• Bottom banner: "Corporate Office workers are not included in this local view and do not report to the EAAZ Operational Director. Dashed teal lines show the additional local relationship only."
• Footer: breadcrumb text and a "<- Back" link.
Interactions: hover a local unit card to highlight its dashed path to the director; click a local unit to open a side drawer (details, workforce list, link to assets scoped to that unit); Departments filter hides/shows divisions; zone dropdown navigates between geographies; Fit view as in Screen 1.
6. Screen 3: Create organization unit
Header: breadcrumb Organization > Manage hierarchy / Create unit. Title Create organization unit. Subtitle "Add a geography workforce unit without changing the corporate division or department structure." Right: <- Back to hierarchy.
Access banner (mint, shield icon): "Hierarchy editing enabled · Privileged user" with right text "Other users have read-only access". Non-privileged users must not reach this page (redirect or 403 with a clear message).
Three-column layout
1. Placement in hierarchy (left card, tree icon): helper "Select the functional parent." A collapsible tree: Telecom > Corporate Office > FN Division / WN Division (expanded: O&M, Planning, Engineering) / NI Division. Selecting a department sets the functional parent (only departments are selectable; divisions and root are not). The selected department is highlighted mint, and a preview child row ("-> NAAZ WN Engineering") appears under it once geography is chosen. Neutral note at bottom: "Corporate structure stays intact. Divisions and departments remain at Corporate Office; this unit groups workers by geography."
2. Unit details (center card, badge "Draft"): subtitle "Define the scope and inherited reporting relationships."
    ◦ Unit type * select, default "Geography workforce unit" (helper: "A workforce unit within a zone or region, not a new department."). Only this type in scope; leave the select extensible.
    ◦ Unit name (label tag "AUTO-GENERATED"): read-only with lock, e.g. "NAAZ WN Engineering"; helper "Generated from geography, division and department."
    ◦ Section FUNCTIONAL PLACEMENT: Functional parent * select ("Corporate Office / WN Division / Engineering"), two-way synced with the tree; Functional department read-only with lock ("WN Division · Engineering"), helper "Inherited from the selected parent. Functional reporting is retained."
    ◦ Section WORKFORCE LOCATION: Category * select (Addis Ababa / Regions) and Zone * select (options depend on category; label may read Region for Regions).
    ◦ Local operational director mint card, tag "Inherited": "{GEO} Operational Director", text "Already shared by all {GEO} workers across divisions and departments. Creating this unit does not create another director." If the geography has no director yet, show a neutral variant: "No director assigned yet. Assign one from the geography page." (creation still allowed).
    ◦ Footer: "* Required fields", Cancel (secondary), + Create unit (primary; disabled until all required fields valid; shows a loading state; on success route to the geography page and toast).
3. Reporting preview (right card, branch icon): "One workforce group with two reporting relationships." Section FUNCTIONAL HIERARCHY: vertical stack of nodes Corporate Office ("Corporate structure") -> {Division} ("Wireless Network") -> {Department} ("Functional department"), then a row with the new unit node (mint, users icon, "One local workforce") joined by a dashed teal line to the "{GEO} Operational Director" node (mint, map-pin, "Shared across all {GEO} units"). Legend: solid = Functional department reporting, dashed = Additional local reporting. Note: "Director assignment is geography-wide. Changing the zone reuses its existing shared director; no department-specific director is created." Caption: "Corporate Office workers do not receive a zone or region director." The preview updates live as selections change.
Footer strip: breadcrumb "Organization / Manage hierarchy" and a note at right that begins "Changes apply only after ..." (text is cut off in the screenshot; implement as "Changes apply only after you create the unit." and confirm).
Validation
• Functional parent must be a department. Category and zone required.
• Unique constraint: only one unit per (geography, department). On duplicate show an inline error with a link to the existing unit.
• Server-side validation is authoritative; the client mirrors it.
7. Operational Director assignment (Edit assignment)
Modal with a searchable user picker. Users come from the external ERP via API, not from seeds (existing requirement); use the existing external-user lookup/service. Selecting a user sets the director for the geography and applies to all its units. Confirm dialog states the number of units affected. Audit-log the change.
8. Permissions and scoping
• Read (view overview, geography pages, units directory): all authenticated roles, but data is scoped by the existing path-based org-unit scoping (a user only sees units inside their subtree; Corporate-level roles see everything). DECISION: confirm how scoping applies to the geography pages.
• Write (Manage hierarchy, Create unit, Edit hierarchy, Add local unit, Edit assignment): privileged roles only, default SUPER_ADMIN and ADMIN. Implement as a named permission (e.g. org.hierarchy.manage) driven by the existing DB permission matrix, so it can be granted without code changes, following the canWoWithMatrix() / declarative-config pattern. Hide actions for unauthorized users and enforce on every API route.
• Existing role hierarchy: SUPER_ADMIN, ADMIN, CHIEF, DIRECTOR, MANAGER, SUPERVISOR, USER.
• Every write must create an audit-log entry (actor, action, before/after).
9. Data model (additive; adapt to the real schema)
The current org type hierarchy is COUNTRY -> DIVISION -> DEPARTMENT -> ZONE/REGION -> SECTION -> AREA -> SITE. The design models the same world differently: Corporate Office with divisions/departments, plus geography-based local units. Do not rewrite the existing tree. Map as follows and record your choice:
• Keep the existing functional tree as the source of truth for Corporate Office -> Division -> Department. Treat the existing COUNTRY node as "Telecom"/Corporate Office root, or add a CORPORATE_OFFICE marker. DECISION.
• Add a Geography model: id, code (unique, e.g. EAAZ), name, category enum (ADDIS_ABABA | REGION), kind enum (ZONE | REGION), sortOrder, isActive. Link it to the existing ZONE/REGION org units if those already exist (reuse them rather than duplicating). DECISION.
• Add OperationalDirectorAssignment: geographyId (unique, one per geography), externalUserId, displayName snapshot, assignedAt, assignedBy. Never keyed by department.
• Add LocalWorkforceUnit (or an OrgUnit subtype): id, name (generated, unique), geographyId, functionalParentId (the department OrgUnit), type (GEOGRAPHY_WORKFORCE), status, timestamps, createdBy. Unique (geographyId, functionalParentId). Name derived server-side from geography code + division code + department name.
• Workers/users/assets attach to a unit through the existing org-unit relationship; the director link is derived via geographyId, never stored per worker.
• Required indexes on geographyId and functionalParentId; keep path-based scoping fields consistent for new units.
10. API (Next.js route handlers; adapt to conventions)
• GET /api/org/overview: divisions, departments, per-department local-unit counts, geographies with director summary.
• GET /api/org/departments/[id]/workforce: local units grouped by Corporate Office / Addis Ababa / Regions.
• GET /api/org/geographies and GET /api/org/geographies/[code]: geography detail, all its local units by division/department, director.
• PUT /api/org/geographies/[code]/director: assign director (privileged).
• POST /api/org/units: create local unit (privileged); validates and returns the unit; GET /api/org/units/preview?... optional for name/preview generation.
• GET /api/org/units for the Units directory (pagination, filters).
• All routes: auth check, permission check, scope filtering, Zod (or existing) validation, singleton Prisma client, audit log.
• Real-time: after any mutation publish through lib/broadcast.ts (e.g. event org:updated with geography/unit ids) so open Overview and Geography pages refresh via SSE. Subscribe through the existing SSE route (do not create a second event bus; a previous bug came from publishers and subscribers using different modules).
11. Frontend architecture
• Server components fetch initial data; client components handle interaction. Use a small client store (React context or the existing pattern) for expand/collapse state and selection.
• Suggested components under app/(dashboard)/organization/_components/: OrgHeader, LegendKey, HierarchyDiagram, CorporateOfficeBanner, DivisionColumn, DepartmentCard, WorkforceByLocationPanel, OperationalDirectorsPanel, GeographyDiagram, LocalUnitCard, DirectorCard, CreateUnitForm, PlacementTree, ReportingPreview, DirectorAssignmentDialog. Put shared TypeScript types in one types.ts (single source of truth; avoid duplicated type definitions).
• Connector lines: render nodes as normal DOM (CSS grid/flex), and draw connectors in an absolutely positioned SVG overlay computed from element bounding boxes (refs + ResizeObserver), using orthogonal paths. Solid gray for functional, dashed teal (stroke-dasharray) for local. Recompute on expand/collapse, resize, and font load. No heavy graph library is required; if one is introduced it must work offline and be justified.
• Fit view: compute scale = min(1, containerWidth / diagramWidth) and apply with transform: scale(); optional wheel-zoom and drag-pan on the diagram.
• Loading skeletons, empty states (no geographies, no units), and error states with retry. Respect prefers-reduced-motion for expand animations.
• Accessibility: semantic landmarks, focus rings, aria-expanded, color is never the only differentiator (line style also differs), contrast AA.
• Strings: keep all labels exactly as written here; put them in one constants/i18n file to allow later Amharic localization.
12. Implementation phases
1. Repo inspection + short plan, schema decisions, migration + seed (divisions, departments, geographies).
2. API routes, permissions, audit logging, SSE events.
3. Screen 1 (Hierarchy tab) with expand/collapse, workforce panel, directors panel, Fit view, connector overlay.
4. Screen 2 (geography page) incl. director card, filters, drawer.
5. Screen 3 (Create unit) with live preview and validation; director assignment dialog.
6. Units directory tab, responsive pass, accessibility pass, tests.
13. Acceptance criteria
• Overview renders Corporate Office -> FN/WN/NI -> O&M/Planning/Engineering with correct labels and connectors; expanding FN / O&M shows the three-column workforce panel (Corporate Office, Addis Ababa zones, Regions).
• Operational Directors panel lists all seeded geographies; each row opens that geography page.
• Geography page shows nine local unit slots (3 divisions x 3 departments), solid gray functional lines, dashed teal local lines to a single director card; zone dropdown switches geography.
• Create unit auto-generates the name, locks derived fields, shows the inherited director, previews the dual relationship live, rejects duplicates, and never creates a director.
• Non-privileged users cannot see or call any write action (verified at API level).
• New geographies added in the DB appear in the UI without code changes.
• Mutations propagate to other open sessions through SSE; every write is audit-logged.
• No regressions in existing org data, RBAC, or scoping; tsc and lint pass; unit tests for name generation, uniqueness, and permission checks; Docker build still succeeds.
14. Open items to confirm
• Exact hex/spacing tokens (read from Figma Dev Mode).
• Mapping of existing COUNTRY/DIVISION/DEPARTMENT/ZONE/REGION org types to Corporate Office / geographies (section 9).
• Exact text of the truncated footer note on Screen 3.
• Whether the nine functional departments are fixed or admin-managed.
• Units directory columns and whether Edit hierarchy / Manage hierarchy open a full hierarchy editor (not designed in the prototype).
• Who may be assigned as Operational Director and how names are synced from the external ERP.