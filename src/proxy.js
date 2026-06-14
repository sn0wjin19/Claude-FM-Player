const { execFileSync } = require("node:child_process");
const { normalizeProxyUrl } = require("./settings");

const PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy"
];
const INTERNET_SETTINGS_KEY =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

function tryNormalizeProxyUrl(value) {
  try {
    return normalizeProxyUrl(value);
  } catch {
    return "";
  }
}

function getEnvProxyUrl(env = process.env) {
  for (const key of PROXY_ENV_KEYS) {
    const proxyUrl = tryNormalizeProxyUrl(env[key]);
    if (proxyUrl) {
      return proxyUrl;
    }
  }

  return "";
}

function parseWindowsProxyServer(proxyServer) {
  const value = String(proxyServer || "").trim();
  if (!value) {
    return "";
  }

  if (!value.includes("=")) {
    return tryNormalizeProxyUrl(value);
  }

  const entries = new Map(
    value
      .split(";")
      .map((entry) => entry.trim().split("="))
      .filter(([key, proxy]) => key && proxy)
      .map(([key, proxy]) => [key.toLowerCase(), proxy])
  );

  return (
    tryNormalizeProxyUrl(entries.get("https")) ||
    tryNormalizeProxyUrl(entries.get("http")) ||
    ""
  );
}

function queryWindowsProxyValue(valueName, execFileSyncImpl = execFileSync) {
  const output = execFileSyncImpl(
    "reg",
    ["query", INTERNET_SETTINGS_KEY, "/v", valueName],
    {
      encoding: "utf8",
      windowsHide: true
    }
  );
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(valueName.toLowerCase()));

  if (!line) {
    return "";
  }

  return line.replace(new RegExp(`^${valueName}\\s+REG_\\w+\\s+`, "i"), "").trim();
}

function getWindowsProxyUrl({
  platform = process.platform,
  execFileSyncImpl = execFileSync
} = {}) {
  if (platform !== "win32") {
    return "";
  }

  try {
    const enabled = queryWindowsProxyValue("ProxyEnable", execFileSyncImpl);
    if (!/(^|\s)0x1$/i.test(enabled) && enabled !== "1") {
      return "";
    }

    return parseWindowsProxyServer(
      queryWindowsProxyValue("ProxyServer", execFileSyncImpl)
    );
  } catch {
    return "";
  }
}

function getAutoProxyUrl(options = {}) {
  return getEnvProxyUrl(options.env) || getWindowsProxyUrl(options);
}

function getEffectiveProxyUrl(settingsProxyUrl, options = {}) {
  return tryNormalizeProxyUrl(settingsProxyUrl) || getAutoProxyUrl(options);
}

module.exports = {
  getAutoProxyUrl,
  getEffectiveProxyUrl,
  getEnvProxyUrl,
  getWindowsProxyUrl,
  parseWindowsProxyServer
};
