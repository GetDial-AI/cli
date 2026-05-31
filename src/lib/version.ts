import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolves the published package.json regardless of where the compiled
// module lands (dist/lib/version.js → ../../package.json at the package root).
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

export const VERSION: string = pkg.version;
