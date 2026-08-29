/**
 * Резолвер алиаса `@/` для юнит-тестов.
 *
 * В коде проекта импорты записаны как `@/lib/metrics` — это алиас из
 * tsconfig.json, который понимают Next.js и TypeScript, но не понимает Node.
 * Хук ниже переписывает такие пути в реальные, чтобы тесты запускались
 * встроенным движком Node без сборки и без дополнительных зависимостей.
 *
 * Подключается флагом --import, см. package.json → scripts.test:unit
 */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import { register } from "node:module";

const SRC = pathToFileURL(resolvePath(process.cwd(), "src") + "/").href;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const SRC = ${JSON.stringify(SRC)};
      import { existsSync } from "node:fs";
      import { fileURLToPath } from "node:url";

      /** Дописывает расширение: в коде импорты без него, Node требует точный путь. */
      function withExtension(url) {
        if (existsSync(fileURLToPath(url))) return url;
        for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          if (existsSync(fileURLToPath(url + ext))) return url + ext;
        }
        return url;
      }

      export async function resolve(specifier, context, next) {
        // Алиас проекта: @/lib/metrics → src/lib/metrics
        if (specifier.startsWith("@/")) {
          return next(withExtension(SRC + specifier.slice(2)), context);
        }
        // Относительные импорты внутри src тоже идут без расширения ("./types")
        if (specifier.startsWith(".") && context.parentURL?.startsWith(SRC)) {
          const url = new URL(specifier, context.parentURL).href;
          return next(withExtension(url), context);
        }
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
