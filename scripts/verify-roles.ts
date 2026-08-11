import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const editors = await p.$queryRaw`SELECT de."domainId", d.name AS domain, de."userId", u.username, de.role, de."grantedBy" FROM "DomainEditor" de LEFT JOIN "User" u ON u.id = de."userId" LEFT JOIN "Domain" d ON d.id = de."domainId" ORDER BY d.name`;
  console.log("DomainEditor после миграции:");
  (editors as Array<{ domain: string; username: string; role: string; grantedBy: string }>).forEach(e =>
    console.log(`  ${e.domain} → ${e.username}: role=${e.role} (выдал: ${e.grantedBy || "—"})`)
  );
  const byRole: Record<string, number> = {};
  (editors as Array<{ role: string }>).forEach(e => { byRole[e.role] = (byRole[e.role] || 0) + 1; });
  console.log("Итого по ролям:", JSON.stringify(byRole));
  await p.$disconnect();
})();
