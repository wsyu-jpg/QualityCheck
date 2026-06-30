# QualityCheck AI

小红书与公众号文案 AI 质检工作台。当前版本面向内地通用简体发布场景，支持 AI 风险检测、原文高亮、批注建议、一键改写和复制优化稿。

顶部品牌展示为 `QualityCheck / AI 敏感詞檢測`。

## 当前能力

- 平台选择：小红书、公众号。
- 词库设置：默认收起，仅显示已启用数量；用户点击后展开通用词库、敏感词、小红书词、公众号词、广告词、医疗词。
- AI 质检：前端直接请求公司统一 AI 代理，使用 `serve-type: type_c`。
- 本地 fallback：AI 质检失败时回落 `data/lexicons.json` 本地词库。
- 一键改写：前端直接请求公司统一 AI 代理，使用 `serve-type: type_d`。
- 复制文案：一键改写成功后，可复制最终优化稿正文。
- 简体输出：当前正式开放“简体优化稿”。
- 繁体入口：保留入口，但点击“繁体优化稿”只提示“繁体优化暂未支持”，不会切换输出语言。
- Loading 锁定：检测或改写期间禁用输入、清空、平台、词库、语言和其他主操作。

## 技术栈

- Next.js 14 App Router
- React 18
- TypeScript
- Vitest
- Next.js static export

Node.js 版本要求：

```text
>=18.18.0 <20.9.0
```

## 项目结构

```text
app/
  globals.css                     全局样式
  layout.tsx                      页面元信息
  page.tsx                        首页入口
components/
  quality-workbench.tsx           主工作台 UI
data/
  lexicons.json                   本地 fallback 词库
lib/quality/
  proxy-ai.ts                     smartai AI 代理调用与兼容转换
  lexicon.ts                      本地词库检测和 fallback 批注
  types.ts                        请求、响应、领域类型
  validators.ts                   请求和 AI JSON 校验
tests/
  proxy-ai.test.ts                AI 代理调用与兼容格式测试
  lexicon.test.ts                 本地词库检测测试
  validators.test.ts              JSON 契约测试
specs/
  ai-quality-check.md             产品、接口、部署规格
deploy/windows/
  README.md                       Windows 静态发布说明
AGENTS.md                         项目协作规范
next.config.mjs                   Next static export 配置
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

## AI 代理接口

统一请求地址：

```text
https://smartai.centanet.com/ReelEstate/api/ai-proxy
```

统一 headers：

```http
Content-Type: application/json
serve-host: aigpt.centanet.com
```

功能类型：

| 功能 | header | value |
| --- | --- | --- |
| AI 质检 | `serve-type` | `type_c` |
| AI 重写 | `serve-type` | `type_d` |

质检请求体保持 FastGPT chat/completions 形式，`messages[0].content` 只放原文：

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

改写请求同样保持 FastGPT chat/completions 形式，`messages[0].content` 放 JSON 字符串，包含：

- `platform`
- `originalText`
- `matches`
- `annotations`
- `targetLanguage`
- `rewriteGoal`

响应从 `choices[0].message.content` 解析 JSON。当前兼容：

- 质检批注数组，包含 `matchKeywords`、`riskLevel`、`title`、`reason`、`suggestion`、`alternatives`。
- 质检无命中空数组：`[]`。
- 完整 `CheckResponse`。
- 标准 `RewriteResponse`。
- `{ ok, rewrittenText, changeSummary: string, remainingRisk: string }`。
- 纯文本或 `{ content }` 改写结果。

质检批注数组中，`riskLevel` 固定使用 `high`、`medium`、`low`，前端会据此生成高/中/低风险高亮与批注样式；旧 workflow 未返回 `riskLevel` 时，会从 `title` 兜底识别风险等级。

## 验证

提交或打包前执行：

```bash
npm test
npm run build
```

当前测试覆盖：

- smartai AI 代理请求 headers 与 body
- 质检 JSON / 批注数组兼容
- 质检 `riskLevel` 高/中/低风险解析与空数组无命中
- 改写 JSON / 纯文本 / content 字段兼容
- 本地词库 fallback 和 offset
- 请求与响应 validator

## 静态发布

本项目已改为静态前端发布，不再需要 Node 服务、PM2、端口或 FastGPT token 环境变量。

正式环境建议使用路径：

```text
https://smartai.centanet.com/2026/AIqualityCheck/
```

构建正式环境：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck npm run build
```

Next.js 会输出 `out/`，打包时将 `out/` 内容复制到发布目录根目录，并压缩为：

```text
release/AIqualityCheck.zip
```

服务器目录建议：

```text
E:\jtaitool\2026\AIqualityCheck
```

发布步骤：

1. 上传 `AIqualityCheck.zip` 到服务器。
2. 解压到 `E:\jtaitool\2026`。
3. 确认存在 `E:\jtaitool\2026\AIqualityCheck\index.html`。
4. 访问 `https://smartai.centanet.com/2026/AIqualityCheck/`。
5. 验证质检、改写、复制文案。

测试环境可使用独立路径重新构建：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck-test npm run build
```

对应访问：

```text
https://smartai.centanet.com/2026/AIqualityCheck-test/
```

## Git 管理

- 当前项目已经是 Git 工程，不需要重新 `git init`。
- `release/` 已加入 `.gitignore`，打包产物不纳入仓库。
- 每次修改 UI、AI 契约、词库、测试策略、部署方式时，需要同步更新 `specs/ai-quality-check.md`。
- 每次修改协作流程或 agent 配置要求时，需要同步更新 `AGENTS.md`。
