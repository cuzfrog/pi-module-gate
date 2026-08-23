import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dirent } from "node:fs";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("../utils/index.ts", () => ({
  parseFrontmatter: vi.fn(),
}));

import { readdir } from "node:fs/promises";
import * as fs from "node:fs";
import { parseFrontmatter } from "../utils/index.ts";
import { buildModuleIndex } from "./module-index-builder.ts";
import type { ModuleGateConfig } from "../config.ts";

const mockedReaddir = readdir as unknown as ReturnType<typeof vi.fn>;
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedParseFrontmatter = vi.mocked(parseFrontmatter);

const defaultConfig: ModuleGateConfig = {
  moduleDescriptorFileName: "module.md",
  moduleDescriptorReadonly: "file",
  sourceRoots: [""],
  disableModuleInterfaceImportGate: false,
  disableSystemPrompt: false,
  outputModuleProseOnBlock: false,
};

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "",
    path: "",
  } as Dirent;
}


describe("buildModuleIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds contracts from module.md files", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("src", true)] as Dirent[];
      if (d === "/project/src")
        return [makeDirent("module.md", false), makeDirent("app.ts", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("---\nreadonly: [secret.ts]\n---\nGreeting module.");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: { readonly: ["secret.ts"] },
      body: "Greeting module.",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);

    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project/src");
    expect(index.contracts[0].readonly).toContain("secret.ts");
    expect(index.contracts[0].prose).toBe("Greeting module.");
  });

  it("does not add module.md to readonly implicitly regardless of moduleDescriptorReadonly mode", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("---\nreadonly: [config.json]\n---\nRoot.");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: { readonly: ["config.json"] },
      body: "Root.",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);

    expect(index.contracts[0].readonly).not.toContain("module.md");
    expect(index.contracts[0].readonly).toContain("config.json");
  });

  it("does not add module.md to readonly when moduleDescriptorReadonly is off", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("---\nreadonly: [config.json]\n---\nRoot.");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: { readonly: ["config.json"] },
      body: "Root.",
    });

    const config: ModuleGateConfig = {
      moduleDescriptorFileName: "module.md",
      moduleDescriptorReadonly: "off",
      sourceRoots: [""],
      disableModuleInterfaceImportGate: false,
      disableSystemPrompt: false,
      outputModuleProseOnBlock: false,
    };
    const { index } = await buildModuleIndex("/project", config);

    expect(index.contracts[0].readonly).not.toContain("module.md");
    expect(index.contracts[0].readonly).toContain("config.json");
  });

  it("does not add module.md to readonly when moduleDescriptorReadonly is frontmatter", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("---\nreadonly: [config.json]\n---\nRoot.");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: { readonly: ["config.json"] },
      body: "Root.",
    });

    const config: ModuleGateConfig = {
      moduleDescriptorFileName: "module.md",
      moduleDescriptorReadonly: "frontmatter",
      sourceRoots: [""],
      disableModuleInterfaceImportGate: false,
      disableSystemPrompt: false,
      outputModuleProseOnBlock: false,
    };
    const { index } = await buildModuleIndex("/project", config);

    expect(index.contracts[0].readonly).not.toContain("module.md");
    expect(index.contracts[0].readonly).toContain("config.json");
  });

  it("parses frontmatter with readonly and no-new-exports", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: { readonly: ["locked/"], "no-new-exports": ["app.ts"] },
      body: "Some prose.",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);

    expect(index.contracts[0].readonly).toContain("locked/");
    expect(index.contracts[0].noNewExports).toContain("app.ts");
    expect(index.contracts[0].prose).toBe("Some prose.");
  });

  it("deepest module.md wins directory ownership in dirToModule", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project")
        return [makeDirent("module.md", false), makeDirent("src", true)] as Dirent[];
      if (d === "/project/src")
        return [makeDirent("module.md", false), makeDirent("app.ts", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");

    mockedParseFrontmatter.mockReturnValue({
      frontmatter: {},
      body: "",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);

    expect(index.contracts).toHaveLength(2);
    expect(index.dirToModule.get("/project/src")).toBe("/project/src");
    expect(index.dirToModule.get("/project")).toBe("/project");
  });

  it("skips malformed module.md and reports an info diagnostic", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project")
        return [makeDirent("module.md", false), makeDirent("good", true)] as Dirent[];
      if (d === "/project/good")
        return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockImplementation((p: unknown): string => {
      const filePath = p as string;
      if (filePath === "/project/module.md") return "---\nbroken: [\n---\nbad";
      return "---\nreadonly: [ok.ts]\n---\ngood";
    });

    mockedParseFrontmatter.mockImplementation((content: string) => {
      if (content.includes("broken")) {
        throw new Error("YAML parse error");
      }
      return { frontmatter: { readonly: ["ok.ts"] }, body: "good" };
    });

    const { index, diagnostics } = await buildModuleIndex("/project", defaultConfig);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Failed to parse");
    expect(diagnostics[0].message).toContain("/project/module.md");
    expect(diagnostics[0].message).toContain("unguarded");
    expect(diagnostics[0].level).toBe("info");

    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project/good");
    expect(index.contracts[0].readonly).toContain("ok.ts");
  });

  it("matches configurable descriptor file name", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project")
        return [makeDirent("CONTEXT.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");
    mockedParseFrontmatter.mockReturnValue({
      frontmatter: {},
      body: "Root.",
    });

    const config: ModuleGateConfig = {
      moduleDescriptorFileName: "CONTEXT.md",
      moduleDescriptorReadonly: "file",
      sourceRoots: [""],
      disableModuleInterfaceImportGate: false,
      disableSystemPrompt: false,
      outputModuleProseOnBlock: false,
    };
    const { index } = await buildModuleIndex("/project", config);
    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project");
    expect(index.contracts[0].readonly).not.toContain("CONTEXT.md");
  });

  it("matches module.md case-insensitively", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project")
        return [makeDirent("Module.MD", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");
    mockedParseFrontmatter.mockReturnValue({
      frontmatter: {},
      body: "Root.",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);
    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project");
  });

  it("scans the whole project regardless of sourceRoots", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") return [makeDirent("lib", true)] as Dirent[];
      if (d === "/project/lib") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");
    mockedParseFrontmatter.mockReturnValue({
      frontmatter: {},
      body: "Lib module.",
    });

    const config: ModuleGateConfig = {
      moduleDescriptorFileName: "module.md",
      moduleDescriptorReadonly: "file",
      sourceRoots: ["src/"],
      disableModuleInterfaceImportGate: false,
      disableSystemPrompt: false,
      outputModuleProseOnBlock: false,
    };
    const { index } = await buildModuleIndex("/project", config);

    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project/lib");
  });

  it("skips node_modules and .git when scanning from the project root", async () => {
    mockedReaddir.mockImplementation(async (dir: unknown) => {
      const d = dir as string;
      if (d === "/project") {
        return [
          makeDirent("lib", true),
          makeDirent("node_modules", true),
          makeDirent(".git", true),
        ] as Dirent[];
      }
      if (d === "/project/lib") return [makeDirent("module.md", false)] as Dirent[];
      if (d === "/project/node_modules") return [makeDirent("dep", true)] as Dirent[];
      if (d === "/project/node_modules/dep") return [makeDirent("module.md", false)] as Dirent[];
      if (d === "/project/.git") return [makeDirent("module.md", false)] as Dirent[];
      return [] as Dirent[];
    });

    mockedReadFileSync.mockReturnValue("content");
    mockedParseFrontmatter.mockReturnValue({
      frontmatter: {},
      body: "Module.",
    });

    const { index } = await buildModuleIndex("/project", defaultConfig);

    expect(index.contracts).toHaveLength(1);
    expect(index.contracts[0].modulePath).toBe("/project/lib");
  });
});
