# AI 文案质检功能规格

## 最终版状态
- 当前设计已确认作为第一版 UI：保留 `QualityCheck` icon，顶部副标题显示 `AI 敏感詞檢測`，使用简约后台工具风格。
- 顶部品牌区、平台切换、词库选择、左右双栏工作台、自定义输出语言下拉、批注卡和优化稿区域均属于第一版范围。
- 项目已从 Next.js 服务端接口改为静态前端架构，AI 能力通过公司统一代理提供。
- 统一 AI 代理地址：`https://smartai.centanet.com/ReelEstate/api/ai-proxy`。
- AI 质检使用 `serve-type: type_c`；AI 重写使用 `serve-type: type_d`。
- 当前仅开放简体优化稿；繁体入口只显示“繁体优化暂未支持”弹窗。
- 本规格、`AGENTS.md` 与代码必须同步维护，后续调整 UI、AI 契约、词库或打包方式都需要更新文档。

## 项目结构
- `components/quality-workbench.tsx`：主工作台 UI、loading 锁定、语言弹窗、结果展示。
- `lib/quality/proxy-ai.ts`：smartai AI 代理调用、AI 返回格式兼容、offset 修正。
- `lib/quality/lexicon.ts`：浏览器端本地词库检测、summary 计算、fallback 批注。
- `lib/quality/validators.ts`：AI 检测、AI 改写 JSON 契约校验。
- `lib/quality/types.ts`：平台、风险、命中、批注、改写等类型定义。
- `data/lexicons.json`：本地 fallback 词库。
- `tests/`：AI 代理、词库和 validator 单元测试。
- `deploy/windows/`：Windows 静态发布说明。
- `specs/ai-quality-check.md`：产品、接口与发布规格。
- `AGENTS.md`：项目协作规范。

## 产品流程
- 用户选择平台：小红书或公众号。
- 用户可展开“词库设置”调整词库，并输入文案，最多 1500 字。
- 点击“立即检测”后，前端请求 smartai AI 代理，`serve-type` 使用 `type_c`。
- 质检请求的 `messages[0].content` 只放原文；平台、语言和启用词库放在 `variables`。
- AI 返回检测 JSON 后，前端优先按 `matchKeywords` 在原文中定位并生成 `matches`，用于高亮与批注展示。
- AI 批注数组返回 `riskLevel` 时，前端按 `high`、`medium`、`low` 生成高/中/低风险高亮和批注样式。
- AI 请求失败、返回非 JSON、字段非法或无法定位 `matchKeywords` 时，前端回落本地词库检测。
- 右侧展示原文，高亮风险表达，并显示类似文档批注的建议卡片。
- 用户点击“一键改写”后，前端请求 smartai AI 代理，`serve-type` 使用 `type_d`。
- 一键改写成功后，优化稿区域提供“复制文案”按钮，只复制最终 `rewrittenText`。
- 一键改写必须使用 AI 代理，不使用本地词库替换模拟改写。
- 繁体入口保留，当前点击后弹出“繁体优化暂未支持”。

## 产品设计规范
- 首屏为质检工作台，不做营销页。
- 顶部显示应用 logo、产品名 `QualityCheck` 和副标题 `AI 敏感詞檢測`。
- 输出语言控件使用自定义下拉菜单，不使用原生 `select`。
- 当前版本点击“繁体优化稿”不切换输出语言，弹出“繁体优化暂未支持”提示。
- 不展示“累计过滤文章篇数”等运营数字模块。
- 不展示“保存草稿”按钮。
- 词库设置默认折叠，仅展示“词库设置”和已启用数量；用户点击后展开具体词库选项。
- 桌面端采用左右双栏；小屏改为上下布局。
- 点击“立即检测”或“一键改写”后，检测/改写完成前禁用其他输入、清空、平台切换、词库切换、语言切换和另一个主操作按钮。
- 右侧“全文 / 违禁词 / 敏感词”统计栏固定展示在检测结果标题与“一键改写”按钮下方。
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
- 重叠命中只保留较长、较高风险的命中。
- 主检测链路优先依赖 AI，以提升繁体、近义表达和上下文风险识别能力。
- 本地词库作为浏览器端 fallback 保留，适合 AI 请求失败、代理不可用或返回格式异常的场景。

## AI 代理接口

统一请求：

```http
POST https://smartai.centanet.com/ReelEstate/api/ai-proxy
Content-Type: application/json
serve-host: aigpt.centanet.com
```

功能类型：

| 功能 | header | value |
| --- | --- | --- |
| AI 质检 | `serve-type` | `type_c` |
| AI 重写 | `serve-type` | `type_d` |

### AI 质检

请求 body：

```json
{
  "chatId": "uuid",
  "stream": false,
  "detail": false,
  "responseChatItemId": "uuid",
  "variables": {
    "platform": "xiaohongshu",
    "languagePreference": "simplified",
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

`variables.platform` 固定作为 workflow 平台判断字段：

| 发布平台 | key | value |
| --- | --- | --- |
| 小红书 | `platform` | `xiaohongshu` |
| 公众号 | `platform` | `wechat` |

响应中 `choices[0].message.content` 必须是 JSON 字符串。当前 workflow 推荐返回批注数组：

```json
[
  {
    "matchId": "match_001",
    "matchKeywords": "保證最有效",
    "riskLevel": "high",
    "title": "高風險表達",
    "reason": "屬於確定性效果承諾。",
    "suggestion": "建議弱化表達。",
    "alternatives": ["帮助提升", "有机会改善"]
  }
]
```

无命中时推荐返回空数组：

```json
[]
```

批注数组字段约束：

- `matchKeywords`：必须是原文中实际出现的命中内容，保留原文字形。
- `riskLevel`：固定为 `high`、`medium`、`low`，用于前端高亮与批注样式。
- `title`：建议与风险等级对应为 `高風險表達`、`中風險表達`、`低風險表達`。
- `reason`、`suggestion`：建议使用繁体中文，保持短句。
- `alternatives`：建议使用内地通用简体中文。

也兼容完整 `CheckResponse`，前端会重新校验 offset 并重算 `summary`。旧 workflow 未返回 `riskLevel` 时，前端会从 `title` 兜底识别风险等级。

### AI 重写

请求 body 仍是 FastGPT chat/completions 形式，`messages[0].content` 放 JSON 字符串：

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

推荐返回标准 `RewriteResponse`：

```json
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

同时兼容：

- `{ "ok": true, "rewrittenText": "...", "changeSummary": "文本摘要", "remainingRisk": "无" }`
- `{ "content": "优化稿" }`
- 纯文本优化稿

## 验收标准
- 输入小红书文案并点击检测后，右侧展示原文、高亮和批注卡。
- 输入公众号文案时，公众号词库生效，小红书专属词不应默认命中。
- 页面初始状态下词库选项默认收起，点击“词库设置”后展开并可勾选。
- AI 质检代理失败时，系统使用本地 fallback 批注建议。
- AI 重写代理失败时，一键改写返回可读错误，不生成本地替换稿。
- AI 非 JSON、缺字段或非法字段必须被前端拦截或进入 fallback。
- 一键改写不清空原检测结果，改写稿和 change summary 单独展示。
- 一键改写成功后，“复制文案”可以复制完整优化稿正文。
- 921px 宽度下保持左右双栏；更窄屏幕允许切换为上下布局。
- 输出语言控件不得退回原生 `select`。

## 打包与部署
- 构建配置：`next.config.mjs`，使用 `output: "export"`。
- 生产包关闭 Next.js 图片优化：`images.unoptimized: true`。
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

- 正式构建：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck npm run build
```

- Next.js 静态产物输出到 `out/`。
- 发布包命名为 `AIqualityCheck.zip`，包内目录为 `AIqualityCheck/`，静态文件直接放在该目录根部。
- 服务器建议目录：

```text
E:\jtaitool\2026\AIqualityCheck
```

- 访问地址：

```text
https://smartai.centanet.com/2026/AIqualityCheck/
```

- 测试环境可使用：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck-test npm run build
```

对应访问：

```text
https://smartai.centanet.com/2026/AIqualityCheck-test/
```

- 本地 `release/` 目录仅用于临时放置 zip 或打包目录，必须保持 git 忽略。
- 上线风险：
  - `smartai.centanet.com` 必须能访问静态目录。
  - 浏览器必须允许请求 `https://smartai.centanet.com/ReelEstate/api/ai-proxy`，否则会触发质检 fallback，重写会失败。
  - AI workflow 仍需保持 `choices[0].message.content` 返回 JSON 或可兼容文本。
