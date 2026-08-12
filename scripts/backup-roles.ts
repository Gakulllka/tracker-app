/**
 * Backup критичных таблиц перед миграцией ролевой модели.
 * Использует сырые SQL ($queryRaw), т.к. Prisma-клиент уже обновлён
 * под новую колонку role, которой ещё нет в БД.
 * Запуск: npx tsx scripts/backup-roles.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  const prisma = new PrismaClient();
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = join(process.cwd(), "backup");
    try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ }

    // Сырые запросы — не зависят от актуальности Prisma-клиента.
    const users = await prisma.$queryRaw`SELECT id, username, "displayName", role, status, "createdAt" FROM "User" ORDER BY "createdAt"`;
    const domains = await prisma.$queryRaw`SELECT id, name, archived, "createdById", "createdAt" FROM "Domain" ORDER BY name`;
    const editors = await prisma.$queryRaw`SELECT de.id, de."domainId", de."userId", de."grantedBy", de."createdAt", u.username, d.name AS "domainName" FROM "DomainEditor" de LEFT JOIN "User" u ON u.id = de."userId" LEFT JOIN "Domain" d ON d.id = de."domainId" ORDER BY de."createdAt"`;
    const requests = await prisma.$queryRaw`SELECT id, "domainId", "userId", status, "createdAt", "resolvedAt", "resolvedById" FROM "EditRequest" ORDER BY "createdAt"`;

    const dump = {
      timestamp: ts,
      tables: { user: users, domain: domains, domainEditor: editors, editRequest: requests },
      counts: { user: (users as unknown[]).length, domain: (domains as unknown[]).length, domainEditor: (editors as unknown[]).length, editRequest: (requests as unknown[]).length },
    };

    const path = join(dir, `roles-backup-${ts}.json`);
    writeFileSync(path, JSON.stringify(dump, null, 2), "utf8");
    console.log(`✓ Backup сохранён: ${path}`);
    console.log(`  Пользователей: ${dump.counts.user}, Доменов: ${dump.counts.domain}, Прав: ${dump.counts.domainEditor}, Запросов: ${dump.counts.editRequest}`);

    // Сводка создателей (для проверки миграции).
    const dArr = domains as Array<{ id: string; name: string; createdById: string }>;
    const eArr = editors as Array<{ domainId: string; userId: string }>;
    console.log("\nСводка создателей (до миграции):");
    dArr.forEach(d => {
      const editorExists = eArr.some(e => e.domainId === d.id && e.userId === d.createdById);
      console.log(`  ${d.name}: createdById=${d.createdById || "(пусто)"} editorExists=${editorExists}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error("Backup error:", e); process.exit(1); });
