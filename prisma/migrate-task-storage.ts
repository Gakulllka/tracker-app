/**
 * Скрипт миграции: извлекает задачи из Workspace.allData (JSON) в таблицу Task.
 *
 * Запуск: npx tsx prisma/migrate-task-storage.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface LegacyTask {
  id: string;
  num?: string;
  name?: string;
  planH?: string;
  factH?: string;
  priority?: string;
  status?: string;
  comment?: string;
  commentLog?: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string }>;
  visibleTo?: string[];
  _ts?: number;
  _deleted?: boolean;
  [key: string]: unknown;
}

interface DomainData {
  allData: Record<string, LegacyTask[]>;
  backlog: LegacyTask[];
}

function isDomainDataFormat(data: unknown): data is Record<string, DomainData> {
  if (!data || typeof data !== "object") return false;
  for (const val of Object.values(data as object)) {
    if (val && typeof val === "object" && !Array.isArray(val) && "allData" in (val as object))
      return true;
  }
  return false;
}

async function main() {
  console.log("🔄 Миграция данных: allData JSON → Task table\n");

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, allData: true, backlog: true },
  });

  console.log(`Найдено ${workspaces.length} workspace(s)\n`);

  let totalTasks = 0;
  let totalBacklog = 0;
  let skipped = 0;

  for (const ws of workspaces) {
    const tasksToCreate: Array<{
      workspaceId: string;
      domainId: string;
      monthKey: string;
      num: string;
      name: string;
      planH: string;
      factH: string;
      priority: string;
      status: string;
      comment: string;
      commentLog: string;
      visibleTo: string;
      ts: Date;
      deleted: boolean;
    }> = [];

    // Parse allData
    try {
      const parsed = JSON.parse(ws.allData);
      let domains: Record<string, DomainData>;

      if (isDomainDataFormat(parsed)) {
        domains = parsed;
      } else {
        // Legacy flat format: { "0": [...], "1": [...] } → wrap as default domain
        domains = {
          default: {
            allData: parsed as Record<string, LegacyTask[]>,
            backlog: JSON.parse(ws.backlog || "[]"),
          },
        };
      }

      for (const [domainId, domainData] of Object.entries(domains)) {
        // Monthly tasks
        for (const [monthKey, monthTasks] of Object.entries(domainData.allData)) {
          for (const task of monthTasks) {
            if (!task.id) continue;
            if (task._deleted) {
              skipped++;
              continue;
            }

            tasksToCreate.push({
              workspaceId: ws.id,
              domainId,
              monthKey,
              num: task.num || "",
              name: task.name || "",
              planH: task.planH || "0",
              factH: task.factH || "0",
              priority: task.priority || "QUEUE",
              status: task.status || "IDEA",
              comment: task.comment || "",
              commentLog: JSON.stringify(task.commentLog || []),
              visibleTo: JSON.stringify(task.visibleTo || []),
              ts: task._ts ? new Date(task._ts) : new Date(),
              deleted: false,
            });
          }
        }

        // Backlog tasks
        if (domainData.backlog) {
          for (const task of domainData.backlog) {
            if (!task.id) continue;
            if (task._deleted) {
              skipped++;
              continue;
            }

            tasksToCreate.push({
              workspaceId: ws.id,
              domainId,
              monthKey: "backlog",
              num: task.num || "",
              name: task.name || "",
              planH: task.planH || "0",
              factH: task.factH || "0",
              priority: task.priority || "QUEUE",
              status: task.status || "IDEA",
              comment: task.comment || "",
              commentLog: JSON.stringify(task.commentLog || []),
              visibleTo: JSON.stringify(task.visibleTo || []),
              ts: task._ts ? new Date(task._ts) : new Date(),
              deleted: false,
            });
            totalBacklog++;
          }
        }
      }
    } catch (e) {
      console.log(`  ⚠️  Ошибка парсинга workspace ${ws.id}: ${e}`);
      continue;
    }

    if (tasksToCreate.length === 0) {
      console.log(`  📁 ${ws.name}: нет задач для миграции`);
      continue;
    }

    // Batch insert
    const batchSize = 500;
    for (let i = 0; i < tasksToCreate.length; i += batchSize) {
      const batch = tasksToCreate.slice(i, i + batchSize);
      await prisma.task.createMany({ data: batch, skipDuplicates: true });
    }

    totalTasks += tasksToCreate.length;
    console.log(`  ✅ ${ws.name}: мигрировано ${tasksToCreate.length} задач`);
  }

  console.log(`\n📊 Итого:`);
  console.log(`   Задач: ${totalTasks}`);
  console.log(`   Из беклога: ${totalBacklog}`);
  console.log(`   Пропущено (deleted): ${skipped}`);
  console.log(`\n✅ Миграция завершена!`);
}

main()
  .catch((e) => {
    console.error("❌ Ошибка миграции:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
