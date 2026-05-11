const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const YOUTUBE_HOME_URL = "https://www.youtube.com/";
const YOUTUBE_LOGIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F";
const COOKIE_EXPIRY_FALLBACK = 2147483647;

let authState = {
  child: null,
  port: null,
  profileDir: process.env.CLAUDE_FM_AUTH_PROFILE_DIR || null
};

function defaultChromePaths() {
  return [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    )
  ];
}

function findChromeExecutable({ existsSync = fs.existsSync, paths = defaultChromePaths() } = {}) {
  return paths.find((candidate) => candidate && existsSync(candidate)) || null;
}

function configureChromeAuth({ profileDir }) {
  authState.profileDir = profileDir;
}

function getAuthProfileDir() {
  return (
    authState.profileDir ||
    path.join(os.homedir(), "AppData", "Roaming", "claude-fm-player", "chrome-auth")
  );
}

function getAuthCookieFile() {
  return path.join(getAuthProfileDir(), "youtube-cookies.txt");
}

function isYouTubeCookie(cookie) {
  const domain = cookie.domain || "";
  return domain === "youtube.com" || domain.endsWith(".youtube.com");
}

function hasYouTubeLoginCookies(cookies) {
  return cookies.some(
    (cookie) =>
      isYouTubeCookie(cookie) &&
      (cookie.name === "LOGIN_INFO" ||
        cookie.name === "__Secure-1PSID" ||
        cookie.name === "__Secure-3PSID")
  );
}

function getLoginUrlForStatus(isLoggedIn, { forceLogin = false } = {}) {
  return isLoggedIn && !forceLogin ? YOUTUBE_HOME_URL : YOUTUBE_LOGIN_URL;
}

function chromeCookiesToNetscape(cookies) {
  const lines = [
    "# Netscape HTTP Cookie File",
    "# Generated locally by Claude FM Player from the dedicated Chrome profile."
  ];

  for (const cookie of cookies.filter(isYouTubeCookie)) {
    const domain = cookie.domain || ".youtube.com";
    const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
    const pathValue = cookie.path || "/";
    const secure = cookie.secure ? "TRUE" : "FALSE";
    const expires =
      Number.isFinite(cookie.expires) && cookie.expires > 0
        ? Math.floor(cookie.expires)
        : 0;
    lines.push(
      `${domain}\t${includeSubdomains}\t${pathValue}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function writeAuthCookieFile(cookies) {
  fs.mkdirSync(getAuthProfileDir(), { recursive: true });
  const text = chromeCookiesToNetscape(cookies);
  fs.writeFileSync(getAuthCookieFile(), text, {
    encoding: "utf8",
    mode: 0o600
  });
  return getAuthCookieFile();
}

function readStoredAuthStatus() {
  const cookieFile = getAuthCookieFile();
  if (!fs.existsSync(cookieFile)) {
    return {
      cookieCount: 0,
      isLoggedIn: false
    };
  }

  const text = fs.readFileSync(cookieFile, "utf8");
  const cookies = text
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [domain, , pathValue, secure, expires, name, ...valueParts] =
        line.split("\t");
      return {
        domain,
        expires: Number(expires) || 0,
        name,
        path: pathValue,
        secure: secure === "TRUE",
        value: valueParts.join("\t")
      };
    });

  return {
    cookieCount: cookies.length,
    isLoggedIn: hasYouTubeLoginCookies(cookies)
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForDevTools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error("Chrome DevTools did not start.");
}

function sendCdpCommand(webSocketDebuggerUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const id = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Chrome DevTools timed out."));
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id, method, params }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) {
        return;
      }

      clearTimeout(timer);
      ws.close();
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Chrome DevTools websocket failed."));
    };
  });
}

async function readCookiesFromPort(port) {
  const version = await waitForDevTools(port);
  try {
    const result = await sendCdpCommand(version.webSocketDebuggerUrl, "Network.getAllCookies");
    return result.cookies || [];
  } catch {
    const result = await sendCdpCommand(version.webSocketDebuggerUrl, "Storage.getCookies");
    return result.cookies || [];
  }
}

async function openLoginTab(port) {
  const version = await waitForDevTools(port);
  await sendCdpCommand(version.webSocketDebuggerUrl, "Target.createTarget", {
    url: YOUTUBE_LOGIN_URL
  });
}

function isAuthChromeRunning() {
  return authState.child && authState.child.exitCode === null && !authState.child.killed;
}

async function openLoginWindow({ forceLogin = false } = {}) {
  fs.mkdirSync(getAuthProfileDir(), { recursive: true });

  if (isAuthChromeRunning()) {
    if (forceLogin) {
      await openLoginTab(authState.port);
    }
    return {
      isLoggedIn: readStoredAuthStatus().isLoggedIn,
      profileDir: getAuthProfileDir(),
      port: authState.port
    };
  }

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error("Google Chrome is not installed.");
  }

  const port = await getFreePort();
  const status = readStoredAuthStatus();
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${getAuthProfileDir()}`,
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      getLoginUrlForStatus(status.isLoggedIn, { forceLogin })
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  );

  child.unref();
  authState.child = child;
  authState.port = port;

  return {
    isLoggedIn: status.isLoggedIn,
    profileDir: getAuthProfileDir(),
    port
  };
}

async function exportCookiesWithTemporaryChrome() {
  fs.mkdirSync(getAuthProfileDir(), { recursive: true });

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error("Google Chrome is not installed.");
  }

  const port = await getFreePort();
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${getAuthProfileDir()}`,
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      YOUTUBE_LOGIN_URL
    ],
    {
      stdio: "ignore",
      windowsHide: true
    }
  );

  try {
    const cookies = await readCookiesFromPort(port);
    return writeAuthCookieFile(cookies);
  } finally {
    child.kill();
  }
}

async function ensureAuthCookieFile() {
  const cookies = isAuthChromeRunning()
    ? await readCookiesFromPort(authState.port)
    : null;

  if (cookies) {
    return writeAuthCookieFile(cookies);
  }

  return exportCookiesWithTemporaryChrome();
}

async function refreshAuthStatus() {
  if (isAuthChromeRunning()) {
    const cookies = await readCookiesFromPort(authState.port);
    writeAuthCookieFile(cookies);
  }

  return readStoredAuthStatus();
}

module.exports = {
  COOKIE_EXPIRY_FALLBACK,
  chromeCookiesToNetscape,
  configureChromeAuth,
  ensureAuthCookieFile,
  findChromeExecutable,
  getAuthCookieFile,
  getAuthProfileDir,
  getLoginUrlForStatus,
  hasYouTubeLoginCookies,
  openLoginWindow,
  readStoredAuthStatus,
  refreshAuthStatus
};
