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

## Schema v1

```json
{
  "schemaVersion": 1,
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
  "bundled": {
    "harness": false,
    "node": false,
    "pnpm": false,
    "ripgrep": false
  }
}
```

类型定义位于 [`packages/shared/src/runtime.ts`](../packages/shared/src/runtime.ts)。Main 侧通过 [`apps/shell/src/runtime-manifest.ts`](../apps/shell/src/runtime-manifest.ts) 做 schema 校验；损坏或缺失的 manifest 不会被当作可信运行时，而会让 capability 返回 `runtime: null` 并保留诊断日志。

## 生成和使用

```sh
pnpm runtime:manifest          # source
pnpm runtime:manifest:packaged # packaged manifest
pnpm release:check              # 正式发行门（当前会因未 bundled 而失败）
pnpm doctor:env                # 检查并报告 manifest
```

`app.capabilities` 会把有效 manifest 放入 `DesktopCapabilities.runtime`。Renderer 可以据此显示 source/packaged 模式和 Harness 版本；未来 Host adapter 应在启动前比较 manifest 与实际 runtime，不匹配时 fail closed 或进入恢复流程。

## 当前状态

- schema、生成器、doctor、capability 集成已完成；macOS arm64 的 packaged App Resources 已验证包含 manifest；
- packaged Host 启动前会校验 manifest；当前未 bundled 的包会 fail closed，避免静默回退到 `npx`/系统 Node。`DHD_ALLOW_UNBUNDLED_RUNTIME=1` 只用于本地诊断；
- 下一阶段实现真正的 runtime closure、hash/inventory、签名和安装后 smoke；
- manifest 不是安全沙箱，也不是插件授权。

## 变更规则

- 修改字段或 schema 必须提升 `schemaVersion` 或提供兼容解析；
- Harness gitlink、Node/pnpm 或 native dependency 变化必须重新生成 manifest；
- release 不得手工编辑生成文件；
- manifest 中的 `dirty: true` 不能进入正式 release；
- 发行验证必须检查 manifest 声明与实际文件清单一致。
