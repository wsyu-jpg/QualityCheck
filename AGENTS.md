# QualityCheck AI 文案质检协作规范

## 项目边界
- 本项目第一版是小红书与公众号文案 AI 质检工作台。
- 主要能力包括 AI 风险检测、本地词库 fallback、原文高亮、批注式建议、一键改写、复制优化稿和简体输出。
- 当前仅正式开放“简体优化稿”；“繁体优化稿”入口保留，但点击后只弹出“繁体优化暂未支持”，不切换输出语言。
- 第一版词库使用 `data/lexicons.json`，不接后台管理。
- 当前前端直接调用公司统一 AI 代理 `https://smartai.centanet.com/ReelEstate/api/ai-proxy`。
- `serve-type: type_c` 对应 AI 质检，`serve-type: type_d` 对应 AI 重写。
- AI 质检失败时，前端回落本地词库检测，并在浏览器端生成高亮 `matches`、`summary` 和 fallback 批注。
- 一键改写必须调用 AI 代理，不得使用代码直接替换作为正式改写结果。

## 必须同步维护的文档
- 修改 UI、AI 返回格式、词库结构、平台规则、测试策略或发布方式时，必须同步更新 `specs/ai-quality-check.md`。
- 修改协作流程、代理配置方式或 review 要求时，必须同步更新本文件。
- 不允许只改代码不改公共文档。

## AI 代理配置
- 统一请求地址：`https://smartai.centanet.com/ReelEstate/api/ai-proxy`。
- 统一 header：
  - `serve-host: aigpt.centanet.com`
  - `serve-type: type_c`：AI 质检
  - `serve-type: type_d`：AI 重写
- 前端不保存、不提交 FastGPT token。
- 质检请求保持 FastGPT chat/completions 形式，`messages[0].content` 只放原文。
- 改写请求保持 FastGPT chat/completions 形式，`messages[0].content` 打包原文、`matches`、`annotations`、目标语言和改写目标。
- 响应从 `choices[0].message.content` 解析。
- 如果后续代理 URL、`serve-host` 或 `serve-type` 调整，必须同步更新代码、README 和规格文档。

## JSON 契约
- AI 质检可返回完整 `CheckResponse`，或返回包含 `matchKeywords`、`riskLevel`、`title`、`reason`、`suggestion`、`alternatives` 的批注数组。
- AI 质检批注数组无命中时必须返回 `[]`，不要返回纯文本提示。
- `riskLevel` 使用固定枚举 `high`、`medium`、`low`，前端据此生成高/中/低风险高亮与批注样式。
- 前端必须校验 AI JSON，不能把未校验的 AI 输出直接展示。
- 前端必须用 `matchKeywords` 回查原文生成高亮 offset。
- 旧 workflow 未返回 `riskLevel` 时，前端可从 `title` 兜底识别高/中/低风险。
- AI 重写推荐返回标准 `RewriteResponse`。
- AI 重写同时兼容 `{ ok, rewrittenText, changeSummary: string, remainingRisk: string }`、纯文本和 `{ content }`，但正式 workflow 应优先返回标准结构。
- 批注序号由前端根据 `annotations` 数组顺序生成，AI 不需要返回“批注 1/2/3”。

## 设计与测试要求
- UI 风格保持简约后台工具风格：白底、浅灰分区、蓝色主按钮、红/橙风险提示、8px 圆角。
- 不新增营销落地页，首屏必须是可操作工作台。
- 检测或改写 loading 期间必须禁用输入、清空、平台切换、词库切换、语言切换和另一个主操作按钮，避免请求期间状态被改乱。
- 词库设置默认折叠，仅展示“词库设置”和已启用数量；用户明确点击后才展开具体词库选项。
- 当前版本不展示“保存草稿”按钮；一键改写成功后展示“复制文案”按钮，复制内容仅为最终优化稿正文。
- 右侧统计栏固定展示在检测结果标题与“一键改写”按钮下方，不放在结果面板底部。
- 修改检测逻辑或 JSON 校验时必须补充单元测试。
- 修改主流程时至少验证：空文本、无命中、多命中、AI 失败 fallback、一键改写和复制文案。

## 打包与交付
- 项目使用 Next.js static export，构建配置在 `next.config.mjs`。
- 生产包关闭 Next.js 图片优化 `images.unoptimized: true`。
- 正式打包前必须运行 `npm test` 和 `npm run build`。
- 正式发布路径建议为 `https://smartai.centanet.com/2026/AIqualityCheck/`。
- 正式构建使用 `NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck npm run build`。
- 交付压缩包命名为 `AIqualityCheck.zip`，包内静态文件应直接位于 `AIqualityCheck/` 根目录。
- Windows 服务器发布为静态目录上传，不需要 Node 服务、PM2、端口或 `.env.cmd`。
- `release/` 是本地打包产物目录，必须保持 git 忽略，不提交 zip、tar.gz 或临时打包目录。
