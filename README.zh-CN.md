# Claude FM Player

[English](./README.md)

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Runtime](https://img.shields.io/badge/runtime-Electron-47848f)
![License](https://img.shields.io/badge/license-MIT-green)

一个小巧的 Windows 桌面播放器，用来播放 Claude FM 的 YouTube 直播音频。

Claude FM Player 的目标很简单：一个小窗口、一条直播流、播放/暂停、音量控制，以及在 YouTube 需要登录校验时提供清晰的登录入口。应用启动后会解析当前 Claude FM 直播，并直接播放直播音频；暂停后再次播放会重新连接到最新直播进度。

## 亮点

- 启动时从 `https://www.youtube.com/@claude/live` 解析当前 Claude FM 直播。
- 只播放 YouTube 直播音频，不嵌入浏览器播放界面。
- 界面保持精简：播放/暂停、音量、状态文字、YouTube 登录入口。
- 默认音量为 20%，首次启动更温和。
- 暂停后再次播放会重新连接直播，尽量贴近最新音频进度。
- 使用专用 Chrome profile 登录 YouTube，不读取你的 Chrome Default profile。
- 支持在项目根目录放置 Netscape 格式的 `cookies.txt` 作为备用方案。
- 优先选择 YouTube AAC 音频，并通过 ffmpeg 转封装，避免二次编码为 MP3。
- Windows 安装包和 portable 版本会使用 `assets/icon.png` 作为应用图标。

## 工作原理

应用是一个 Electron 外壳，加上一层本地音频服务：

1. 主进程解析当前 Claude FM 的直播视频 ID。
2. `yt-dlp` 选择最佳可用音频流，并优先选择 AAC。
3. `ffmpeg` 将音频转封装为浏览器可播放的 AAC，并通过本地 `/audio.mp3` 端点输出。
4. 渲染进程使用标准 HTML audio 元素播放；恢复播放时重新连接，尽量贴近直播最新位置。

在 Windows 打包版本里，`ffmpeg-static` 和 `yt-dlp-exec` 的原生二进制会从 Electron ASAR 包中解包后再执行。

## 环境要求

- Windows
- 开发环境需要 Node.js 和 npm
- YouTube 登录流程需要 Google Chrome

打包后的应用会自带 Electron、ffmpeg 和 yt-dlp。只有在 YouTube 要求登录校验时才需要 Chrome。

## 开始使用

安装依赖并启动开发版本：

```powershell
npm install
npm start
```

运行测试：

```powershell
npm test
```

## YouTube 登录

YouTube 有时会要求登录 cookie 才允许读取可播放的音频流。Claude FM Player 支持两种认证方式。

### 专用 Chrome Profile

点击应用里的用户图标。播放器会打开一个专用 Chrome profile 用于 YouTube 登录，并只导出音频解析所需的 cookies。这个 profile 与你日常使用的 Chrome Default profile 分开。

如果播放失败是由 cookie 过期导致的，应用会丢弃本地导出的旧 cookie 文件，并提示你刷新登录。

### 本地 Cookies 文件

高级用户可以把 Netscape 格式的 `cookies.txt` 放在项目根目录。该文件已被 Git 忽略，不应该提交到仓库。

## 构建

生成未安装的 Windows 应用目录：

```powershell
npm run pack
```

生成 Windows x64 安装包和 portable 可执行文件：

```powershell
npm run dist
```

构建产物会输出到 `dist/`，该目录已加入 `.gitignore`。

## 项目结构

```text
assets/              应用图标和构建资源
src/main.js          Electron 主进程、本地服务、IPC 处理
src/renderer.js      播放器界面和播放交互
src/audioStream.js   yt-dlp 与 ffmpeg 音频管线
src/chromeAuth.js    专用 Chrome profile 登录和 cookie 导出
src/cookies.js       cookies.txt 解析工具
src/youtube.js       Claude FM 直播解析
test/                Node 测试套件
```

## 常见问题

### Portable 版本提示登录，但开发版本正常

请确认运行的是最新 portable 构建。应用现在使用稳定的 `claude-fm-player` 认证 profile，因此开发版本和打包版本会读取同一份导出的 YouTube cookies。

### 登录成功后仍然播放失败

YouTube cookies 可能会过期或轮换。点击用户图标，在专用 Chrome 窗口里刷新登录。遇到认证相关播放失败时，播放器会自动丢弃旧的导出 cookie。

### 音频听起来不够清晰

播放器会优先选择 AAC，并通过 ffmpeg 转封装，而不是重新编码成 MP3。如果仍然觉得音质下降，通常来自源直播、YouTube 临时分发策略，或当前选中的直播音频档位。

### 指定 ffmpeg 路径

可以设置 `CLAUDE_FM_FFMPEG_PATH`，让应用使用指定的 ffmpeg 可执行文件。

## 安全与隐私

- 应用不会读取你的 Chrome Default profile。
- 专用 Chrome profile 会保存在本机应用认证目录。
- 导出的 cookie 文件只用于让 `yt-dlp` 读取 YouTube 音频流。
- `cookies.txt` 已被 Git 忽略，应当视为敏感文件。

## License

Claude FM Player 使用 [MIT License](./LICENSE)。

第三方依赖许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
