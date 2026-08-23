import * as path from "node:path";
import { parseFrontmatter } from "../utils/index.ts";
import type { ModuleIndex } from "../types.ts";
import type { ModuleGateConfig } from "../config.ts";
import { readFileSafe, applyEdits, isWithinSourceRoot, findOwningModule } from "../utils.ts";
import { checkReadonly } from "./readonly-gate.ts";
import { checkNoNewExports } from "./no-new-exports-gate.ts";
import { checkModuleInterfaceImports } from "./module-interface-import-gate.ts";
import "./checkers/index.ts";

export type GateEdit = { oldText: string; newText: string };

export type GateDenial = { block: true; reason: string };

export function runGates(
  filePath: string,
  edits: GateEdit[],
  cwd: string,
  index: ModuleIndex,
  config: ModuleGateConfig,
  beforeOverride?: string,
): GateDenial | undefined {
  const absPath = path.resolve(cwd, filePath);

  const before = beforeOverride ?? readFileSafe(absPath);
  const after = applyEdits(before, edits);
  const srcRoots = config.sourceRoots.map((r) => path.resolve(cwd, r));

  if (!isWithinSourceRoot(absPath, srcRoots)) return undefined;

  const descriptorResult = checkDescriptorFileReadonly(absPath, before, after, config);
  if (descriptorResult) return descriptorResult;

  const readonlyResult = checkReadonly(filePath, index, cwd);
  if (readonlyResult.blocked) {
    return { block: true, reason: formatDenial(filePath, readonlyResult.reason, absPath, index, cwd, config.outputModuleProseOnBlock) };
  }

  const noNewExportsResult = checkNoNewExports(filePath, before, after, index, cwd);
  if (noNewExportsResult.blocked) {
    return { block: true, reason: formatDenial(filePath, noNewExportsResult.reason, absPath, index, cwd, config.outputModuleProseOnBlock) };
  }

  const importResult = checkModuleInterfaceImports(filePath, after, index, cwd, config.disableModuleInterfaceImportGate, config.sourceRoots);
  if (importResult.blocked) {
    return { block: true, reason: formatDenial(filePath, importResult.reason, absPath, index, cwd, config.outputModuleProseOnBlock) };
  }

  return undefined;
}

function checkDescriptorFileReadonly(
  absPath: string,
  before: string,
  after: string,
  config: ModuleGateConfig,
): GateDenial | undefined {
  if (config.moduleDescriptorReadonly === "off") return undefined;
  if (!isDescriptorFile(absPath, config.moduleDescriptorFileName)) return undefined;

  const actualName = path.basename(absPath);

  if (config.moduleDescriptorReadonly === "file") {
    return {
      block: true,
      reason: `Readonly rule: ${actualName} is readonly (mode: file)`,
    };
  }

  const fmBefore = extractFrontmatter(before);
  const fmAfter = extractFrontmatter(after);
  if (JSON.stringify(fmBefore) === JSON.stringify(fmAfter)) return undefined;

  return {
    block: true,
    reason: `Readonly rule: frontmatter of ${actualName} is readonly`,
  };
}

function formatDenial(
  relPath: string,
  reason: string,
  absPath: string,
  index: ModuleIndex,
  cwd: string,
  outputModuleProseOnBlock: boolean,
): string {
  const modulePath = findOwningModule(absPath, index);
  const contract = modulePath
    ? index.contracts.find((c) => c.modulePath === modulePath)
    : undefined;

  let message = `[Module Gate] Write blocked — ${relPath}\n\n${reason}`;

  if (outputModuleProseOnBlock && contract && contract.prose) {
    const relModuleMd = path.relative(cwd, path.join(contract.modulePath, contract.descriptorFileName));
    message += `\n\nModule contract (${relModuleMd}):\n${contract.prose}`;
  }

  return message;
}

function isDescriptorFile(absPath: string, descriptorFileName: string): boolean {
  const basename = path.basename(absPath);
  return basename.toLowerCase() === descriptorFileName.toLowerCase();
}

function extractFrontmatter(content: string): Record<string, unknown> {
  try {
    return parseFrontmatter(content).frontmatter;
  } catch {
    return {};
  }
}

// visible for testing
export {
  checkDescriptorFileReadonly,
  formatDenial,
  isDescriptorFile,
  extractFrontmatter,
}