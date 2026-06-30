# QualityCheck AI Windows 静态发布说明

## 1. 发布方式说明

当前项目已改为纯静态前端发布，不再需要在服务器上运行 Node 服务。

原因：
- AI 质检与 AI 重写统一请求 `https://smartai.centanet.com/ReelEstate/api/ai-proxy`。
- FastGPT token 与 workflow 调用由统一服务端代理处理，前端不保存 token。
- 本地词库 fallback 已打包到前端静态资源中。

## 2. 目录与访问地址

正式环境建议目录：

```text
E:\jtaitool\2026\AIqualityCheck
```

正式访问地址：

```text
https://smartai.centanet.com/2026/AIqualityCheck/
```

未来测试环境建议目录：

```text
E:\jtaitool\2026\AIqualityCheck-test
```

测试访问地址：

```text
https://smartai.centanet.com/2026/AIqualityCheck-test/
```

## 3. 本地构建

正式环境构建：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck npm run build
```

测试环境构建：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck-test npm run build
```

Next.js 会生成 `out/` 静态目录。打包时将 `out/` 内容复制到 `release/AIqualityCheck/` 根目录，再压缩成：

```text
release/AIqualityCheck.zip
```

## 4. 服务器操作

1. 上传 `AIqualityCheck.zip` 到服务器。
2. 解压到：

```text
E:\jtaitool\2026
```

3. 确认文件结构类似：

```text
E:\jtaitool\2026\AIqualityCheck
  ├─ index.html
  ├─ _next
  └─ qualitycheck-icon.png
```

4. 浏览器访问：

```text
https://smartai.centanet.com/2026/AIqualityCheck/
```

## 5. 验证项目

- 页面可以正常打开。
- 静态资源 `_next/...` 没有 404。
- 点击“立即检测”后可展示高亮和批注。
- AI 质检失败时，本地词库 fallback 可用。
- 点击“一键改写”后可展示优化稿。
- 点击“复制文案”后可复制优化稿正文。

## 6. 常见问题

### 页面空白或样式丢失

检查构建时 `NEXT_PUBLIC_BASE_PATH` 是否与线上路径一致。

正式环境必须使用：

```bash
NEXT_PUBLIC_BASE_PATH=/2026/AIqualityCheck
```

如果 Network 里 `_next/...` 请求路径仍带 `/dist/`，说明使用了旧包或旧构建参数，需要重新按上述命令构建并上传。

### AI 检测或改写失败

检查浏览器 Network：

- 请求地址是否为 `https://smartai.centanet.com/ReelEstate/api/ai-proxy`
- 质检请求 header 是否包含 `serve-type: type_c`
- 改写请求 header 是否包含 `serve-type: type_d`
- header 是否包含 `serve-host: aigpt.centanet.com`
- 是否存在 CORS 或代理错误

### 只有质检 fallback 可用，改写不可用

这是预期保护逻辑：

- 质检失败时可以回落本地词库。
- 一键改写必须调用 AI，不做本地替换模拟。
