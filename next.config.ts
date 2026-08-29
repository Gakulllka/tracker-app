import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma нельзя бандлить: Turbopack вырезает нативный движок запросов
  // и обращения к моделям падают с "Cannot read properties of undefined".
  serverExternalPackages: ["@prisma/client", ".prisma/client"],

  reactStrictMode: false,

  // Данные приложения приходят через /api и кешироваться не должны.
  // Статика (_next) кешируется браузером как обычно.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
