import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export class DatabaseConfigurationError extends Error {
  constructor() {
    super(
      "База данных не подключена. На сервере не задана переменная DATABASE_URL."
    );
    this.name = "DatabaseConfigurationError";
  }
}

function makeUnavailableClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get() {
      throw new DatabaseConfigurationError();
    },
  });
}

function makePrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    // Не возвращаем undefined: иначе любой API-маршрут падает с
    // "Cannot read properties of undefined", скрывая настоящую причину.
    return makeUnavailableClient();
  }

  return new PrismaClient({
    log: process.env.NODE_ENV !== "production" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
