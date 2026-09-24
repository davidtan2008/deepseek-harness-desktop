# Runtime Manifest

> R1 的第一块实现：让 Desktop 在启动时能够明确回答“它运行的是哪一份代码、哪一份 Harness、哪些能力是外部依赖”。

## 目的

`runtime-manifest.json` 是生成到 `apps/shell/runtime-manifest.json` 的本地构建产物，不提交到 Git。源码模式由 `pnpm runtime:manifest` 生成；打包模式由 `pnpm runtime:manifest:packaged` 生成，并由 `electron-builder.yml` 放入 `resources/runtime-manifest.json`。

它解决以下问题：

- 诊断时不再依靠猜测 Node、pnpm、Harness 或平台版本；
- 启动自有 Host 前比较 manifest 与实际 Harness package/gitlink，版本或 commit 不一致时 fail closed；
- Host 兼容性检查有单一 runtime 输入；
- 发行时可以区分“声明 bundled”与“实际上仍依赖系统环境”；
- capability manifest 能向 UI/未来 adapter 暴露当前运行模式；
- manifest 不包含 API key、token、绝对用户路径或 profile 内容。

## Schema v3

```json
{
  "schemaVersion": 3,
  "generatedAt": "ISO-8601",
  "mode": "source | packaged",
  "desktop": {
    "version": "0.1.0",
    "gitCommit": "git commit",
    "dirty": true
  },
  "harness": {
    "commit": "gitlink commit",
    "version": "dsh version",
    "packageManager": "pnpm@..."
  },
  "node": { "version": "v..." },
  "pnpm": { "version": "..." },
  "platform": { "name": "darwin", "arch": "arm64" },
  "ripgrep": { "available": true, "version": "..." },
  "inventory": {
    "scope": "desktop-build",
    "complete": true,
    "fileCount": 191,
    "digest": "sha256..."
  },
  "bundled": {
    "harness": false,
    "node": false,
    "pnpm": false,
    "ripgrep": false
  },
  "closure": null
}
```

Schema v3 增加了可验证的 `closure` 记录。`source` 模式为 `null`；`packaged` 模式由 `pnpm runtime:prepare` 生成，记录目标平台、Harness/Node/pnpm/ripgrep 入口及每个普通文件的 bytes、SHA-256 和 executable 状态。旧的 v1/v2 manifest 会被拒绝，必须重新生成。

`inventory` 是 DHD 自有 build output 的聚合摘要：生成器对 shell、workbench 和 desktop profile 文件计算排序后的 SHA-256 digest。`closure` 才是 packaged Harness/Node/pnpm/ripgrep 的逐文件 inventory；两者不能互相替代。`closure` 目录由 `scripts/prepare-runtime-closure.mjs` 生成到 `apps/shell/runtime-closure/`，不提交 Git；脚本会把 pnpm deploy 省略的 Harness first-party peer/vendor packages 一并 materialize。打包后入口固定为 `Resources/runtime/dsh/lib/bin.js`、`Resources/runtime/bin/node`、`Resources/runtime/pnpm/bin/pnpm.mjs` 和 `Resources/runtime/ripgrep/rg`。

类型定义位于 [`packages/shared/src/runtime.ts`](../packages/shared/src/runtime.ts)。Main 侧通过 [`apps/shell/src/runtime-manifest.ts`](../apps/shell/src/runtime-manifest.ts) 做 schema 校验；损坏或缺失的 manifest 不会被当作可信运行时，而会让 capability 返回 `runtime: null` 并保留诊断日志。

## 生成和使用

```sh
pnpm runtime:prepare           # 生成 target-specific closure（不提交）
pnpm smoke:runtime-closure     # 校验 bundled Node/pnpm/rg/dsh
pnpm smoke:packaged-host       # 用 closure 启动并关闭真实 dsh web
pnpm runtime:manifest           # source
pnpm runtime:manifest:packaged  # packaged manifest
pnpm release:check              # 正式发行门
pnpm doctor:env                 # 检查并报告 manifest
pnpm check:packaged-runtime         # 检查当前平台已生成的 app resources
node scripts/check-release-runtime.mjs --resources <app>/Contents/Resources
```

packaged test runner 使用 closure 内的固定 pnpm，并以 `--pm-on-fail=ignore` 禁止 pnpm 按用户项目的 `packageManager` 字段切换到另一份 CLI；这保证测试命令使用的是 manifest 声明的 runtime，而不是用户 PATH 或项目隐式下载的 pnpm。

`app.capabilities` 会把有效 manifest 的摘要放入 `DesktopCapabilities.runtime`；摘要只包含 closure 入口、版本和 `fileCount`，不会把逐文件 inventory 通过 IPC 发送到 Renderer。Main 侧仍保留完整 manifest/closure inventory 供 release gate 和 Host preflight 使用。Renderer 可以据此显示 source/packaged 模式和 Harness 版本；未来 Host adapter 应在启动前比较 manifest 与实际 runtime，不匹配时 fail closed 或进入恢复流程。

## 当前状态

- schema v3、生成器、doctor、capability 集成和 DHD build-output digest inventory 已完成；source mode 的 closure 为空，packaged mode 要求实际 closure descriptor；
- `runtime:prepare` 可在当前 macOS arm64 checkout 上生成 dsh deploy/peer closure、Node、pnpm 和目标平台 ripgrep；`smoke:runtime-closure` 与 `smoke:packaged-host` 已通过，生成目录不提交 Git；
- packaged Host 启动前会校验 manifest、closure 入口和版本；缺失或不匹配时 fail closed，避免静默回退到 `npx`/系统 Node。`DHD_ALLOW_UNBUNDLED_RUNTIME=1` 只用于本地诊断；
- `check:packaged-runtime` 对 macOS electron-builder 产生的 code-signing mutations 做 `codesign --verify --deep --strict` 校验，并允许 `_CodeSignature` 元数据；closure inventory 排除仅用于保留空目录的 `.gitkeep` 占位文件；当前 macOS arm64 app 的 post-pack check 已通过；
- 仍需完成正式发行所需的公证、跨平台安装、升级回滚和最终签名 artifact inventory 策略；
- manifest 不是安全沙箱，也不是插件授权。

## 变更规则

- 修改字段或 schema 必须提升 `schemaVersion` 或提供兼容解析；
- Harness gitlink、Node/pnpm 或 native dependency 变化必须重新生成 manifest；
- release 不得手工编辑生成文件；
- manifest 中的 `dirty: true` 不能进入正式 release；
- 发行验证必须检查 manifest 声明与实际文件清单一致。
