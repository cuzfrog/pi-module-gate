import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { FIXTURES } from "../../../test/behavior/helpers.ts";

const RUN = path.resolve("src/bridges/claude/run.mjs");

beforeAll(() => {
  if (!fs.existsSync(RUN)) {
    throw new Error(`${RUN} not found.`);
  }
});

function runHook(stdinObj: unknown, cwd?: string) {
  return spawnSync("node", [RUN, "pre-tool-use"], {
    input: JSON.stringify(stdinObj),
    encoding: "utf-8",
    timeout: 30_000,
    cwd,
  });
}

describe("pre-tool-use hook", () => {
  it("exits 0 for Read tool", () => {
    const r = runHook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "x" } });
    expect(r.status).toBe(0);
  });

  it("exits 2 and writes denial for Write to readonly file", () => {
    const r = runHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "src/config.ts", content: "// new" },
        cwd: FIXTURES,
      },
      FIXTURES,
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[Module Gate]");
    expect(r.stderr).toContain("Readonly rule");
  });

  it("exits 0 for Write to an editable file", () => {
    const r = runHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "src/app.ts", content: "export function greet() { return 1; }" },
        cwd: FIXTURES,
      },
      FIXTURES,
    );
    expect(r.status).toBe(0);
  });

  it("handles Edit", () => {
    const r = runHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "src/config.ts", old_string: "API_URL", new_string: "DIFFERENT_URL" },
        cwd: FIXTURES,
      },
      FIXTURES,
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Readonly rule");
  });

  it("handles MultiEdit", () => {
    const r = runHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "MultiEdit",
        tool_input: {
          file_path: "src/config.ts",
          edits: [{ old_string: "API_URL", new_string: "DIFFERENT_URL" }],
        },
        cwd: FIXTURES,
      },
      FIXTURES,
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Readonly rule");
  });

  it("fails open on malformed JSON", () => {
    const r = spawnSync("node", [RUN, "pre-tool-use"], { input: "not json", encoding: "utf-8", timeout: 30_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("[Module Gate]");
  });

  it("exits 0 for non-PreToolUse events", () => {
    const r = runHook({ hook_event_name: "SessionStart", tool_name: "Read", tool_input: {} });
    expect(r.status).toBe(0);
  });

  it("exits 2 for import bypassing the interface of a module outside sourceRoots", () => {
    const r = runHook({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {
        file_path: "src/app.ts",
        content: `import { fun1 } from "../other/fun1";\n\nexport function greet() { return 1; }\n`,
      },
      cwd: FIXTURES,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("fun1.ts");
    expect(r.stderr).toContain("other/");
  });
});