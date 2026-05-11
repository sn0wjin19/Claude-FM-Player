const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const COOKIE_FILE = path.join(__dirname, "..", "cookies.txt");
const GENERATED_COOKIE_DIR = path.join(os.tmpdir(), "claude-fm-player");
const GENERATED_COOKIE_FILE = path.join(GENERATED_COOKIE_DIR, "youtube-cookies.txt");
const GENERATED_COOKIE_EXPIRY = 2147483647;

function isNetscapeCookieFile(text) {
  return (
    text.includes("Netscape HTTP Cookie File") ||
    text
      .split(/\r?\n/)
      .some((line) => line.trim() && line.split("\t").length >= 7)
  );
}

function parseCookieHeader(text) {
  const cookieText = text.trim().replace(/^cookie:\s*/i, "");
  const cookies = new Map();

  for (const part of cookieText.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (name) {
      cookies.set(name, value);
    }
  }

  return cookies;
}

function writeNetscapeCookieFile(cookies) {
  fs.mkdirSync(GENERATED_COOKIE_DIR, { recursive: true });

  const lines = [
    "# Netscape HTTP Cookie File",
    "# Generated locally by Claude FM Player from cookies.txt.",
    ...[...cookies.entries()].map(
      ([name, value]) =>
        `.youtube.com\tTRUE\t/\tTRUE\t${GENERATED_COOKIE_EXPIRY}\t${name}\t${value}`
    )
  ];

  fs.writeFileSync(GENERATED_COOKIE_FILE, `${lines.join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600
  });

  return GENERATED_COOKIE_FILE;
}

function resolveCookieFile() {
  if (!fs.existsSync(COOKIE_FILE)) {
    return null;
  }

  const text = fs.readFileSync(COOKIE_FILE, "utf8");
  if (isNetscapeCookieFile(text)) {
    return COOKIE_FILE;
  }

  const cookies = parseCookieHeader(text);
  if (cookies.size === 0) {
    throw new Error("cookies.txt is not a valid cookie file.");
  }

  return writeNetscapeCookieFile(cookies);
}

module.exports = {
  COOKIE_FILE,
  GENERATED_COOKIE_EXPIRY,
  GENERATED_COOKIE_FILE,
  isNetscapeCookieFile,
  parseCookieHeader,
  resolveCookieFile
};
