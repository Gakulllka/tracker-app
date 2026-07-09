import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();

  // Обновляем domainId с "default" на "Финансы"
  const result = await p.task.updateMany({
    where: { domainId: "default" },
    data: { domainId: "Финансы" },
  });
  console.log("Updated domainId:", result.count, "tasks");

  // Показываем результат
  const byDomain = await p.task.groupBy({ by: ["domainId"], where: { deleted: false }, _count: true });
  for (const d of byDomain) console.log("  " + d.domainId + ": " + d._count + " tasks");

  await p.$disconnect();
}
main();
