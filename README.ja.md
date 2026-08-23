# module-gates - Constraints liberate, liberties constrain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/cuzfrog/module-gates/main)](https://github.com/cuzfrog/module-gates/commits/main)
[![GitHub repo size](https://img.shields.io/github/repo-size/cuzfrog/module-gates)](https://github.com/cuzfrog/module-gates)
[![CI](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml/badge.svg)](https://github.com/cuzfrog/module-gates/actions/workflows/test.yml)

[English](README.md) · [简体中文](README.zh.md) · **日本語**

モジュール境界を強制することでコードベースのエントロピーを制御し、コードのSlopsと戦うためのフック。

対応しているエージェントフレームワーク：
- **pi** — pi 拡張機能
- **Claude Code** — プラグイン、または CLI でインストールしたプレーンフック
- **Devin CLI** — プラグイン、または CLI でインストールしたプレーンフック

他のエージェント（qwen-code、cursor 等）への対応はブリッジを追加することで実現できます。

### アプローチ

**モジュール契約をガードレールとして。** 各ディレクトリには記述子ファイル（デフォルト `MODULE.md`）を含めることができ、以下を宣言します：

- `readonly` — ファイルを編集不可にする
- `no-new-exports` — 新しいエクスポートを禁止（ファイル本体は編集可能）

拡張機能はエージェントの `write`/`edit` 操作を傍受し、これらの契約を強制します。違反は理由とともにブロックされます。

2 つのパブリックヘルパー関数を追加しようとする試みはブロックされ、エージェントは設計を再考せざるを得なくなる。
![モジュールゲート拒否の例](doc/module_gates_block.png)

### 仕組み

1. **Indexing** — セッション開始時に、プロジェクトツリーの記述子ファイルをスキャンし、モジュールインデックスを構築する。
2. **System prompt** — エージェントが記述子ファイルの構約を認識できるようにヒントを注入する。
3. **Gating** — 書き込み/編集のたびにチェックする：
   - **Readonly gate** — 対象ファイルはロックされているか？
   - **No-new-exports gate** — 変更が `no-new-exports` リスト内のファイルに新しいエクスポートを追加するか？
   - **Module interface import gate** — 外部ファイルはモジュールインターフェース（TypeScript の `index.ts`、Rust の `mod.rs` など）を通じてのみインポートできる。子モジュールは親モジュールの内部ファイルをインポートできる（推奨はされないが許可されている）。（TypeScript/JavaScript と Rust のみ対応）
   - **Import gate**（未実装）— 変更が可視性スコープに違反するインポートを導入するか？

- System prompt: [system-prompt.md](src/core/context/system-prompt.template.md)
- 現在 [対応言語](src/core/gates/checkers/index.ts)：**TypeScript/JavaScript**、**Rust**、**Java**、**Go**、**Kotlin**、**Scala**

## インストール

<details>
<summary>pi</summary>

```bash
pi install npm:@cuzfrog/module-gates
```
または単一セッションで直接読み込む：
```bash
pi -e npm:@cuzfrog/module-gates
```

</details>

<details>
<summary>Claude Code</summary>

このリポジトリのマーケットプレイスからプラグインとして（ログイン不要 — 公開リポジトリ）：
```
/plugin marketplace add cuzfrog/module-gates
/plugin install module-gates@cuzfrog
```
初回のフック実行時に、プラグインはランタイム依存関係をデータディレクトリにインストールする。

または、通常のフックとしてプロジェクトに接続する（プロジェクトにパッケージをインストールする必要あり）：
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-claude
```
これは `PreToolUse` と `SessionStart` フックを `.claude/settings.json` に書き込む；`npx module-gates uninstall-claude` で削除する。`SessionStart` フックは自動的にシステムプロンプトヒントを注入する。

または既存の pi インストールを再利用し、`~/.claude/settings.json` でフックを手動で指す：
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
pi のインストールディレクトリは異なる場合がある；pi npm ルート下の `run.mjs` を探す。`SessionStart` フック（システムプロンプト注入）は省略可能 — `PreToolUse` のみでゲートを強制する。

</details>

<details>
<summary>Devin CLI</summary>

プラグインとして（プロジェクトにパッケージをインストールする必要あり）：
```bash
npm install --save-dev @cuzfrog/module-gates
devin plugins install cuzfrog/module-gates
```

または、通常のフックとしてプロジェクトに接続する：
```bash
npm install --save-dev @cuzfrog/module-gates
npx module-gates install-devin
```
これは `PreToolUse` と `SessionStart` フックを `.devin/hooks.v1.json` に書き込む；`npx module-gates uninstall-devin` で削除する。`SessionStart` フックは自動的にシステムプロンプトヒントを注入する。ゲート違反が検出されると、`PreToolUse` フックはツール呼び出しを拒否し、その理由をエージェントに報告する。

または `.devin/hooks.v1.json` で手動でフックを指す：
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
グローバルまたはカスタムインストールの場合、`${DEVIN_PROJECT_DIR}/node_modules` をパッケージが存在するパス（例：`$(npm root -g)`）に置き換える。`SessionStart` フック（システムプロンプト注入）は省略可能 — `PreToolUse` フックがゲートを強制する。

</details>

## モジュール記述子の意味論

モジュール記述子はディレクトリに配置される Markdown ファイル（デフォルト名：`MODULE.md`）である。モジュールコンテキストファイル（例：`CONTEXT.md`）に乗っ取ることができる。`MODULE.md` は自身のディレクトリのみを強制する。

### 読み取り専用の制約

```markdown
---
readonly: [mod.rs]
---

エージェントがモジュールをよりよく理解するための説明文。
```

### 追加エクスポート禁止の制約

```yaml
no-new-exports: [mod.rs]
```
追加エクスポート禁止のファイルは、その表面サイズを変更できない：新しいエクスポートや公開エントリは許可されない。ファイル本体は引き続き編集可能。

[module-no-new-exports-all](skills/module-no-new-exports-all) スキルが含まれており、モジュール内に追加エクスポート禁止エントリを記入する。

| シナリオ | 動作 |
|----------|------|
| `MODULE.md` なし | モジュールは制約なし — 何もゲートされない。 |
| YAML frontmatter 形式が不正 | モジュールは保護されず、通知が発行される。 |

## 設定

正規のアージェント非依存の場所は `.module-gates/config.json`（ファイル全体が設定であり、ラッパーキーはない）。そのファイルが存在しない場合、各ブリッジはエージェント設定ファイルの `module-gates` キーに下記する — 例えば `.pi/settings.json`、`.claude/settings.json`。

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

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `moduleDescriptorFileName` | `MODULE.md` | モジュール記述子のファイル名（大文字小文字を無視） |
| `moduleDescriptorReadonly` | `"off"` | `"file"` は記述子全体を読み取り専用にし、`"frontmatter"` は YAML frontmatter のみをロック（ボディの説明文は編集可能）、`"off"` は記述子の読み取り専用を無効にする。`true`/`false` も後方互換性のために受け入れられる。 |
| `sourceRoots` | `["src/"]` | ゲートを強制するディレクトリ。記述子ファイルはこの設定に関係なくプロジェクト全体から検出される。単一のルートには文字列を、配列には複数のルート（例：マルチリポジトリで `["packages/app/src/", "packages/lib/src/"]`）を指定できる。 `[""]` でプロジェクトルートから強制する。レガシーの単数形 `sourceRoot`（文字列）は引き続きサポートされる。 |
| `disableModuleInterfaceImportGate` | `false` | `true` の場合、インポートはモジュールインターフェースから強制されない。 |
| `disableSystemPrompt` | `false` | `true` の場合、エージェントのシステムプロンプトへのモジュールゲートヒントの注入をスキップする。 |
| `outputModuleProseOnBlock` | `false` | `true` の場合、違反モジュール記述子の説明文がブロックメッセージに追加され、エージェントが契約のコンテキストを確認できるにする。デフォルトでは無効で、エラーメッセージを簡潔に保つ。 |

設定ファイルが存在しない場合、または `module-gates` キーが存在しない場合は、デフォルトが適用される。

## トラブルシューティング
ヒント：
```
PreToolUse hook `module-gates` がトリガーされ、期待通りに実行されているか確認してください。
```

## ライセンス

MIT

## 作者
Cause Chung (cuzfrog@gmail.com)
