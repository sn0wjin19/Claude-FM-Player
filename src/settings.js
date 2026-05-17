const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_SETTINGS = {
  proxyUrl: "",
  volume: 20
};
const PROXY_SCHEMES = new Set(["http:", "https:"]);

let settingsState = {
  settingsPath: null
};

function configureSettings({ settingsPath }) {
  settingsState.settingsPath = settingsPath;
}

function getSettingsPath() {
  if (!settingsState.settingsPath) {
    throw new Error("Settings path has not been configured.");
  }

  return settingsState.settingsPath;
}

function normalizeProxyUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("请输入有效的代理地址。");
  }

  if (!PROXY_SCHEMES.has(parsed.protocol)) {
    throw new Error("代理地址仅支持 http:// 或 https://。");
  }

  if (!parsed.hostname) {
    throw new Error("请输入有效的代理主机。");
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("代理地址不能包含路径、查询参数或片段。");
  }

  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
    : "";
  return `${parsed.protocol}//${auth}${parsed.host}`;
}

function normalizeVolume(value) {
  const volume = Number(value);

  if (!Number.isFinite(volume)) {
    return DEFAULT_SETTINGS.volume;
  }

  return Math.max(0, Math.min(100, Math.round(volume)));
}

function normalizeSettings(settings = {}) {
  return {
    proxyUrl: normalizeProxyUrl(settings.proxyUrl),
    volume: normalizeVolume(settings.volume)
  };
}

async function readSettings() {
  try {
    const text = await fs.readFile(getSettingsPath(), "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error instanceof SyntaxError ||
      /代理地址/.test(error.message)
    ) {
      return { ...DEFAULT_SETTINGS };
    }

    throw error;
  }
}

async function writeSettings(settings) {
  const normalized = normalizeSettings(settings);
  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

module.exports = {
  DEFAULT_SETTINGS,
  configureSettings,
  normalizeProxyUrl,
  normalizeVolume,
  normalizeSettings,
  readSettings,
  writeSettings
};
