# module-gates - Constraints liberate, liberties constrain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/cuzfrog/module-gates/main)](https://github.com/cuzfrog/module-gates/commits/main)
[![GitHub repo size](https://img.shields.io/github/repo-size/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates)
[![CI](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml/badge.svg)](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml)

**English** · [简体中文](README.zh.md) · [日本語](README.ja.md)

Hooks that controls the entropy of the codebase by enforcing module boundaries, helping combat slops.

Supported agent harnesses:
- **pi** — pi extension
- **Claude Code** — plugin, or plain hooks installed by the CLI
- **Devin CLI** — plugin, or plain hooks installed by the CLI

Adding support for another agent (qwen-code, cursor, ...) means adding a bridge.

### Approach

**Module contracts as guardrails.** Each directory can contain a descriptor file (default `MODULE.md`) that declares:

- `readonly` — files cannot be edited
- `no-new-exports` — files where no new exports are allowed (body still editable)

The extension intercepts agent `write`/`edit` operations and enforces these contracts. Violations are blocked with a reason.

The attempt to add 2 public helper functions is blocked, forcing the agent to re-think the design.
![Module Gate denial example](doc/module_gates_block.png)

### How it works

1. **Indexing** — On session start, scans the project tree for descriptor files and builds a module index.
2. **System prompt** — Injects a hint so the agent knows to respect descriptor file conventions.
3. **Gating** — On every write/edit, checks:
   - **Readonly gate** — is the target file locked?
   - **No-new-exports gate** — would the change add new exports to a file in the `no-new-exports` list?
   - **Module interface import gate** — external files can only import from the module not internal files, i.e. re-exports from `index.ts` or `mod.rs`. A child module may import from a parent module's internal files (not recommended but allowed). (Only Typescript/JavaScript and Rust are supported)
   - **Import gate** (not implemented yet) — would the change introduce an import violating visibility scope?

- System prompt: [system-prompt.md](src/core/context/system-prompt.template.md)
- Currently [supported languages](src/core/gates/checkers/index.ts): **TypeScript/JavaScript**, **Rust**, **Java**, **Go**, **Kotlin**, **Scala**

## Installation

<details>
<summary>pi</summary>

```bash
pi install npm:@cuzfrog/module-gates
```
Or load directly for a single session:
```bash
pi -e npm:@cuzfrog/module-gates
```

</details>

<details>
<summary>Claude Code</summary>

As a plugin, from this repository's marketplace (no login required — public repo):
```
/plugin marketplace add cuzfrog/module-gates
/plugin install module-gates@cuzfrog
```
On the first hook invocation the plugin installs its runtime dependencies into its data directory.

Or as plain hooks wired into a project (requires the package installed in the project):
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-claude
```
This writes `PreToolUse` and `SessionStart` hooks into `.claude/settings.json`; `npx module-gates uninstall-claude` removes them. The `SessionStart` hook injects the system prompt hint automatically.

Or reuse an existing pi installation by pointing hooks at it manually in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.pi/agent/npm/node_modules/@cuzfrog/module-gates/src/bridges/claude/run.mjs\" pre-tool-use"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.pi/agent/npm/node_modules/@cuzfrog/module-gates/src/bridges/claude/run.mjs\" session-start"
          }
        ]
      }
    ]
  }
}
```
The pi install directory may differ; locate `run.mjs` under your pi npm root. The `SessionStart` hook (system prompt injection) is optional — `PreToolUse` alone enforces the gates.

</details>

<details>
<summary>Devin CLI</summary>

As a plugin (requires the package installed in the project):
```bash
npm install --save-dev @cuzfrog/module-gates
devin plugins install cuzfrog/module-gates
```

Or as plain hooks wired into a project:
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-devin
```
This writes `PreToolUse` and `SessionStart` hooks into `.devin/hooks.v1.json`; `npx module-gates uninstall-devin` removes them. The `SessionStart` hook injects the system prompt hint automatically. When a gate violation is detected, the `PreToolUse` hook rejects the tool call and reports the reason to the agent.

Or point at the package manually in `.devin/hooks.v1.json`:
```json
{
  "PreToolUse": [
    {
      "matcher": "^(write|edit|apply_patch)$",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${DEVIN_PROJECT_DIR}/node_modules/@cuzfrog/module-gates/src/bridges/devin/run.mjs\" pre-tool-use"
        }
      ]
    }
  ],
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"${DEVIN_PROJECT_DIR}/node_modules/@cuzfrog/module-gates/src/bridges/devin/run.mjs\" session-start"
        }
      ]
    }
  ]
}
```
For a global or custom install, replace `${DEVIN_PROJECT_DIR}/node_modules` with the path where the package lives (e.g. `$(npm root -g)`). The `SessionStart` hook (system prompt injection) is optional — the `PreToolUse` hook enforces the gates.

</details>

## Module Descriptor Semantics

A module descriptor is a Markdown file (default name: `MODULE.md`) placed in a directory. You can piggy-back on your module context file for example `CONTEXT.md`. A `MODULE.md` only enforces its own immediate directory.

### Readonly constraints

```markdown
---
readonly: [mod.rs]
---

Any prose for the agent to better understand the module.
```

### No-new-exports constraints

```yaml
no-new-exports: [mod.rs]
```
No-new-exports files cannot change their surface size: no new exports or public entries are allowed. The file body is still editable.

A skill [module-no-new-exports-all](skills/module-no-new-exports-all) has been included to populate no-new-exports entries in modules.

| Scenario | Behavior |
|----------|----------|
| No `MODULE.md` | Module is unconstrained — nothing is gated. |
| Malformed YAML frontmatter | The module is left unguarded and an info notification is emitted. |

## Configuration

The canonical agent-independent location is `.module-gates/config.json` (the whole file is the config, no wrapper key). When it is absent, each bridge falls back to the agents' settings files under a `module-gates` key — e.g. `.pi/settings.json`, `.claude/settings.json`.

```json
{
  "module-gates": {
    "moduleDescriptorFileName": "MODULE.md",
    "moduleDescriptorReadonly": "off",
    "sourceRoots": ["src/"],
    "outputModuleProseOnBlock": false
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `moduleDescriptorFileName` | `MODULE.md` | File name used for module descriptors (case-insensitive) |
| `moduleDescriptorReadonly` | `"off"` | `"file"` makes the whole descriptor readonly; `"frontmatter"` locks only the YAML frontmatter (body prose stays editable); `"off"` disables descriptor readonly. `true`/`false` are also accepted for backward compatibility. |
| `sourceRoots` | `["src/"]` | Directories where gates are enforced. Descriptor files are discovered across the whole project regardless of this setting. Pass a single string for one root, or an array for multiple roots (e.g. monorepos with `["packages/app/src/", "packages/lib/src/"]`). Use `[""]` to enforce from the project root. Legacy singular `sourceRoot` (string) is still accepted. |
| `disableModuleInterfaceImportGate` | `false` | When `true`, imports will not be forced to be from module interface. |
| `disableSystemPrompt` | `false` | When `true`, skip injecting the module-gates hint into the agent's system prompt. |
| `outputModuleProseOnBlock` | `false` | When `true`, the violating module descriptor's prose is appended to the block message so the agent sees the contract context. Disabled by default to keep the error message concise. |

When no settings file exists or no `module-gates` key is present, defaults apply.

## Troubleshooting
Prompt:
```
Check if PreToolUse hook `module-gates` is triggered and runs expectedly.
```

## License

MIT

## Author
Cause Chung (cuzfrog@gmail.com)
