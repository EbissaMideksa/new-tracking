//app/dashboard/organization/page.tsx
import { OrgOverviewScreen } from "@/components/org-structure/OrgOverviewScreen";
import { canEditHierarchy } from "@/lib/org/permissions";
import { getOrgOverview } from "@/lib/org/orgService";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const [overview, canEdit] = await Promise.all([getOrgOverview(), canEditHierarchy()]);
  return <OrgOverviewScreen overview={overview} canEdit={canEdit} />;
}
