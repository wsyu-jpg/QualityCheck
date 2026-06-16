# QualityCheck AI

小红书与公众号文案 AI 质检工作台。当前版本面向内地通用简体发布场景，支持 AI 风险检测、原文高亮、批注建议和一键改写。

## 当前能力

- 平台选择：小红书、公众号。
- 词库选择：通用词库、敏感词、小红书词、公众号词、广告词、医疗词。
- AI 质检：优先调用 `AI_AGENT_CHECK`，根据返回的 `matchKeywords` 定位原文并生成高亮。
- 本地 fallback：AI 检测失败时回落 `data/lexicons.json` 本地词库。
- 批注建议：展示风险标题、命中词、判断理由、改进建议和替代表达。
- 一键改写：调用 `AI_AGENT_REWRITE`，输入原文、命中结果和质检建议，输出完整优化稿。
- 简体输出：当前正式开放“简体优化稿”。
- 繁体入口：保留入口，但点击“繁体优化稿”只提示“繁体优化暂未支持”，不会切换输出语言。
- Loading 锁定：检测或改写期间禁用输入、清空、保存、平台、词库、语言和其他主操作。

## 技术栈

- Next.js 14 App Router
- React 18
- TypeScript
- Vitest
- Next.js standalone 部署

Node.js 版本要求：

```text
>=18.18.0 <20.9.0
```

生产包已关闭 Next.js 图片优化：

```js
images: {
  unoptimized: true
}
```

这样 Windows standalone 运行时不需要额外安装 `sharp`。

## 项目结构

```text
app/
  api/quality/check/route.ts      质检接口
  api/quality/rewrite/route.ts    改写接口
  globals.css                     全局样式
  layout.tsx                      页面元信息
  page.tsx                        首页入口
components/
  quality-workbench.tsx           主工作台 UI
data/
  lexicons.json                   本地 fallback 词库
lib/quality/
  ai.ts                           FastGPT / OpenAI-compatible 调用与兼容转换
  lexicon.ts                      本地词库检测和 fallback 批注
  types.ts                        请求、响应、领域类型
  validators.ts                   请求和 AI JSON 校验
tests/
  ai.test.ts                      AI 调用与兼容格式测试
  lexicon.test.ts                 本地词库检测测试
  validators.test.ts              JSON 契约测试
specs/
  ai-quality-check.md             产品、接口、部署规格
deploy/windows/
  README.md                       Windows 部署说明
  start-windows.cmd               Windows 相对路径启动脚本
  .env.cmd.example                Windows 环境变量示例
AGENTS.md                         项目协作规范
next.config.mjs                   Next standalone 配置
```

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

当前本地调试常用地址：

```text
http://127.0.0.1:3001
```

如果需要指定端口：

```bash
npx next dev -H 127.0.0.1 -p 3001
```

## 环境变量

质检 AI：

```bash
AI_AGENT_CHECK_BASE_URL=https://aigpt.centanet.com
AI_AGENT_CHECK_API_KEY=
AI_AGENT_CHECK_TIMEOUT_MS=15000
```

改写 AI：

```bash
AI_AGENT_REWRITE_BASE_URL=https://aigpt.centanet.com
AI_AGENT_REWRITE_API_KEY=
AI_AGENT_REWRITE_TIMEOUT_MS=15000
```

本地 fallback 批注增强，可选：

```bash
AI_AGENT_REVIEW_BASE_URL=
AI_AGENT_REVIEW_API_KEY=
AI_AGENT_REVIEW_MODEL=
```

繁体处理预留：

```bash
AI_AGENT_TRADITIONAL_BASE_URL=
AI_AGENT_TRADITIONAL_API_KEY=
AI_AGENT_TRADITIONAL_MODEL=
```

## AI 返回契约

### 质检 AI

`AI_AGENT_CHECK` 使用 FastGPT `/api/v1/chat/completions`。

请求时：

- `messages[0].content` 只放用户原文。
- `variables` 附带平台、语言偏好和启用词库。

当前 workflow 推荐返回数组：

```json
[
  {
    "matchId": "match_001",
    "matchKeywords": "保證最有效",
    "title": "高风险表达",
    "reason": "该词属于确定性效果承诺。",
    "suggestion": "建议弱化表达。",
    "alternatives": ["帮助提升", "有机会改善"]
  }
]
```

服务端会用 `matchKeywords` 回查原文，生成前端高亮需要的 `matches.start` 和 `matches.end`。

### 改写 AI

`AI_AGENT_REWRITE` 使用 FastGPT `/api/v1/chat/completions`。

请求时，服务端把以下内容打包为 JSON 字符串放入 `messages[0].content`：

- `platform`
- `originalText`
- `matches`
- `annotations`
- `targetLanguage`
- `rewriteGoal`

推荐返回标准结构：

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

当前服务端也兼容：

```json
{
  "ok": true,
  "rewrittenText": "完整优化稿",
  "changeSummary": "文本摘要",
  "remainingRisk": "无"
}
```

## 验证

提交或打包前执行：

```bash
npm test
npm run build
```

当前测试覆盖：

- AI FastGPT 返回格式兼容
- 改写 JSON / 纯文本 / content 字段兼容
- 本地词库检测和 offset
- 请求与响应 validator

## Windows 发布

Windows 服务器部署使用 `standalone` 包，不是传统纯静态 `dist`。

原因：

- 本项目包含 `/api/quality/check`
- 本项目包含 `/api/quality/rewrite`
- AI token、fallback 词库和服务端 JSON 校验都依赖 Node 服务

部署说明见：

```text
deploy/windows/README.md
```

服务器当前已验证端口：

```text
http://10.4.18.23:85/
```

如使用 PM2，推荐启动流程：

```cmd
cd /d E:\jtaitool\2026\qualitycheck-ai-windows-20260615
call .env.cmd
pm2 start server.js --name qualitycheck-ai
pm2 save
```

注意：服务器 Node.js 建议使用 18 LTS，不建议使用 Node 24。

## Git 管理

- `release/` 已加入 `.gitignore`，打包产物不纳入仓库。
- `deploy/windows/` 中的部署脚本和说明纳入仓库。
- 每次修改 UI、AI 契约、词库、测试策略、部署方式时，需要同步更新 `specs/ai-quality-check.md`。
- 每次修改协作流程或 agent 配置要求时，需要同步更新 `AGENTS.md`。
