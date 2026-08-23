import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MockExtensionAPI,
  FIXTURES,
  startSession,
  doWrite,
} from "./helpers.ts";

vi.mock("../../src/core/config.ts", () => ({
  loadConfig: () => ({
    moduleDescriptorFileName: "module.md",
    moduleDescriptorReadonly: "file",
    sourceRoots: ["src/"],
    disableModuleInterfaceImportGate: false,
    disableSystemPrompt: false,
    outputModuleProseOnBlock: false,
  }),
}));

import mod from "../../src/bridges/pi/index.ts";

describe("module interface import gating", () => {
  let mock: MockExtensionAPI;

  beforeEach(() => {
    mock = new MockExtensionAPI();
    mod(mock);
  });

  it("blocks external file from importing non-interface file in a sibling module", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/app.ts",
      'import { fun1 } from "../other/fun1";\n',
      cwd,
    );

    expect((result as any).block).toBe(true);
    expect((result as any).reason).toContain("fun1.ts");
  });

  it("blocks external file from importing non-interface file in a child module", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/app.ts",
      'import { secret } from "./internal/secrets";\n',
      cwd,
    );

    expect((result as any).block).toBe(true);
    expect((result as any).reason).toContain("secrets.ts");
  });

  it("allows external file to import through a module's interface", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/app.ts",
      'import { fun1 } from "../other/index";\n',
      cwd,
    );

    expect(result?.block).toBeFalsy();
  });

  it("allows sibling files within the same module to import each other", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/app.ts",
      'import { API_URL } from "./config";\n',
      cwd,
    );

    expect(result?.block).toBeFalsy();
  });

  it("allows a file in an internal sub-directory to import within the same module", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/internal/sub/foo.ts",
      'import { API_KEY } from "../secrets";\n',
      cwd,
    );

    expect(result?.block).toBeFalsy();
  });

  it("allows child module to import from parent module's internal file (not recommended but allowed)", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/internal/sub/foo.ts",
      'import { greet } from "../../app";\n',
      cwd,
    );

    expect(result?.block).toBeFalsy();
  });

  it("still blocks parent module from importing child module's internal file", async () => {
    const cwd = FIXTURES;
    await startSession(mock, cwd);

    const result = await doWrite(
      mock,
      "src/app.ts",
      'import { API_KEY } from "./internal/secrets";\n',
      cwd,
    );

    expect((result as any).block).toBe(true);
    expect((result as any).reason).toContain("secrets.ts");
  });
});