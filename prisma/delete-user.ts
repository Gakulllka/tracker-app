import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const username = "f.trofimovich";

  const user = await p.user.findUnique({ where: { username } });
  if (!user) { console.log("User not found:", username); await p.$disconnect(); return; }

  // Delete related data
  await p.session.deleteMany({ where: { userId: user.id } });
  await p.userPermission.deleteMany({ where: { userId: user.id } });
  await p.aiInsight.deleteMany({ where: { userId: user.id } });
  await p.workspaceShare.deleteMany({ where: { userId: user.id } });
  await p.workspaceAccessRequest.deleteMany({ where: { userId: user.id } });

  // Delete workspace and its tasks
  const workspaces = await p.workspace.findMany({ where: { userId: user.id } });
  for (const ws of workspaces) {
    await p.task.deleteMany({ where: { workspaceId: ws.id } });
    await p.question.deleteMany({ where: { workspaceId: ws.id } });
    await p.workspaceAccessRequest.deleteMany({ where: { workspaceId: ws.id } });
  }
  await p.workspace.deleteMany({ where: { userId: user.id } });

  // Delete user
  await p.user.delete({ where: { id: user.id } });

  console.log("Deleted user:", username, "id:", user.id);
  await p.$disconnect();
}
main();
