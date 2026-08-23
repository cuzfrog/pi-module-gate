# module-gates - Constraints liberate, liberties constrain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/cuzfrog/module-gates/main)](https://github.com/cuzfrog/module-gates/commits/main)
[![GitHub repo size](https://img.shields.io/github/repo-size/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates)
[![CI](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml/badge.svg)](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml)

[English](README.md) · **简体中文** · [日本語](README.ja.md)

Hooks 通过强制模块边界来控制代码库的熵，帮助对抗代码Slops。

支持的代理框架：
- **pi** — pi 扩展
- **Claude Code** — 插件，或通过 CLI 安装的普通 hooks
- **Devin CLI** — 插件，或通过 CLI 安装的普通 hooks

添加对其他代理（qwen-code、cursor 等）的支持意味着添加一个桥接层。

### 方法

**模块契约作为护栏。** 每个目录可以包含一个描述符文件（默认 `MODULE.md`），声明：

- `readonly` — 文件不可编辑
- `no-new-exports` — 禁止新增导出（文件主体仍可编辑）

该扩展会拦截代理的 `write`/`edit` 操作并强制执行这些契约。违规操作会被阻止并附带原因。

尝试添加 2 个公共辅助函数的行为被阻止，迫使代理重新思考设计。
![模块门拒绝示例](doc/module_gates_block.png)

### 工作原理

1. **Indexing** — 会话启动时，扫描项目树中的描述符文件并构建模块索引。
2. **System prompt** — 注入提示让代理了解描述符文件约定。
3. **Gating** — 每次写入/编辑时检查：
   - **Readonly gate** — 目标文件是否被锁定？
   - **No-new-exports gate** — 变更是否会向 `no-new-exports` 列表中的文件添加新导出？
   - **Module interface import gate** — 外部文件只能通过模块接口（即 TypeScript 的 `index.ts` 或 Rust 的 `mod.rs` 的重新导出）导入。子模块可以导入父模块的内部文件（不推荐但允许）。（仅支持 TypeScript/JavaScript 和 Rust）
   - **Import gate**（尚未实现）— 变更是否会引入违反可见性范围的导入？

- System prompt: [system-prompt.md](src/core/context/system-prompt.template.md)
- 目前 [支持的语言](src/core/gates/checkers/index.ts)：**TypeScript/JavaScript**、**Rust**、**Java**、**Go**、**Kotlin**、**Scala**

## 安装

<details>
<summary>pi</summary>

```bash
pi install npm:@cuzfrog/module-gates
```
或为单个会话直接加载：
```bash
pi -e npm:@cuzfrog/module-gates
```

</details>

<details>
<summary>Claude Code</summary>

作为插件，从本仓库的市场安装（无需登录 — 公开仓库）：
```
/plugin marketplace add cuzfrog/module-gates
/plugin install module-gates@cuzfrog
```
在首次 hook 调用时，插件会将运行时依赖安装到其数据目录中。

或者作为普通 hooks 连接到项目（需要项目中安装该包）：
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-claude
```
这会将 `PreToolUse` 和 `SessionStart` hooks 写入 `.claude/settings.json`；`npx module-gates uninstall-claude` 会移除它们。`SessionStart` hook 会自动注入系统提示。

或者复用已有的 pi 安装，在 `~/.claude/settings.json` 中手动指向 hooks：
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
pi 安装目录可能不同；请在 pi npm 根目录下定位 `run.mjs`。`SessionStart` hook（系统提示注入）是可选的 — 仅 `PreToolUse` 即可强制执行门控。

</details>

<details>
<summary>Devin CLI</summary>

作为插件（需要项目中安装该包）：
```bash
npm install --save-dev @cuzfrog/module-gates
devin plugins install cuzfrog/module-gates
```

或者作为普通 hooks 连接到项目：
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-devin
```
这会将 `PreToolUse` 和 `SessionStart` hooks 写入 `.devin/hooks.v1.json`；`npx module-gates uninstall-devin` 会移除它们。`SessionStart` hook 会自动注入系统提示。当检测到门控违规时，`PreToolUse` hook 会拒绝工具调用并将原因报告给代理。

或者在 `.devin/hooks.v1.json` 中手动指向 hooks：
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
对于全局或自定义安装，将 `${DEVIN_PROJECT_DIR}/node_modules` 替换为包实际所在的路径（例如 `$(npm root -g)`）。`SessionStart` hook（系统提示注入）是可选的 — `PreToolUse` hook 执行门控。

</details>

## 模块描述符语义

模块描述符是一个 Markdown 文件（默认名称：`MODULE.md`），放在目录中。你可以复用模块上下文文件，例如 `CONTEXT.md`。`MODULE.md` 只强制执行其所在目录的规则。

### 只读约束

```markdown
---
readonly: [mod.rs]
---

供代理更好地理解模块的说明文字。
```

### 禁止新增导出约束

```yaml
no-new-exports: [mod.rs]
```
禁止新增导出的文件不能改变其表面大小：不允许新增导出或公开条目。文件主体仍然可以编辑。

一个 [module-no-new-exports-all](skills/module-no-new-exports-all) 技能已包含，用于在模块中填充禁止新增导出的条目。

| 场景 | 行为 |
|------|------|
| 没有 `MODULE.md` | 模块不受约束 — 不执行任何门控。 |
| YAML frontmatter 格式错误 | 模块保持未保护状态，并发出信息通知。 |

## 配置

规范的代理无关位置是 `.module-gates/config.json`（整个文件就是配置，没有包装键）。当该文件不存在时，每个桥接会回退到代理设置文件中的 `module-gates` 键 — 例如 `.pi/settings.json`、`.claude/settings.json`。

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

| 选项 | 默认值 | 描述 |
|------|--------|------|
| `moduleDescriptorFileName` | `MODULE.md` | 用于模块描述符的文件名（不区分大小写） |
| `moduleDescriptorReadonly` | `"off"` | `"file"` 使整个描述符只读；`"frontmatter"` 仅锁定 YAML frontmatter（主体说明文字仍可编辑）；`"off"` 禁用描述符只读。`true`/`false` 也接受以保持向后兼容。 |
| `sourceRoots` | `["src/"]` | 强制执行门控的目录。描述符文件的发现与该设置无关，始终覆盖整个项目。传递字符串表示单个根目录，或数组表示多个根目录（例如使用 `["packages/app/src/", "packages/lib/src/"]` 的多仓库项目）。使用 `[""]` 从项目根目录强制执行。遗留的单数 `sourceRoot`（字符串）仍然接受。 |
| `disableModuleInterfaceImportGate` | `false` | 为 `true` 时，导入不会被强制为模块接口。 |
| `disableSystemPrompt` | `false` | 为 `true` 时，跳过将模块门控提示注入代理的系统提示。 |
| `outputModuleProseOnBlock` | `false` | 为 `true` 时，违规模块描述符的说明文字会附加到阻止消息中，使代理看到契约上下文。默认禁用以保持错误消息简洁。 |

当没有设置文件或不存在 `module-gates` 键时，应用默认值。

## 故障排查
提示：
```
检查 PreToolUse hook `module-gates` 是否被触发并正常运行。
```

## 许可证

MIT

## 作者
Cause Chung (cuzfrog@gmail.com)
