import * as fs from "node:fs";
import * as path from "node:path";
import { parseJsonc } from "./utils/index.ts";

export type ModuleGateConfig = {
  moduleDescriptorFileName: string;
  moduleDescriptorReadonly: "file" | "frontmatter" | "off";
  sourceRoots: string[];
  disableModuleInterfaceImportGate: boolean;
  disableSystemPrompt: boolean;
  outputModuleProseOnBlock: boolean;
};

export type ConfigSource = {
  filePath: string;
  key?: string;
};

export const DEFAULT_CONFIG_SOURCES: ConfigSource[] = [
  { filePath: ".module-gates/config.json" },
];

const DEFAULTS: ModuleGateConfig = {
  moduleDescriptorFileName: "module.md",
  moduleDescriptorReadonly: "off",
  sourceRoots: ["src/"],
  disableModuleInterfaceImportGate: false,
  disableSystemPrompt: false,
  outputModuleProseOnBlock: false,
};

export function loadConfig(
  cwd: string,
  sources: ConfigSource[] = DEFAULT_CONFIG_SOURCES,
): ModuleGateConfig {
  const userConfig = readFirstUserConfig(cwd, sources);
  const merged = { ...DEFAULTS, ...userConfig };
  merged.moduleDescriptorReadonly = normalizeReadonly(merged.moduleDescriptorReadonly);
  merged.sourceRoots = normalizeSourceRoots(
    userConfig.sourceRoots ?? userConfig.sourceRoot,
    DEFAULTS.sourceRoots,
  );
  return merged as ModuleGateConfig;
}

function readFirstUserConfig(cwd: string, sources: ConfigSource[]): UserConfig {
  for (const source of sources) {
    const config = readSource(cwd, source);
    if (config) return config;
  }
  return {};
}

function readSource(cwd: string, source: ConfigSource): UserConfig | undefined {
  try {
    const raw = fs.readFileSync(path.join(cwd, source.filePath), "utf-8");
    const settings = parseJsonc(raw);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return undefined;
    }
    const candidate = source.key
      ? (settings as Record<string, unknown>)[source.key]
      : settings;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as UserConfig;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeReadonly(value: ModuleGateConfig["moduleDescriptorReadonly"] | boolean): ModuleGateConfig["moduleDescriptorReadonly"] {
  if (value === true || value === "file") return "file";
  if (value === false || value === "off") return "off";
  return value;
}

function normalizeSourceRoots(
  value: string | string[] | undefined,
  fallback: string[],
): string[] {
  if (value === undefined) return [...fallback];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((s) => typeof s === "string" && s.length > 0);
}

type UserConfig = Partial<Omit<ModuleGateConfig, "moduleDescriptorReadonly" | "sourceRoots"> & {
  moduleDescriptorReadonly?: ModuleGateConfig["moduleDescriptorReadonly"] | boolean;
  sourceRoots?: string | string[];
  sourceRoot?: string | string[];
}>;
