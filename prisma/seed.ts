import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding roles...");

  const adminPerms = JSON.stringify({
    canViewTasks: true, canEditTasks: true, canDeleteTasks: true,
    canViewBacklog: true, canEditBacklog: true, canDeleteBacklog: true,
    canViewQuestions: true, canEditQuestions: true, canDeleteQuestions: true,
    canViewPresentations: true, canCreatePresentations: true,
    canUseAI: true, visibleDomains: "all",
  });

  const editorPerms = JSON.stringify({
    canViewTasks: true, canEditTasks: true, canDeleteTasks: false,
    canViewBacklog: true, canEditBacklog: true, canDeleteBacklog: false,
    canViewQuestions: true, canEditQuestions: true, canDeleteQuestions: false,
    canViewPresentations: true, canCreatePresentations: true,
    canUseAI: true, visibleDomains: "all",
  });

  const viewerPerms = JSON.stringify({
    canViewTasks: true, canEditTasks: false, canDeleteTasks: false,
    canViewBacklog: true, canEditBacklog: false, canDeleteBacklog: false,
    canViewQuestions: true, canEditQuestions: false, canDeleteQuestions: false,
    canViewPresentations: true, canCreatePresentations: false,
    canUseAI: false, visibleDomains: "all",
  });

  await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { name: "admin", description: "Полный доступ", permissions: adminPerms, isSystem: true },
  });

  await prisma.role.upsert({
    where: { name: "editor" },
    update: {},
    create: { name: "editor", description: "Просмотр и редактирование", permissions: editorPerms, isSystem: true },
  });

  await prisma.role.upsert({
    where: { name: "viewer" },
    update: {},
    create: { name: "viewer", description: "Только просмотр", permissions: viewerPerms, isSystem: true },
  });

  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  const editorRole = await prisma.role.findUnique({ where: { name: "editor" } });
  const viewerRole = await prisma.role.findUnique({ where: { name: "viewer" } });

  if (adminRole && editorRole && viewerRole) {
    const usersWithoutRole = await prisma.user.findMany({ where: { roleId: { equals: "" } } });
    for (const user of usersWithoutRole) {
      if (user.username === "admin") {
        await prisma.user.update({ where: { id: user.id }, data: { roleId: adminRole.id } });
      } else {
        await prisma.user.update({ where: { id: user.id }, data: { roleId: editorRole.id } });
      }
    }
  }

  console.log("Seed completed!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());