/**
 * Восстанавливает задачи из Workspace.allData в таблицу Task.
 * Запуск: npx tsx prisma/recover-tasks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Восстановление задач из allData...\n");

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, allData: true },
  });

  let recovered = 0;

  for (const ws of workspaces) {
    let domainData: Record<string, { allData: Record<string, unknown[]>; backlog: unknown[] }>;
    try {
      domainData = JSON.parse(ws.allData);
    } catch {
      console.log(`  ⚠️  ${ws.name}: не удалось распарсить allData`);
      continue;
    }

    // Проверяем что это domainData формат
    const hasDomains = Object.values(domainData).some(
      (v) => v && typeof v === "object" && "allData" in (v as object)
    );
    if (!hasDomains) continue;

    for (const [domainId, domain] of Object.entries(domainData)) {
      if (!domain.allData) continue;

      // Месячные задачи
      for (const [monthKey, tasks] of Object.entries(domain.allData)) {
        if (!Array.isArray(tasks)) continue;
        for (const t of tasks) {
          const task = t as Record<string, unknown>;
          if (!task.id) continue;
          if ((!task.name || task.name === "EMPTY") && (!task.num || task.num === "EMPTY")) continue;

          try {
            await prisma.task.upsert({
              where: { id: task.id as string },
              create: {
                id: task.id as string,
                workspaceId: ws.id,
                domainId,
                monthKey,
                num: String(task.num || ""),
                name: String(task.name || ""),
                planH: String(task.planH || "0"),
                factH: String(task.factH || "0"),
                priority: String(task.priority || "Средний"),
                status: String(task.status || "Идея"),
                comment: String(task.comment || ""),
                commentLog: JSON.stringify(task.commentLog || []),
                ts: task._ts ? new Date(task._ts as number) : new Date(),
                deleted: Boolean(task._deleted),
              },
              update: {},
            });
            recovered++;
          } catch (e) {
            // ignore
          }
        }
      }

      // Беклог
      if (Array.isArray(domain.backlog)) {
        for (const t of domain.backlog) {
          const task = t as Record<string, unknown>;
          if (!task.id) continue;
          if ((!task.name || task.name === "EMPTY") && (!task.num || task.num === "EMPTY")) continue;

          try {
            await prisma.task.upsert({
              where: { id: task.id as string },
              create: {
                id: task.id as string,
                workspaceId: ws.id,
                domainId,
                monthKey: "backlog",
                num: String(task.num || ""),
                name: String(task.name || ""),
                planH: String(task.planH || "0"),
                factH: String(task.factH || "0"),
                priority: String(task.priority || "Средний"),
                status: String(task.status || "Идея"),
                comment: String(task.comment || ""),
                commentLog: JSON.stringify(task.commentLog || []),
                ts: task._ts ? new Date(task._ts as number) : new Date(),
                deleted: Boolean(task._deleted),
              },
              update: {},
            });
            recovered++;
          } catch (e) {
            // ignore
          }
        }
      }
    }
    console.log(`  ✅ ${ws.name}: обработано`);
  }

  console.log(`\n📊 Восстановлено задач: ${recovered}`);
}

main()
  .catch((e) => {
    console.error("❌ Ошибка:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
