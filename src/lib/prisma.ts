import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Защита от вызова во время next build (статическая генерация).
// DATABASE_URL недоступен на этапе сборки → не инициализируем клиент.
function makePrisma() {
  if (!process.env.DATABASE_URL) {
    // Возвращаем заглушку — упадёт только если реально позвонить в БД при билде.
    return undefined as unknown as PrismaClient;
  }
  return new PrismaClient({
    log: process.env.NODE_ENV !== "production" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
