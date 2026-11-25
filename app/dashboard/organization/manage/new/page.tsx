import { CreateUnitForm } from "@/components/org-structure/CreateUnitForm";
import { canEditHierarchy } from "@/lib/org/permissions";
import { getOrgOverview } from "@/lib/org/orgService";

export const dynamic = "force-dynamic";

type SP = { department?: string; zone?: string };

export default async function CreateUnitPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [overview, canEdit] = await Promise.all([getOrgOverview(), canEditHierarchy()]);
  return (
    <CreateUnitForm
      overview={overview}
      canEdit={canEdit}
      initialDepartmentId={sp.department}
      initialZoneId={sp.zone}
    />
  );
}
