const { spawn } = require("node:child_process");
const path = require("node:path");
const ffmpegStatic = require("ffmpeg-static");
const ytdlpExec = require("yt-dlp-exec");
const { YOUTUBE_DL_PATH } = require("yt-dlp-exec/src/constants");
const { COOKIE_FILE, resolveCookieFile } = require("./cookies");

const EDGE_COOKIES = "edge:Default";
const AUDIO_CONTENT_TYPE = "audio/aac";
const ASAR_SEGMENT = `${path.sep}app.asar${path.sep}`;
const ASAR_UNPACKED_SEGMENT = `${path.sep}app.asar.unpacked${path.sep}`;

function resolveAsarUnpackedPath(filePath) {
  if (!filePath || !filePath.includes(ASAR_SEGMENT)) {
    return filePath;
  }

  return filePath.replace(ASAR_SEGMENT, ASAR_UNPACKED_SEGMENT);
}

function resolveYtDlpPath() {
  return resolveAsarUnpackedPath(YOUTUBE_DL_PATH);
}

const ytdlp = ytdlpExec.create(resolveYtDlpPath());

function buildWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function getYtDlpOptions({ getCookieFile } = {}) {
  let cookieFile = null;
  let cookieFileError = null;

  if (getCookieFile) {
    try {
      cookieFile = await getCookieFile();
    } catch (error) {
      cookieFileError = error;
    }
  }

  if (!cookieFile) {
    cookieFile = resolveCookieFile();
  }

  if (!cookieFile && cookieFileError) {
    throw cookieFileError;
  }

  const options = {
    dumpSingleJson: true,
    format: "bestaudio[acodec^=mp4a]/bestaudio/best",
    jsRuntimes: process.env.CLAUDE_FM_JS_RUNTIME || "node",
    noWarnings: true,
    skipDownload: true
  };

  if (cookieFile) {
    options.cookies = cookieFile;
  } else {
    options.cookiesFromBrowser = EDGE_COOKIES;
  }

  return options;
}

async function getAudioInfo(videoId, options = {}) {
  const info = await ytdlp(buildWatchUrl(videoId), await getYtDlpOptions(options));

  if (!info.url) {
    throw new Error("yt-dlp did not return a playable audio URL.");
  }

  return {
    audioCodec: info.acodec || "",
    headers: info.http_headers || {},
    title: info.title || "Claude FM",
    url: info.url
  };
}

function buildFfmpegArgs(audioInfo) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5"
  ];

  const headers = Object.entries(audioInfo.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n");

  if (headers) {
    args.push("-headers", `${headers}\r\n`);
  }

  args.push(
    "-i",
    audioInfo.url,
    "-vn",
    "-f",
    "adts",
    "-codec:a",
    "copy",
    "pipe:1"
  );

  return args;
}

function killProcess(child) {
  if (child && !child.killed) {
    child.kill();
  }
}

function resolveFfmpegPath() {
  return process.env.CLAUDE_FM_FFMPEG_PATH || resolveAsarUnpackedPath(ffmpegStatic) || "ffmpeg";
}

async function streamAudio(videoId, response, options = {}) {
  const audioInfo = options.getAudioInfo
    ? await options.getAudioInfo(videoId)
    : await getAudioInfo(videoId, options);
  const ffmpeg = spawn(resolveFfmpegPath(), buildFfmpegArgs(audioInfo), {
    windowsHide: true
  });

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": AUDIO_CONTENT_TYPE
  });

  ffmpeg.stdout.pipe(response);
  ffmpeg.stderr.on("data", (chunk) => {
    console.error(`[ffmpeg] ${chunk.toString().trim()}`);
  });

  response.on("close", () => {
    killProcess(ffmpeg);
  });

  ffmpeg.on("error", (error) => {
    console.error(error);
    response.destroy(error);
  });
}

function summarizeAudioError(error) {
  const message = error?.stderr || error?.message || String(error);

  if (message.includes("cookies are no longer valid")) {
    return "cookies.txt is no longer valid.";
  }

  if (message.includes("Sign in to confirm")) {
    return "YouTube requires a logged-in cookie.";
  }

  if (message.includes("does not look like a Netscape format")) {
    return "cookies.txt is not in a format yt-dlp can read.";
  }

  if (message.includes("Could not copy Chrome cookie database")) {
    return "Edge is locking the cookie database.";
  }

  if (message.includes("Google Chrome is not installed")) {
    return "Google Chrome is not installed.";
  }

  if (message.includes("n challenge solving failed")) {
    return "yt-dlp needs a JavaScript runtime to solve the YouTube challenge.";
  }

  return error?.shortMessage || "Could not start the YouTube audio stream.";
}

module.exports = {
  buildFfmpegArgs,
  buildWatchUrl,
  COOKIE_FILE,
  AUDIO_CONTENT_TYPE,
  getAudioInfo,
  getYtDlpOptions,
  resolveAsarUnpackedPath,
  resolveFfmpegPath,
  resolveYtDlpPath,
  summarizeAudioError,
  streamAudio
};
