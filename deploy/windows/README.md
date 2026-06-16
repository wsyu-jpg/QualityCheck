# QualityCheck AI Windows 部署说明

## 1. 运行方式说明

本项目不是纯静态前端项目，不能只把 `dist` 放到服务器目录后直接访问。

原因：
- 页面本身是前端工作台。
- `/api/quality/check` 和 `/api/quality/rewrite` 是 Next.js 服务端接口。
- 质检 AI、改写 AI、fallback 词库都需要 Node 服务运行。

因此本包使用 Next.js `standalone` 输出。可以理解为适合部署的服务端版本，不依赖项目源码目录，也不要求服务器路径固定。

生产包已关闭 Next.js 图片优化，静态图片不依赖 `sharp`，Windows 服务器不需要额外安装 `sharp`。

当前已验证服务器访问地址：

```text
http://10.4.18.23:85/
```

## 2. Windows 服务器准备

服务器需要安装 Node.js：
- 推荐版本：Node.js 18 LTS
- 当前项目 `package.json` 要求：`>=18.18.0 <20.9.0`
- 不建议使用 Node 24，可能导致 PM2 管道权限异常或 Next.js standalone 兼容问题。

安装后在服务器命令行确认：

```cmd
node -v
```

如果已经安装了高版本 Node，请先卸载并安装 Node 18 LTS，再重新打开 CMD 验证。

## 3. 解压部署包

将 zip 包解压到任意目录即可，例如：

```text
E:\jtaitool\2026\qualitycheck-ai-windows-20260615\
```

不要依赖固定盘符或固定绝对路径，本包脚本均使用相对路径。

进入目录后应能看到：

```text
server.js
start-windows.cmd
.env.cmd.example
.next
node_modules
public
data
```

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
set "PORT=85"
set "HOSTNAME=0.0.0.0"
set "AI_AGENT_CHECK_TIMEOUT_MS=15000"
set "AI_AGENT_REWRITE_TIMEOUT_MS=15000"
```

说明：
- `PORT` 是服务监听端口。
- `HOSTNAME=0.0.0.0` 表示允许服务器外部访问。
- 如果服务器有防火墙或安全组，需要放行对应端口。

当前服务器使用 85 端口：

```cmd
set "PORT=85"
set "HOSTNAME=0.0.0.0"
```

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
http://127.0.0.1:85
```

## 6. 使用 PM2 常驻运行

安装 PM2：

```cmd
npm install -g pm2
```

进入解压目录：

```cmd
cd /d E:\jtaitool\2026\qualitycheck-ai-windows-20260615
```

加载环境变量：

```cmd
call .env.cmd
```

启动服务：

```cmd
pm2 start server.js --name qualitycheck-ai
```

查看状态：

```cmd
pm2 list
```

查看日志：

```cmd
pm2 logs qualitycheck-ai
```

保存进程列表：

```cmd
pm2 save
```

配置变更后重启：

```cmd
call .env.cmd
pm2 restart qualitycheck-ai --update-env
```

停止服务：

```cmd
pm2 stop qualitycheck-ai
```

删除服务：

```cmd
pm2 delete qualitycheck-ai
```

Windows 开机自启可使用：

```cmd
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

如遇 `connect EPERM \\.\pipe\rpc.sock`，通常是 Node 版本、权限或 PM2 残留问题。建议：

```cmd
taskkill /IM node.exe /F
rmdir /s /q C:\Users\wbwangsy\.pm2
npm uninstall -g pm2
npm install -g pm2
```

然后重新打开管理员 CMD 再执行 `pm2 -v`。

## 7. 常见问题

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

放行 85 端口：

```cmd
netsh advfirewall firewall add rule name="QualityCheck AI 85" dir=in action=allow protocol=TCP localport=85
```

### 端口占用

检查端口：

```cmd
netstat -ano | findstr :85
```

结束占用进程：

```cmd
taskkill /PID 进程ID /F
```

### 出现 sharp missing

当前包已通过 `images.unoptimized: true` 关闭 Next.js 图片优化，正常不应再出现 `sharp` 缺失。

如果仍出现，说明服务器上的包不是最新构建，请重新上传最新 zip 并确认 `next.config.mjs` 包含：

```js
images: {
  unoptimized: true
}
```
