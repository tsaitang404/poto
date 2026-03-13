import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export async function loadWorker() {
  const projectRoot = process.cwd();
  const tempRoot = mkdtempSync(join(tmpdir(), "poto-worker-"));
  const srcDir = resolve(projectRoot, "src");
  const outDir = join(tempRoot, "src");

  cpSync(srcDir, outDir, { recursive: true });
  transpileDirectory(outDir);

  const mod = await import(pathToFileURL(join(outDir, "index.js")).href + `?t=${Date.now()}`);
  rmSync(tempRoot, { recursive: true, force: true });
  return mod.default;
}

function transpileDirectory(rootDir) {
  const entries = ts.sys.readDirectory(rootDir, [".ts"], undefined, ["**/*.ts"])
    .filter((filePath) => !filePath.endsWith(".d.ts"));
  for (const filePath of entries) {
    const source = readFileSync(filePath, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
      fileName: filePath,
    }).outputText;
    const normalizedOutput = output.replace(
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_, prefix, specifier, suffix) => {
        if (specifier.endsWith(".js") || specifier.endsWith(".json")) {
          return `${prefix}${specifier}${suffix}`;
        }
        return `${prefix}${specifier}.js${suffix}`;
      }
    );
    writeFileSync(filePath.replace(/\.ts$/, ".js"), normalizedOutput);
  }
}
