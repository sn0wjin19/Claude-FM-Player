# Claude FM Player

一个小巧的 Windows/Electron 桌面播放器，用来播放 Claude YouTube 频道的 Claude FM 直播音频。

## 功能

- 启动后自动请求 `https://www.youtube.com/@claude/live`，解析当前直播视频。
- 只保留播放/暂停、音量条、YouTube 登录入口这些必要控件。
- 播放时只拉取 YouTube 直播音频；暂停会断开当前音频流，再次播放会重新连接到直播的最新进度。
- 默认音量 20%。
- 缓冲中使用 Motion 动画显示“转一圈、停一下”的连接状态。
- 登录图标使用独立 Chrome profile，不读取你的 Chrome Default profile。已登录时再次点击会显示提示，不会重复打开登录页。
- Windows 打包使用 `assets/icon.png` 作为应用图标。

## 开发运行

```powershell
npm install
npm start
```

## YouTube 登录和 Cookies

如果 YouTube 要求登录校验，可以用两种方式：

1. 点击应用里的用户图标，使用播放器专用 Chrome profile 登录 YouTube。未登录时会直接打开 YouTube 登录页；登录完成后，应用会读取这个专用 profile 的 YouTube cookies。
2. 把 Netscape 格式的 `cookies.txt` 放在项目根目录。`cookies.txt` 已加入 `.gitignore`，不要提交到仓库。

## 音频实现

播放器会优先选择 YouTube 的 AAC 音频，并通过 ffmpeg 复制成浏览器可播放的 AAC 流，避免二次转成低码率 MP3。开发环境和打包版本会优先使用 `ffmpeg-static` 提供的 ffmpeg；也可以通过 `CLAUDE_FM_FFMPEG_PATH` 指定自定义 ffmpeg 路径。

## 测试

```powershell
npm test
```

## Windows 打包

生成未安装目录：

```powershell
npm run pack
```

生成 Windows x64 安装包和 portable exe：

```powershell
npm run dist
```

打包产物会输出到 `dist/`，该目录已加入 `.gitignore`。

## 项目结构

```text
assets/              应用图标
src/main.js          Electron 主进程、本地静态服务、音频代理
src/renderer.js      播放器 UI 交互
src/audioStream.js   yt-dlp 和 ffmpeg 音频流
src/chromeAuth.js    专用 Chrome profile 登录和 cookies 导出
src/cookies.js       cookies.txt 解析
src/youtube.js       Claude FM 直播地址解析
test/                Node test 测试
```

## License

本项目代码使用 MIT License。第三方依赖许可见 `THIRD_PARTY_NOTICES.md`。
