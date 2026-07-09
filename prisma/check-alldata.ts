import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const ws = await p.workspace.findFirst({ select: { allData: true, name: true } });
  if (!ws) { console.log("No workspace"); await p.$disconnect(); return; }
  console.log("Workspace:", ws.name);
  console.log("allData length:", ws.allData.length);
  console.log("allData preview:", ws.allData.substring(0, 500));
  await p.$disconnect();
}
main();
