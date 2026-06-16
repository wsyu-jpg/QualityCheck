# QualityCheck AI 文案质检协作规范

## 项目边界
- 本项目第一版是小红书与公众号文案 AI 质检工作台。
- 主要能力包括本地违禁词检测、原文高亮、批注式 AI 建议、一键改写和简繁输出入口。
- 第一版词库使用 `data/lexicons.json`，不接后台管理。
- 当前检测优先调用 `AI_AGENT_CHECK`，由 AI 返回可用于高亮的 `matches`、`summary` 和 `annotations`；AI 检测失败时回落本地词库。
- 本地词库仍作为检测 fallback，用于 AI 未配置、请求失败、返回非 JSON 或 offset 校验失败等场景。
- `AI_AGENT_REVIEW` 保留为本地 fallback 结果的可选批注增强。
- 一键改写必须调用 `AI_AGENT_REWRITE`，不得使用代码直接替换作为正式改写结果。

## 必须同步维护的文档
- 修改 UI、AI 返回格式、词库结构、平台规则、测试策略时，必须同步更新 `specs/ai-quality-check.md`。
- 修改协作流程、agent 配置方式或 review 要求时，必须同步更新本文件。
- 不允许只改代码不改公共文档。

## AI Agent 配置
- `AI_AGENT_CHECK_*`：检测 agent，用于直接识别原文风险表达，并返回 `CheckResponse` JSON。
- `AI_AGENT_REVIEW_*`：检测建议 agent，用于本地 fallback 结果的批注式建议增强。
- `AI_AGENT_REWRITE_*`：整文改写 agent，用于一键改写优化稿。
- `AI_AGENT_TRADITIONAL_*`：繁体处理 agent，当前预留给繁体输入识别、转换和繁体输出。
- 每个 agent 支持以下环境变量：
  - `AI_AGENT_<NAME>_BASE_URL`
  - `AI_AGENT_<NAME>_API_KEY`
  - `AI_AGENT_<NAME>_MODEL`
  - `AI_AGENT_<NAME>_TEMPERATURE`
  - `AI_AGENT_<NAME>_TIMEOUT_MS`
- `AI_AGENT_CHECK` 当前使用 FastGPT workflow，`MODEL` 可不配置；`BASE_URL` 可配置为 `https://aigpt.centanet.com`。
- `AI_AGENT_CHECK` 当前按 FastGPT `/api/v1/chat/completions` 协议调用，`messages[0].content` 只放原文，AI 返回 JSON 放在 `choices[0].message.content`。
- `AI_AGENT_REWRITE` 可按 FastGPT `/api/v1/chat/completions` 协议调用，`messages[0].content` 打包原文、`matches`、`annotations`、目标语言和改写目标。
- `AI_AGENT_REVIEW` 默认按 OpenAI-compatible `/chat/completions` 协议调用，AI 必须只返回 JSON。
- `AI_AGENT_CHECK` 与 FastGPT 形式的 `AI_AGENT_REWRITE` 可不配置 `MODEL`；OpenAI-compatible agent 仍需要配置 `MODEL`。
- `AI_AGENT_CHECK` 未配置或失败时，检测结果由本地词库 fallback 生成。
- 未配置 `AI_AGENT_REVIEW_*` 时，批注建议由本地词库 `note` 和 `alternatives` 生成。
- 未配置 `AI_AGENT_REWRITE_*` 时，一键改写必须返回可读错误，引导先配置改写 agent。

## JSON 契约
- `/api/quality/check` 与 `/api/quality/rewrite` 的请求和响应结构以 `specs/ai-quality-check.md` 为准。
- 服务端必须校验 AI JSON，不能把未校验的 AI 输出直接传给前端。
- `AI_AGENT_CHECK` 可返回完整 `CheckResponse`，或返回包含 `matchKeywords` 的批注数组；服务端必须校验 AI JSON，并用 `matchKeywords` 回查原文生成高亮 offset。
- `AI_AGENT_REVIEW` 只返回 `annotations`，不得改写本地词库 fallback 命中的 `matches`、`summary` 或 offset。
- 批注序号由前端根据 `annotations` 数组顺序生成，AI 不需要返回“批注 1/2/3”。

## 设计与测试要求
- UI 风格保持简约后台工具风格：白底、浅灰分区、蓝色主按钮、红/橙风险提示、8px 圆角。
- 不新增营销落地页，首屏必须是可操作工作台。
- 修改检测逻辑或 JSON 校验时必须补充单元测试。
- 修改主流程时至少验证：空文本、无命中、多命中、批注 fallback、未配置改写 AI、一键改写。

## 打包与交付
- 项目使用 Next.js standalone 输出，构建配置在 `next.config.mjs`。
- 正式打包前必须运行 `npm test` 和 `npm run build`。
- 交付压缩包应包含 standalone 服务端、`.next/static` 静态资源、`public` 静态资源、文档和配置说明。
- 生产环境启动前必须配置需要使用的 AI agent 环境变量；未配置 `AI_AGENT_REWRITE_*` 时，一键改写会返回错误。
