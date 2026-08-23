import * as fs from "node:fs";
import * as path from "node:path";
import { readdir } from "node:fs/promises";
import { parseFrontmatter } from "../utils/index.ts";
import type { Diagnostic, ModuleContract, ModuleFrontmatter, ModuleIndex } from "../types.ts";
import type { ModuleGateConfig } from "../config.ts";
import type { Dirent } from "node:fs";

export type ModuleIndexBuildResult = {
  index: ModuleIndex;
  diagnostics: Diagnostic[];
};

export async function buildModuleIndex(
  cwd: string,
  config: ModuleGateConfig,
): Promise<ModuleIndexBuildResult> {
  const scanRoot = path.resolve(cwd);

  const moduleFiles = await findModuleFiles(scanRoot, config.moduleDescriptorFileName);
  const { contracts, diagnostics } = buildContracts(moduleFiles);
  const dirToModule = await buildDirToModuleMap(contracts);

  return { index: { contracts, dirToModule }, diagnostics };
}

function buildContracts(
  moduleFiles: string[],
): { contracts: ModuleContract[]; diagnostics: Diagnostic[] } {
  const contracts: ModuleContract[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const absModuleFile of moduleFiles) {
    const modulePath = path.dirname(absModuleFile);
    const content = fs.readFileSync(absModuleFile, "utf-8");

    let frontmatter: ModuleFrontmatter;
    let body: string;
    try {
      const parsed = parseFrontmatter<ModuleFrontmatter>(content);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch {
      diagnostics.push({
        level: "info",
        message: `Failed to parse ${absModuleFile} — module will be unguarded`,
      });
      continue;
    }

    contracts.push({
      modulePath,
      descriptorFileName: path.basename(absModuleFile),
      readonly: frontmatter.readonly ?? [],
      noNewExports: frontmatter["no-new-exports"] ?? [],
      prose: body.trim(),
    });
  }

  contracts.sort((a, b) => a.modulePath.length - b.modulePath.length);
  return { contracts, diagnostics };
}

async function buildDirToModuleMap(
  contracts: ModuleContract[],
): Promise<Map<string, string>> {
  const dirToModule = new Map<string, string>();
  const sortedByDepth = [...contracts].sort(
    (a, b) => a.modulePath.length - b.modulePath.length,
  );

  for (const contract of sortedByDepth) {
    const dirs = await walkDirs(contract.modulePath);
    for (const dir of dirs) {
      dirToModule.set(dir, contract.modulePath);
    }
  }

  return dirToModule;
}

async function findModuleFiles(dir: string, descriptorFileName: string): Promise<string[]> {
  const results: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.toLowerCase() === descriptorFileName.toLowerCase()) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

async function walkDirs(root: string): Promise<string[]> {
  const results: string[] = [root];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        const fullPath = path.join(current, entry.name);
        results.push(fullPath);
        stack.push(fullPath);
      }
    }
  }

  return results;
}


