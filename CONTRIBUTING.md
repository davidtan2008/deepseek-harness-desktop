# 贡献指南

感谢参与 DeepSeek Harness Desktop 的开发。本文覆盖环境搭建、日常开发、提交规范与上游同步流程。

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22.19+ 或 24+ | Host 用本机 Node 运行，不使用 Electron 内嵌 Node |
| pnpm | 10.14.0 | 仓库通过 `packageManager` 字段锁定；`corepack enable` 后自动匹配 |
| Git | 2.20+ | 需要 submodule 支持 |

国内网络下建议预设 Electron 镜像，避免二进制下载超时：

```sh
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

## 克隆与初始化

```sh
# 1. 递归克隆（同时拉取 harness/ 子模块）
git clone --recursive git@github.com:davidtan2008/deepseek-harness-desktop.git
cd deepseek-harness-desktop

# 2. 安装桌面端依赖
pnpm install

# 3. 初始化上游 Harness（作为运行时 Host，首次必做）
cd harness && pnpm install && pnpm run build && cd ..
```

跳过第 3 步应用仍可启动，但 Agent 面板会提示等待 Host。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发模式：Vite 工作台（5173）+ Electron 壳，自动拉起 Host |
| `pnpm typecheck` | 全 workspace 类型检查（自动先构建 `@dhd/shared`） |
| `pnpm build` | 构建 shared → workbench → shell |
| `pnpm pack` | electron-builder 打包当前平台 |
| `pnpm pack:mac` / `pack:win` / `pack:linux` | 打包指定平台 |
| `pnpm --filter @dhd/shell start` | 单独启动 Electron（需先 build） |

## 仓库布局

```
apps/
├── shell/               # Electron 主进程（TypeScript + esbuild 打包）
│   ├── src/             #   主进程源码：窗口/菜单/IPC/服务层
│   └── scripts/         #   构建与开发启动脚本
├── workbench/           # 渲染进程（React 18 + Vite 6 + Monaco + xterm）
packages/
├── shared/              # 主进程 ↔ 渲染进程共享的类型、协议与常量
└── desktop-profile/     # dsh overlay（--patch 注入的 cordis.patch.yml）
harness/                 # 上游 submodule（锁 commit，勿直接修改）
docs/                    # 设计文档、架构文档、用户指南
.github/workflows/       # 三平台 CI
```

**边界约定**：

- 主进程不执行 Agent 工具、不改会话日志；Agent 内核一律走 `harness/` 子进程。
- 渲染进程无 Node 集成（`nodeIntegration: false`），只通过 preload 白名单 API 访问系统能力；新增能力必须同时更新 `packages/shared/src/protocol.ts` 的 `IpcChannel` / `IpcEventChannel`。
- `harness/` 内的改动一律走上游 PR 或 `--patch` overlay，禁止在本仓库直接改子模块内容后提交。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，与现有历史保持一致：

```
<type>(<scope>): <subject>

<body>
```

| type | 用途 |
|---|---|
| `feat` | 新功能（scope 用包名，如 `feat(shell)`、`feat(workbench)`） |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `build` | 构建、依赖、submodule 指针 |
| `chore` | 脚手架、工具链、CI |
| `refactor` | 重构（不改变行为） |

要求：subject 用英文祈使句、不超过 50 字符；body 说明动机与影响。提交前确保 `pnpm typecheck && pnpm build` 通过。

## 分支与 PR

1. 从 `main` 切出特性分支：`feat/<topic>`、`fix/<topic>`
2. 推送并创建 PR（模板见 `.github/PULL_REQUEST_TEMPLATE.md`）
3. CI（macOS / Ubuntu / Windows 三平台 typecheck + build）全绿后合并
4. 保持提交原子化，避免“巨型提交”

## 更新上游 Harness（submodule SOP）

父仓库记录的只是子模块的 commit 指针（gitlink），**更新 = 移动指针并提交**。完整流程：

```sh
# 1. 拉取并检出上游 master 最新 commit（只动子模块内部）
git submodule update --remote harness

# 2. 验证新版本可用（重要：上游是开发者预览版，承诺有破坏性变更）
cd harness
pnpm install && pnpm run build
ls apps/cli/src/bin.ts        # 桌面端探测的入口必须存在
cd ..
pnpm typecheck && pnpm build  # 桌面端回归

# 3. 把新指针写入父仓库历史（缺了这步，别人 clone 拿到的还是旧版本）
git add harness
git commit -m "build: bump harness submodule to <版本号>"
git push
```

只执行第 1 步的后果：`git status` 永远显示 `modified: harness (new commits)`，仓库历史锁定的仍是旧 commit，CI 与其他人不受影响。回滚用 `git checkout <旧commit> -- harness && git commit`。

## 发布流程

1. 更新根 `package.json` 与各子包 `version`
2. 在 `CHANGELOG.md` 补充版本条目
3. `git commit -m "chore: release v<x.y.z>" && git tag -a v<x.y.z> -m "..."`
4. `git push --follow-tags`
5. CI 通过后本地 `pnpm pack:mac` 等产出安装包，上传 GitHub Release（electron-builder 已配置 `publish: github`，签名流水线就绪后可全自动）
