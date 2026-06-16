# AI 文案质检功能规格

## 最终版状态
- 当前设计已确认作为第一版最终 UI：保留 imagegen 生成的 `QualityCheck AI` icon，使用简约后台工具风格。
- 顶部品牌区、平台切换、词库选择、左右双栏工作台、自定义输出语言下拉、批注卡和优化稿区域均属于第一版范围。
- 检测优先调用 `AI_AGENT_CHECK`，由 AI 直接返回风险批注与 `matchKeywords`；服务端按 `matchKeywords` 回查原文生成高亮 offset，AI 检测失败时回落本地词库。
- 一键改写必须调用 `AI_AGENT_REWRITE`；未配置时只展示错误，不生成本地替换稿。
- 当前仅开放简体优化稿；繁体入口只显示“繁体优化暂未支持”弹窗。
- Windows 生产部署已验证运行在 `http://10.4.18.23:85/`，部署包使用 Next.js standalone。
- 本规格、`AGENTS.md` 与代码必须同步维护，后续调整 UI、AI 契约、词库或打包方式都需要更新文档。

## 项目结构
- `app/api/quality/check/route.ts`：质检接口，优先 AI 检测，失败回落本地词库。
- `app/api/quality/rewrite/route.ts`：一键改写接口，必须调用改写 AI。
- `components/quality-workbench.tsx`：主工作台 UI、loading 锁定、语言弹窗、结果展示。
- `lib/quality/ai.ts`：FastGPT / OpenAI-compatible 调用、AI 返回格式兼容、offset 修正。
- `lib/quality/lexicon.ts`：本地词库检测、summary 计算、fallback 批注。
- `lib/quality/validators.ts`：请求体、AI 检测、AI 改写 JSON 契约校验。
- `lib/quality/types.ts`：平台、风险、命中、批注、改写等类型定义。
- `data/lexicons.json`：本地 fallback 词库。
- `tests/`：AI、词库和 validator 单元测试。
- `deploy/windows/`：Windows 发布说明、启动脚本和环境变量示例。
- `specs/ai-quality-check.md`：产品与接口规格。
- `AGENTS.md`：项目协作规范。

## 产品流程
- 用户选择平台：小红书或公众号。
- 用户勾选词库并输入文案，最多 1500 字。
- 点击“立即检测”后，服务端优先调用 `AI_AGENT_CHECK`，将原文直接放入 FastGPT `messages[0].content`。
- `AI_AGENT_CHECK` 返回检测 JSON 后，服务端优先按 `matchKeywords` 在原文中定位并生成 `matches`，用于前端高亮与批注展示。
- 未配置 `AI_AGENT_CHECK`、请求失败、返回非 JSON、字段非法或无法定位 `matchKeywords` 时，服务端回落本地词库检测。
- 回落本地词库时，未配置 `AI_AGENT_REVIEW` 则直接用本地词库中的 `note` 和 `alternatives` 生成批注建议。
- 回落本地词库且配置 `AI_AGENT_REVIEW` 后，才调用 AI 对批注原因、建议和替代表达做语义增强。
- 右侧展示原文，高亮违禁词，并显示类似文档批注的建议卡片。
- 用户点击“一键改写”后，才会在下方出现优化稿；服务端必须调用 `AI_AGENT_REWRITE` 输出改写结果，默认目标语言为简体。
- 未配置 `AI_AGENT_REWRITE` 时，一键改写返回可读错误，不使用代码替换模拟改写。
- 繁体入口保留，当前点击后弹出“繁体优化暂未支持”，后续通过 `AI_AGENT_TRADITIONAL` 支持繁体识别、转换和繁体输出。

## 产品设计规范
- 首屏为质检工作台，不做营销页。
- 顶部显示应用 logo 和产品名 `QualityCheck AI`，当前 icon 使用 imagegen 生成的 `public/qualitycheck-icon.png`。
- 顶部 logo 必须放在清晰的浅色容器内，保证 icon 白边与页面背景之间有明确边界。
- 输出语言控件使用自定义下拉菜单，不使用原生 `select`；菜单需要包含选中态、hover/focus 态和简短说明。
- 当前版本点击“繁体优化稿”不切换输出语言，弹出“繁体优化暂未支持”提示，实际改写仍只开放简体优化稿。
- 不展示“累计过滤文章篇数”等运营数字模块。
- 桌面端采用左右双栏：左侧输入与操作，右侧原文高亮和批注建议。
- 小屏改为上下布局，所有按钮允许换行，不允许文字重叠或溢出。
- 点击“立即检测”或“一键改写”后，页面进入 loading 状态，检测/改写完成前禁用其他输入、清空、保存、平台切换、词库切换、语言切换和另一个主操作按钮。
- 右侧“全文 / 违禁词 / 敏感词”统计栏固定展示在检测结果标题与“一键改写”按钮下方，作为结果面板的第二行信息。
- 视觉 token：
  - 主背景：`#eef2f7`
  - 面板背景：`#ffffff`
  - 主按钮：`#2488ff`
  - 危险提示：`#ef4444`
  - 警告提示：`#f97316`
  - 面板圆角：`8px`
- 高亮规则：
  - `high`：浅红底并带红色下划线。
  - `medium`：浅橙底并带橙色下划线。
  - `low`：浅蓝底并带蓝色下划线。
- 批注卡包含：批注序号、命中词、标题、原因、建议、替代表达。

## 词库与检测逻辑
- 词库文件：`data/lexicons.json`。
- 分类包括：`general`、`sensitive`、`xiaohongshu`、`wechat`、`ad`、`medical`。
- 检测时始终合并 `general`、`sensitive` 和当前平台词库，再叠加用户勾选词库。
- 每个命中保留 `start` 和 `end` offset，用于前端精确高亮。
- 重叠命中只保留较长、较高风险的命中，避免同一区间重复标注。
- 当前主检测链路优先依赖 AI，以提升繁体、近义表达和上下文风险识别能力。
- 本地词库作为 fallback 保留，适合 AI 请求失败、未配置或需要低成本兜底的明确规则场景。
- AI 的价值主要在解释更自然、给更贴近上下文的替代表达，以及处理没有命中固定词库但语义可能有风险的表达。

## AI Agent 职责
- `AI_AGENT_CHECK`：
  - 输入原文，当前 FastGPT workflow 已内置 prompt。
  - 服务端请求 FastGPT `/api/v1/chat/completions`，`messages[0].content` 只放原文。
  - 输出 JSON 放在 `choices[0].message.content`。
  - 当前 workflow 返回批注数组，每项包含 `matchId`、`matchKeywords`、`title`、`reason`、`suggestion`、`alternatives`。
  - `matchKeywords` 是违规原文，服务端用它回查原文并生成 `matches.start`、`matches.end`。
  - `title` 用于展示高中低风险判断，不再用于定位高亮。
  - 服务端生成的 AI 命中 `source` 使用 `ai_agent`。
  - 如果 AI 返回完整 `CheckResponse`，服务端也兼容，并会校验 `originalText` 与 offset。
  - AI 检测失败时回落本地词库。
- `AI_AGENT_REVIEW`：
  - 输入本地 fallback 检测结果和平台。
  - 只输出 `ReviewAnnotationsResponse` JSON。
  - 只负责为每个命中项生成 `annotations`。
  - 不允许返回或改动 `matches`、`summary`、原文 offset。
  - 不需要返回“批注 1/2/3”，批注序号由前端按数组顺序加工显示。
  - 未配置时，本地 fallback 系统使用代码生成批注：`data/lexicons.json` 中每个词条的 `note` 作为 `reason`，`alternatives` 作为替代表达。
- `AI_AGENT_REWRITE`：
  - 输入原文、matches、annotations、目标语言和改写目标。
  - 输出 `RewriteResponse` JSON。
  - FastGPT 形式调用时，服务端将上述内容打包为 JSON 字符串放入 `messages[0].content`。
  - 推荐 workflow 返回标准 `RewriteResponse` JSON。
  - 若当前 workflow 返回 `{ "ok": true, "rewrittenText": "...", "changeSummary": "文本摘要", "remainingRisk": "无" }`，服务端会转换为前端需要的 `changeSummary` 数组和 `remainingRisk` 对象。
  - 若当前 workflow 返回纯文本或 `{ "content": "优化稿" }`，服务端会将 content 作为 `rewrittenText` 展示，并用第一步批注生成保守 `changeSummary`。
  - 目标是在保留原意的前提下降低审核风险。
  - 必须整合原文、命中词和批注建议后输出完整优化稿。
  - `changeSummary` 必须由 AI 返回，用于展示相对原文的主要调整点；前端不猜测调整点。
  - 未配置时，一键改写返回错误，不使用代码 fallback。
- `AI_AGENT_TRADITIONAL`：
  - 当前预留。
  - 后续用于繁体输入识别、简繁转换和繁体优化稿输出。

## API JSON 契约
检测接口：`POST /api/quality/check`

请求：
```json
{
  "platform": "xiaohongshu",
  "text": "待检测文案",
  "enabledLexicons": ["general", "sensitive", "xiaohongshu"],
  "languagePreference": "simplified"
}
```

响应：
```json
{
  "ok": true,
  "originalText": "待检测文案",
  "summary": {
    "totalChars": 120,
    "violationCount": 3,
    "sensitiveCount": 1,
    "riskLevel": "medium"
  },
  "matches": [
    {
      "id": "match_001",
      "term": "违禁词",
      "category": "sensitive",
      "severity": "high",
      "start": 12,
      "end": 15,
      "source": "local_lexicon"
    }
  ],
  "annotations": [
    {
      "matchId": "match_001",
      "title": "表达存在平台风险",
      "reason": "该词可能触发内容审核或限流。",
      "suggestion": "建议替换为更中性的表达。",
      "alternatives": ["替代表达A", "替代表达B"]
    }
  ]
}
```

统计来源说明：
- 主链路中，`annotations` 来自 `AI_AGENT_CHECK` 的 JSON，`matches` 和 `summary` 由服务端基于已定位的 `matchKeywords` 生成。
- 服务端会重新计算主链路 `summary`，以已校验的 `matches` 为准。
- fallback 链路中，`summary.totalChars`、`summary.violationCount`、`summary.sensitiveCount`、`summary.riskLevel` 由服务端本地词库检测计算。
- fallback 链路中，`matches` 由服务端本地词库检测生成，包含高亮所需 offset。
- fallback 链路中，`annotations` 来自 `AI_AGENT_REVIEW`；未配置 AI 时使用本地 fallback。
- 前端“全文 / 违禁词 / 敏感词”统计栏只读取 `summary`，不是直接读取 AI 批注结果；该统计栏展示在检测结果标题和“一键改写”按钮下方。

FastGPT 检测接口：`AI_AGENT_CHECK`

请求：
```json
{
  "chatId": "uuid",
  "stream": false,
  "detail": false,
  "responseChatItemId": "uuid",
  "variables": {
    "platform": "xiaohongshu",
    "languagePreference": "traditional",
    "enabledLexicons": "general,sensitive,xiaohongshu"
  },
  "messages": [
    {
      "role": "user",
      "content": "待检测原文"
    }
  ]
}
```

响应中 `choices[0].message.content` 必须是检测 JSON 字符串。当前 workflow 返回批注数组：
```json
{
  "id": "chatcmpl_xxx",
  "model": "",
  "usage": {
    "prompt_tokens": 1,
    "completion_tokens": 1,
    "total_tokens": 1
  },
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "[{\"matchId\":\"match_001\",\"matchKeywords\":\"保證最有效\",\"title\":\"高风险表达\",\"reason\":\"该词属于确定性效果承诺。\",\"suggestion\":\"建议弱化表达。\",\"alternatives\":[\"帮助提升\",\"有机会改善\"]}]"
      },
      "finish_reason": "stop",
      "index": 0
    }
  ]
}
```

质检批注 AI 返回：`AI_AGENT_REVIEW`

请求上下文由服务端组织，核心输入包含：
```json
{
  "platform": "xiaohongshu",
  "localResult": {
    "ok": true,
    "originalText": "这款产品保证最有效，全网最低。",
    "summary": {
      "totalChars": 16,
      "violationCount": 9,
      "sensitiveCount": 3,
      "riskLevel": "high"
    },
    "matches": [
      {
        "id": "match_001",
        "term": "保证",
        "category": "general",
        "severity": "high",
        "start": 4,
        "end": 6,
        "source": "local_lexicon"
      },
      {
        "id": "match_002",
        "term": "最有效",
        "category": "sensitive",
        "severity": "high",
        "start": 6,
        "end": 9,
        "source": "local_lexicon"
      }
    ],
    "annotations": []
  }
}
```

AI 必须只返回：
```json
{
  "ok": true,
  "annotations": [
    {
      "matchId": "match_001",
      "title": "高风险表达",
      "reason": "该词属于确定性效果承诺，容易被平台判定为不可验证表述。",
      "suggestion": "建议弱化为辅助、倾向性或体验型表达，避免保证结果。",
      "alternatives": ["帮助提升", "有机会改善", "尽量支持"]
    },
    {
      "matchId": "match_002",
      "title": "高风险表达",
      "reason": "极限功效表达风险较高，缺少证明时不建议直接使用。",
      "suggestion": "建议改为适用场景或反馈描述，避免最高级功效承诺。",
      "alternatives": ["较有效", "适合部分场景", "反馈较好"]
    }
  ]
}
```

中低风险示例：
```json
{
  "ok": true,
  "annotations": [
    {
      "matchId": "match_004",
      "title": "低风险表达",
      "reason": "该词偏种草语气，风险较低，但在强推荐场景中可能显得过度。",
      "suggestion": "建议按实际体验弱化推荐强度。",
      "alternatives": ["可以重点看看", "适合按需选择"]
    },
    {
      "matchId": "match_005",
      "title": "中风险表达",
      "reason": "该词表达较绝对，可能被理解为不可验证的结论。",
      "suggestion": "建议改成更相对、更可验证的表述。",
      "alternatives": ["比较", "相对", "更容易"]
    }
  ]
}
```

推荐给 `AI_AGENT_REVIEW` 的系统提示词：
```text
你是内容平台文案质检批注 agent，负责为小红书和公众号文案中的风险词生成文档批注式建议。

硬性要求：
1. 只返回 JSON，不要返回 Markdown、解释、代码块或多余文本。
2. 返回格式必须是：
{
  "ok": true,
  "annotations": [
    {
      "matchId": "match_001",
      "title": "高风险表达",
      "reason": "风险原因",
      "suggestion": "修改建议",
      "alternatives": ["替代表达1", "替代表达2"]
    }
  ]
}
3. annotations 中的 matchId 必须来自输入 localResult.matches，不得新增不存在的 matchId。
4. 不要返回 originalText、summary、matches、start、end、source。
5. 不要返回“批注 1 / 批注 2 / 批注 3”，前端会根据数组顺序自动显示编号。
6. title 只能使用“高风险表达”“中风险表达”“低风险表达”。
7. alternatives 返回 2 到 4 个短替代表达，不能为空数组。
8. reason 说明为什么有平台审核或内容表达风险。
9. suggestion 说明如何降低风险，语气要专业、简洁、可执行。
```

改写接口：`POST /api/quality/rewrite`

请求：
```json
{
  "platform": "xiaohongshu",
  "originalText": "原始文案",
  "matches": [],
  "annotations": [],
  "targetLanguage": "simplified",
  "rewriteGoal": "reduce_risk_keep_meaning"
}
```

一键改写显示逻辑：
- 页面初始不显示优化稿区域。
- 用户点击“一键改写”按钮后，请求 `/api/quality/rewrite`。
- 请求成功后才在页面下方显示优化稿、剩余风险和 change summary。
- 改写结果不覆盖原检测结果，右侧高亮与批注继续保留。
- 如果未配置 `AI_AGENT_REWRITE_*`，接口返回错误，页面展示错误提示，不展示优化稿区域。
- 一键改写必须使用 AI；服务端不得通过本地词库直接替换来冒充改写结果。

推荐给 `AI_AGENT_REWRITE` 的系统提示词：
```text
你是小红书和公众号文案改写 agent。你必须根据原文、风险词 matches、批注 annotations 和目标语言 targetLanguage，输出一篇完整优化稿。

硬性要求：
1. 只返回 JSON，不要返回 Markdown、解释、代码块或多余文本。
2. rewrittenText 必须是完整文案，不是片段。
3. 必须尽量保留原意、语气和信息点，同时降低平台审核风险。
4. 必须参考 annotations 中的 suggestion 和 alternatives，但不要求逐字照抄。
5. changeSummary 必须列出相对原文的主要调整点，before 来自原文或原风险表达，after 来自 rewrittenText 或新表达。
6. targetLanguage 为 simplified 时输出简体；为 traditional 时输出繁体。
7. remainingRisk.riskLevel 只能是 low、medium、high。
8. 只允许返回如下 JSON：
{
  "ok": true,
  "rewrittenText": "完整优化稿",
  "changeSummary": [
    {
      "before": "原表达",
      "after": "新表达",
      "reason": "调整原因"
    }
  ],
  "remainingRisk": {
    "riskLevel": "low",
    "notes": []
  }
}
```

响应：
```json
{
  "ok": true,
  "rewrittenText": "改写后的简体优化稿",
  "changeSummary": [
    {
      "before": "原表达",
      "after": "新表达",
      "reason": "降低审核风险"
    }
  ],
  "remainingRisk": {
    "riskLevel": "low",
    "notes": []
  }
}
```

错误响应：
```json
{
  "ok": false,
  "error": "可读错误信息",
  "localResult": {}
}
```

## 验收标准
- 输入小红书文案并点击检测后，右侧展示原文、违禁词高亮和批注卡。
- 输入公众号文案时，公众号词库生效，小红书专属词不应默认命中。
- 未配置 `AI_AGENT_REVIEW` 时，系统使用本地 fallback 批注建议。
- 未配置 `AI_AGENT_REWRITE` 时，一键改写返回可读错误，不生成本地替换稿。
- 配置 AI agent 后，AI 非 JSON、缺字段或非法字段必须被服务端拦截。
- 一键改写不清空原检测结果，改写稿和 change summary 单独展示。
- 921px 宽度下保持左右双栏；更窄屏幕允许切换为上下布局。
- 输出语言控件不得退回原生 `select`。

## 运行环境说明
- 当前实现使用 Next.js 14 最新补丁版，项目 Node 版本要求为 `>=18.18.0 <20.9.0`。
- Windows 服务器建议使用 Node.js 18 LTS；不建议使用 Node 24，可能导致 PM2 或 Next.js standalone 兼容问题。
- `npm audit` 建议升级到 Next.js 16 修复生产依赖告警；该版本要求 Node >=20.9.0。
- 当部署环境升级到 Node >=20.9.0 后，应同步升级 Next.js、重新运行测试与构建，并更新本规格。

## 打包与部署
- 构建配置：`next.config.mjs`，使用 `output: "standalone"`。
- 生产包关闭 Next.js 图片优化：`images.unoptimized: true`，避免 Windows standalone 运行时额外依赖 `sharp`。
- 本地开发：
```bash
npm install
npm run dev
```
- 质量验证：
```bash
npm test
npm run build
```
- standalone 打包内容：
  - `.next/standalone`
  - `.next/static`
  - `public`
  - `AGENTS.md`
  - `specs/ai-quality-check.md`
  - `deploy/windows/README.md`
  - `deploy/windows/start-windows.cmd`
  - `deploy/windows/.env.cmd.example`
  - `package.json`
  - `package-lock.json`
- 本地 `release/` 目录仅用于临时放置 zip、tar.gz 或打包目录，必须保持 git 忽略。
- 部署包启动方式：
```bash
node server.js
```
- 部署前需要按实际 AI 服务配置环境变量：
```bash
AI_AGENT_REVIEW_BASE_URL=
AI_AGENT_REVIEW_API_KEY=
AI_AGENT_REVIEW_MODEL=
AI_AGENT_CHECK_BASE_URL=
AI_AGENT_CHECK_API_KEY=
AI_AGENT_CHECK_TIMEOUT_MS=
AI_AGENT_REWRITE_BASE_URL=
AI_AGENT_REWRITE_API_KEY=
AI_AGENT_REWRITE_MODEL= # FastGPT workflow 可不填；OpenAI-compatible 调用需配置
AI_AGENT_TRADITIONAL_BASE_URL=
AI_AGENT_TRADITIONAL_API_KEY=
AI_AGENT_TRADITIONAL_MODEL=
```
- 上线风险：
  - 未配置或调用失败的 `AI_AGENT_CHECK_*` 不影响检测基础可用性，会使用本地词库 fallback。
  - 未配置 `AI_AGENT_REVIEW_*` 不影响本地 fallback 批注基础能力，会使用本地词库 fallback。
  - 未配置 `AI_AGENT_REWRITE_*` 会导致一键改写返回错误，这是预期行为。
  - FastGPT 改写 workflow 需要能从 `messages[0].content` 解析原文、第一步 AI 返回的 `matches` 与 `annotations`。
  - 改写 workflow 最好返回标准 `RewriteResponse` JSON；也兼容 `{ "ok": true, "rewrittenText": "...", "changeSummary": "文本摘要", "remainingRisk": "无" }`。
  - 纯文本或 `{ "content": "优化稿" }` 返回可用于测试，但剩余风险会被系统保守标记为 `medium`。
  - 如果部署平台不是 Vercel，需要确认 Node 版本满足 `package.json` 的 `engines`。
  - Windows standalone 若未关闭图片优化会报缺少 `sharp`；当前已在 `next.config.mjs` 配置 `images.unoptimized: true`。
  - PM2 启动前需要先 `call .env.cmd`，更新环境变量后使用 `pm2 restart qualitycheck-ai --update-env`。
