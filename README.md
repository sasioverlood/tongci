# 同词相见

一个适合 2–3 人在线游玩的实时同词联想游戏。

## 架构

- `public/`：纯静态前端，可部署到 GitHub Pages。
- `server.js`：WebSocket 游戏后端，运行在你的电脑上。
- `.github/workflows/pages.yml`：推送到 `main` 后自动发布前端。

GitHub Pages 使用 HTTPS，因此不能直接连接你电脑上的 `ws://localhost:3000`。需要用 Cloudflare Tunnel、ngrok 等工具把本地服务转换成公网可访问的 `https://` / `wss://` 地址。

## 1. 在电脑上运行后端

```bash
npm install
npm start
```

浏览器打开 `http://localhost:3000`。测试多人效果时，可以使用两个浏览器窗口或手机与电脑同时进入，并通过 6 位房间码加入同一房间。

如果只允许指定的前端域名连接，可以设置环境变量：

```powershell
$env:ALLOWED_ORIGINS="https://你的用户名.github.io"
npm start
```

多个允许来源用英文逗号分隔。不设置时允许所有来源，适合首次调试。

## 2. 建立公网隧道

安装 `cloudflared` 后，在另一个终端运行：

```powershell
cloudflared tunnel --url http://localhost:3000
```

命令会显示一个类似 `https://random-name.trycloudflare.com` 的临时地址。网页中可以直接填写这个 HTTPS 地址，前端会自动转换成 WSS。临时隧道每次启动地址可能变化。

## 3. 部署 GitHub Pages 前端

1. 在 GitHub 创建仓库并把本项目推送到 `main` 分支。
2. 打开仓库的 **Settings → Pages**。
3. 将 **Source** 设置为 **GitHub Actions**。
4. 等待 `Deploy frontend to GitHub Pages` 工作流完成。
5. 打开 Pages 地址，在“联机服务器设置”中填写隧道地址。

创建房间后，复制邀请信息会同时携带房间码和后端地址，朋友打开链接后无需再次填写服务器。

如果已有固定隧道域名，也可以直接修改 `public/config.js`：

```js
window.GAME_SERVER_URL = "wss://你的后端域名";
```

## 游戏规则

1. 房主创建房间并邀请朋友加入。
2. 每轮所有玩家独立写下一个联想到的词。
3. 全员提交或倒计时结束后同时揭晓答案。
4. 如果所有人的词相同，游戏胜利；否则根据本轮出现的词继续联想。

## 技术说明

- 原生 HTML、CSS、JavaScript 前端
- Node.js HTTP 服务
- WebSocket 实时房间通信
- 房间数据保存在内存中，服务重启后会清空
