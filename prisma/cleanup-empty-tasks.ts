/**
 * Удаляет все пустые задачи из таблицы Task.
 * Пустые = name пустой ИЛИ name = "EMPTY" ИЛИ num = "EMPTY"
 *
 * Запуск: npx tsx prisma/cleanup-empty-tasks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Очистка пустых задач из Task таблицы...\n");

  // Удаляем задачи где name пустой ИЛИ name = "EMPTY" ИЛИ num = "EMPTY"
  const result = await prisma.task.deleteMany({
    where: {
      OR: [
        { name: "" },
        { name: "EMPTY" },
        { num: "EMPTY" },
        { num: "" },
      ],
    },
  });

  console.log(`✅ Удалено ${result.count} пустых задач\n`);

  // Показываем оставшиеся задачи
  const remaining = await prisma.task.count({ where: { deleted: false } });
  console.log(`📊 Осталось задач: ${remaining}`);
}

main()
  .catch((e) => {
    console.error("❌ Ошибка:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
