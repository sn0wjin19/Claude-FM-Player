const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { streamAudio, summarizeAudioError } = require("./audioStream");
const {
  configureChromeAuth,
  ensureAuthCookieFile,
  invalidateAuthStatus,
  openLoginWindow,
  readStoredAuthStatus,
  refreshAuthStatus
} = require("./chromeAuth");
const { resolveClaudeLiveVideoId } = require("./youtube");

const STATIC_ROOT = __dirname;
const APP_ICON = path.join(__dirname, "..", "assets", "icon.png");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};
const VENDOR_FILES = {
  "/vendor/lucide.min.js": path.join(
    __dirname,
    "..",
    "node_modules",
    "lucide",
    "dist",
    "umd",
    "lucide.min.js"
  ),
  "/vendor/motion.js": path.join(
    __dirname,
    "..",
    "node_modules",
    "motion",
    "dist",
    "motion.js"
  )
};
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

let staticServer;
let currentAppOrigin;

function getStaticFilePath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.normalize(path.join(STATIC_ROOT, relativePath));

  if (!filePath.startsWith(STATIC_ROOT)) {
    return null;
  }

  return filePath;
}

function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (url.pathname === "/audio.mp3") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
        response.writeHead(400);
        response.end("Invalid video ID");
        return;
      }

      try {
        await streamAudio(videoId, response, {
          getCookieFile: ensureAuthCookieFile
        });
      } catch (error) {
        console.error(summarizeAudioError(error));
        response.writeHead(502, {
          "content-type": "text/plain; charset=utf-8"
        });
        response.end(
          "无法读取 YouTube 音频。请点击用户图标登录 YouTube，或在项目根目录放置 cookies.txt。"
        );
      }
      return;
    }

    const vendorFile = VENDOR_FILES[url.pathname];
    if (vendorFile) {
      try {
        const body = await fs.readFile(vendorFile);
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "referrer-policy": "strict-origin-when-cross-origin"
        });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
      return;
    }

    const filePath = getStaticFilePath(request.url || "/");
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
        "referrer-policy": "strict-origin-when-cross-origin"
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function createWindow(appOrigin) {
  const win = new BrowserWindow({
    width: 280,
    height: 138,
    minWidth: 240,
    minHeight: 120,
    resizable: false,
    title: "Claude FM",
    backgroundColor: "#f6f1e8",
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("console-message", (_event, _level, message) => {
    if (process.env.CLAUDE_FM_SMOKE === "1") {
      console.log(`[renderer] ${message}`);
    }
  });

  win.removeMenu();
  win.loadURL(`${appOrigin}/index.html`);

  if (process.env.CLAUDE_FM_SMOKE === "1") {
    win.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        win.webContents.executeJavaScript(
          "document.querySelector('#playToggle')?.click()"
        );
      }, 4000);
      setTimeout(() => app.quit(), 10000);
    });
  }
}

ipcMain.handle("claude-fm:resolve-live", async () => {
  const signal = AbortSignal.timeout(15000);
  return resolveClaudeLiveVideoId({ signal });
});

ipcMain.handle("claude-fm:open-login", async (_event, options = {}) => {
  return openLoginWindow(options);
});

ipcMain.handle("claude-fm:get-auth-status", async () => {
  return readStoredAuthStatus();
});

ipcMain.handle("claude-fm:invalidate-auth", async () => {
  return invalidateAuthStatus();
});

ipcMain.handle("claude-fm:refresh-auth-status", async () => {
  return refreshAuthStatus();
});

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.sn0wjin19.claudefmplayer");
  }

  configureChromeAuth({
    profileDir: path.join(app.getPath("userData"), "chrome-auth")
  });
  const { server, origin } = await startStaticServer();
  staticServer = server;
  currentAppOrigin = origin;
  createWindow(origin);
});

app.on("before-quit", () => {
  staticServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(currentAppOrigin);
  }
});
