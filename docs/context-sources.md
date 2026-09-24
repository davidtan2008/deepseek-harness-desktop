# Context Sources

> R2 contract：统一当前文件、选区、打开 Tab、Git diff 和 Problems 的上下文格式，并在模型可见前执行边界检查。

## 当前实现

`buildContextBundle()` 接收 `AgentContextItem[]`，输出：

- 规范化的结构化 items；
- 稳定的 `canonical` 文本；
- UTF-8 `byteLength`。

它拒绝绝对路径、反斜杠和 `..` 路径，并默认限制上下文为 128 KiB；超限或非法路径会抛出 `ContextBundleError`，不会静默截断后继续发送。

`AgentPanel` 的“发送选区”已经使用该 builder；native `HarnessWebSessionPort` 将 canonical context 作为独立 text part 和用户文本一起提交到 `session/prompt`，因此进入 Harness Session user message。postMessage/clipboard 仍是 iframe fallback；capability 由实际 transport snapshot 决定。

## 后续接入

1. 为 open tabs、Problems 和 Git diff 增加 producer；
2. 将 context digest、来源路径和 turn ID 投影到 Trajectory；
3. 对敏感文件、过大上下文和用户未确认的来源显示明确状态；
4. 在真实 provider/model smoke 中验证 Session log 重放和审批前后的 context 一致性。
