import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const c = await p.task.count({ where: { deleted: false } });
  console.log("Tasks in DB:", c);
  const byMonth = await p.task.groupBy({ by: ["monthKey"], where: { deleted: false }, _count: true });
  for (const m of byMonth) console.log("  " + m.monthKey + ": " + m._count);
  await p.$disconnect();
}
main();
