# QualityCheck AI Windows 部署说明

## 1. 运行方式说明

本项目不是纯静态前端项目，不能只把 `dist` 放到服务器目录后直接访问。

原因：
- 页面本身是前端工作台。
- `/api/quality/check` 和 `/api/quality/rewrite` 是 Next.js 服务端接口。
- 质检 AI、改写 AI、fallback 词库都需要 Node 服务运行。

因此本包使用 Next.js `standalone` 输出。可以理解为适合部署的服务端版本，不依赖项目源码目录，也不要求服务器路径固定。

生产包已关闭 Next.js 图片优化，静态图片不依赖 `sharp`，Windows 服务器不需要额外安装 `sharp`。

## 2. Windows 服务器准备

服务器需要安装 Node.js：
- 推荐版本：Node.js 18.18.x 到 20.8.x
- 当前项目 `package.json` 要求：`>=18.18.0 <20.9.0`

安装后在服务器命令行确认：

```cmd
node -v
```

## 3. 解压部署包

将 zip 包解压到任意目录即可，例如：

```text
QualityCheck-AI\
```

不要依赖固定盘符或固定绝对路径，本包脚本均使用相对路径。

## 4. 配置 AI 环境变量

复制示例配置：

```cmd
copy .env.cmd.example .env.cmd
```

编辑 `.env.cmd`，填入实际 token。

必须配置：

```cmd
set "AI_AGENT_CHECK_BASE_URL=https://aigpt.centanet.com"
set "AI_AGENT_CHECK_API_KEY=你的质检AI token"
set "AI_AGENT_REWRITE_BASE_URL=https://aigpt.centanet.com"
set "AI_AGENT_REWRITE_API_KEY=你的改写AI token"
```

可选配置：

```cmd
set "PORT=3000"
set "HOSTNAME=0.0.0.0"
set "AI_AGENT_CHECK_TIMEOUT_MS=15000"
set "AI_AGENT_REWRITE_TIMEOUT_MS=15000"
```

说明：
- `PORT` 是服务监听端口。
- `HOSTNAME=0.0.0.0` 表示允许服务器外部访问。
- 如果服务器有防火墙或安全组，需要放行对应端口。

## 5. 启动服务

在解压目录中双击或命令行执行：

```cmd
start-windows.cmd
```

启动后访问：

```text
http://服务器IP:端口
```

如果在服务器本机测试：

```text
http://127.0.0.1:3000
```

## 6. 常见问题

### 页面能打开，但 AI 检测或改写失败

检查 `.env.cmd` 是否配置了：
- `AI_AGENT_CHECK_API_KEY`
- `AI_AGENT_REWRITE_API_KEY`

并确认服务器能访问：

```text
https://aigpt.centanet.com
```

### 外部电脑打不开

检查：
- `HOSTNAME` 是否为 `0.0.0.0`
- `PORT` 是否正确
- Windows 防火墙是否放行该端口
- 云服务器安全组是否放行该端口

### 想后台常驻运行

可以用 Windows 服务管理工具、PM2、NSSM 或服务器已有进程管理工具托管：

```cmd
node server.js
```

托管时工作目录必须是解压后的包根目录。
