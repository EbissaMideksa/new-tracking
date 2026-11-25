// Canonical query shape for the org tree.
// Corporate → divisions → departments → [sections / groups / categories / local units]
// (+ zone on local units, + groups under sections).
// Typed as `any` because @prisma/client does not expose the OrgNodeInclude
// namespace in this project; the shape is validated at runtime by Prisma.
export const orgTreeInclude: any = {
  children: {
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          children: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: {
              children: {
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              },
              zone: true,
            },
          },
        },
      },
    },
  },
};
