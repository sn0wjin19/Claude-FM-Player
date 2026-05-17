const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVideoId,
  extractVideoIdFromHtml,
  resolveClaudeLiveVideoId
} = require("../src/youtube");
const {
  AUDIO_CONTENT_TYPE,
  buildFfmpegArgs,
  buildWatchUrl,
  buildAudioInfoFromYtDlpInfo,
  getYtDlpOptions,
  isPlayableAudioInfo,
  isLiveUnavailableError,
  resolveAsarUnpackedPath,
  resolveFfmpegPath,
  resolveYtDlpPath,
  summarizeAudioError
} = require("../src/audioStream");
const {
  chromeCookiesToNetscape,
  buildChromeArgs,
  configureChromeAuth,
  getLoginUrlForStatus,
  getAuthCookieFile,
  hasYouTubeLoginCookies,
  invalidateAuthStatus,
  ensureAuthCookieFile,
  readStoredAuthStatus,
  findChromeExecutable
} = require("../src/chromeAuth");
const {
  GENERATED_COOKIE_EXPIRY,
  isNetscapeCookieFile,
  parseCookieHeader
} = require("../src/cookies");
const {
  configureSettings,
  normalizeProxyUrl,
  normalizeVolume,
  readSettings,
  writeSettings
} = require("../src/settings");

test("extractVideoId reads common YouTube URL shapes", () => {
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(extractVideoId("https://youtu.be/ZYXWVUTSRQP"), "ZYXWVUTSRQP");
  assert.equal(extractVideoId("https://www.youtube.com/embed/12345678901"), "12345678901");
  assert.equal(extractVideoId("not a url"), null);
});

test("extractVideoIdFromHtml prefers canonical watch links", () => {
  const html = '<link rel="canonical" href="https://www.youtube.com/watch?v=abc_DEF-123">';
  assert.equal(extractVideoIdFromHtml(html), "abc_DEF-123");
});

test("extractVideoIdFromHtml reads the current live endpoint before prefetch ids", () => {
  const html = [
    '{"webPrefetchData":{"navigationEndpoints":[{"watchEndpoint":{"videoId":"prefetch123"}}]}',
    '"currentVideoEndpoint":{"watchEndpoint":{"videoId":"current1234"}}'
  ].join("");

  assert.equal(extractVideoIdFromHtml(html), "current1234");
});

test("resolveClaudeLiveVideoId uses the final redirected URL first", async () => {
  const result = await resolveClaudeLiveVideoId({
    fetchImpl: async () => ({
      ok: true,
      url: "https://www.youtube.com/watch?v=liveVideo12",
      text: async () => {
        throw new Error("should not read html");
      }
    })
  });

  assert.deepEqual(result, {
    videoId: "liveVideo12",
    sourceUrl: "https://www.youtube.com/watch?v=liveVideo12"
  });
});

test("resolveClaudeLiveVideoId falls back to html parsing", async () => {
  const result = await resolveClaudeLiveVideoId({
    liveUrl: "https://www.youtube.com/@claude/live",
    fetchImpl: async () => ({
      ok: true,
      url: "https://www.youtube.com/@claude/live",
      text: async () => '{"videoId":"htmlVideo34"}'
    })
  });

  assert.equal(result.videoId, "htmlVideo34");
});

test("audio stream helpers build yt-dlp and ffmpeg inputs", async () => {
  assert.equal(AUDIO_CONTENT_TYPE, "audio/aac");
  assert.equal(buildWatchUrl("abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk");
  const options = await getYtDlpOptions({
    getCookieFile: async () => "C:\\auth\\youtube-cookies.txt",
    proxyUrl: "http://127.0.0.1:7890"
  });
  assert.equal(options.cookies, "C:\\auth\\youtube-cookies.txt");
  assert.equal(options.cookiesFromBrowser, undefined);
  assert.equal(options.proxy, "http://127.0.0.1:7890");
  assert.match(options.format, /acodec\^=mp4a/);
  assert.equal(options.jsRuntimes, process.env.CLAUDE_FM_JS_RUNTIME || "node");

  const fallbackOptions = await getYtDlpOptions();
  assert.ok(fallbackOptions.cookies || fallbackOptions.cookiesFromBrowser);
  assert.equal(fallbackOptions.jsRuntimes, process.env.CLAUDE_FM_JS_RUNTIME || "node");

  const args = buildFfmpegArgs(
    {
      audioCodec: "mp4a.40.2",
      headers: { Referer: "https://www.youtube.com/" },
      url: "https://example.com/audio"
    },
    {
      proxyUrl: "http://127.0.0.1:7890"
    }
  );

  assert.ok(args.includes("-headers"));
  assert.ok(args.includes("Referer: https://www.youtube.com/\r\n"));
  assert.ok(args.includes("-http_proxy"));
  assert.ok(args.includes("http://127.0.0.1:7890"));
  assert.ok(args.includes("https://example.com/audio"));
  assert.ok(args.includes("-codec:a"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-f"));
  assert.ok(args.includes("adts"));
  assert.equal(args.includes("-movflags"), false);
  assert.equal(args.includes("libmp3lame"), false);
  assert.ok(args.includes("pipe:1"));
  assert.match(resolveFfmpegPath(), /ffmpeg/i);
  assert.match(resolveYtDlpPath(), /yt-dlp/i);
  assert.equal(
    resolveAsarUnpackedPath("C:\\app\\resources\\app.asar\\node_modules\\tool\\bin.exe"),
    "C:\\app\\resources\\app.asar.unpacked\\node_modules\\tool\\bin.exe"
  );
});

test("audio stream helpers fall back when auth cookie provider returns nothing", async () => {
  const options = await getYtDlpOptions({
    getCookieFile: async () => null
  });
  assert.ok(options.cookies || options.cookiesFromBrowser);
  assert.equal(options.jsRuntimes, process.env.CLAUDE_FM_JS_RUNTIME || "node");
});

test("audio stream helpers expose paused live status", () => {
  const audioInfo = buildAudioInfoFromYtDlpInfo({
    acodec: "mp4a.40.2",
    http_headers: { Referer: "https://www.youtube.com/" },
    is_live: false,
    live_status: "post_live",
    title: "Claude FM",
    url: "https://example.com/audio"
  });

  assert.equal(audioInfo.liveStatus, "post_live");
  assert.equal(audioInfo.isLive, false);
  assert.equal(isPlayableAudioInfo(audioInfo), false);
});

test("chrome auth converts CDP YouTube and Google cookies to Netscape format", () => {
  const text = chromeCookiesToNetscape([
    {
      domain: ".youtube.com",
      expires: 2147483647,
      httpOnly: true,
      name: "LOGIN_INFO",
      path: "/",
      secure: true,
      value: "abc"
    },
    {
      domain: ".google.com",
      expires: -1,
      name: "SID",
      path: "/",
      secure: true,
      value: "google"
    },
    {
      domain: ".example.com",
      expires: -1,
      name: "SID",
      path: "/",
      secure: true,
      value: "ignored"
    },
    {
      domain: "youtube.com",
      expires: -1,
      name: "YSC",
      path: "/",
      secure: true,
      value: "xyz"
    }
  ]);

  assert.match(text, /^# Netscape HTTP Cookie File/m);
  assert.match(text, /\.youtube\.com\tTRUE\t\/\tTRUE\t2147483647\tLOGIN_INFO\tabc/);
  assert.match(text, /\.google\.com\tTRUE\t\/\tTRUE\t0\tSID\tgoogle/);
  assert.match(text, /youtube\.com\tFALSE\t\/\tTRUE\t0\tYSC\txyz/);
  assert.doesNotMatch(text, /example/);
});

test("chrome auth detects YouTube login status from cookies", () => {
  assert.equal(
    hasYouTubeLoginCookies([
      { domain: ".youtube.com", name: "LOGIN_INFO", value: "abc" }
    ]),
    true
  );
  assert.equal(hasYouTubeLoginCookies([{ domain: ".youtube.com", name: "YSC" }]), false);
});

test("chrome auth chooses a clear login URL when not authenticated", () => {
  assert.equal(
    getLoginUrlForStatus(false),
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
  );
  assert.equal(getLoginUrlForStatus(true), "https://www.youtube.com/");
  assert.equal(
    getLoginUrlForStatus(true, { forceLogin: true }),
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
  );
});

test("chrome auth reads stored login status without exposing cookie values", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-fm-auth-test-"));
  configureChromeAuth({ profileDir: dir });

  fs.writeFileSync(
    getAuthCookieFile(),
    [
      "# Netscape HTTP Cookie File",
      ".youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\tsecret"
    ].join("\n")
  );

  assert.deepEqual(readStoredAuthStatus(), {
    cookieCount: 1,
    isLoggedIn: true
  });
});

test("chrome auth can invalidate stale stored cookies", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-fm-invalidate-test-"));
  configureChromeAuth({ profileDir: dir });

  fs.writeFileSync(
    getAuthCookieFile(),
    [
      "# Netscape HTTP Cookie File",
      ".youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\tsecret"
    ].join("\n")
  );

  assert.equal(readStoredAuthStatus().isLoggedIn, true);
  assert.deepEqual(invalidateAuthStatus(), {
    cookieCount: 0,
    isLoggedIn: false
  });
  assert.equal(fs.existsSync(getAuthCookieFile()), false);
});

test("chrome auth reuses stored login cookies before refreshing Chrome", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-fm-stored-cookie-test-"));
  configureChromeAuth({ profileDir: dir });

  fs.writeFileSync(
    getAuthCookieFile(),
    [
      "# Netscape HTTP Cookie File",
      ".youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\tsecret"
    ].join("\n")
  );

  assert.equal(await ensureAuthCookieFile(), getAuthCookieFile());
});

test("chrome auth finds the first existing Chrome executable", () => {
  const chrome = findChromeExecutable({
    existsSync: (candidate) => candidate.endsWith("chrome.exe"),
    paths: ["missing.exe", "chrome.exe"]
  });

  assert.equal(chrome, "chrome.exe");
});

test("chrome auth passes proxy settings to dedicated Chrome windows", () => {
  const args = buildChromeArgs({
    port: 9333,
    proxyUrl: "http://127.0.0.1:7890",
    targetUrl: "https://www.youtube.com/"
  });

  assert.ok(args.includes("--proxy-server=http://127.0.0.1:7890"));
  assert.ok(args.includes("--remote-debugging-port=9333"));
  assert.equal(args.at(-1), "https://www.youtube.com/");
});

test("cookie helpers understand Netscape and request header formats", () => {
  assert.equal(isNetscapeCookieFile("# Netscape HTTP Cookie File\n"), true);

  const parsed = parseCookieHeader("Cookie: SID=abc=123; YSC=xyz");
  assert.equal(parsed.get("SID"), "abc=123");
  assert.equal(parsed.get("YSC"), "xyz");
  assert.equal(GENERATED_COOKIE_EXPIRY > Math.floor(Date.now() / 1000), true);
});

test("settings normalize and persist proxy URLs and volume", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-fm-settings-test-"));
  const settingsPath = path.join(dir, "settings.json");
  configureSettings({ settingsPath });

  assert.deepEqual(await readSettings(), { proxyUrl: "", volume: 20 });
  assert.equal(normalizeProxyUrl("127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.equal(normalizeVolume("37.6"), 38);
  assert.equal(normalizeVolume(140), 100);
  assert.equal(normalizeVolume(-8), 0);
  assert.deepEqual(await writeSettings({ proxyUrl: "127.0.0.1:7890", volume: 42 }), {
    proxyUrl: "http://127.0.0.1:7890",
    volume: 42
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), {
    proxyUrl: "http://127.0.0.1:7890",
    volume: 42
  });
  await assert.rejects(
    () => writeSettings({ proxyUrl: "socks5://127.0.0.1:7890" }),
    /http:\/\/.*https:\/\//
  );
});

test("audio errors are summarized without raw stderr", () => {
  const summary = summarizeAudioError({
    stderr: "ERROR: 'cookies.txt' does not look like a Netscape format cookies file\nSECRET=do-not-print"
  });

  assert.equal(summary, "cookies.txt is not in a format yt-dlp can read.");

  assert.equal(
    summarizeAudioError({ stderr: "n challenge solving failed" }),
    "yt-dlp needs a JavaScript runtime to solve the YouTube challenge."
  );

  assert.equal(
    summarizeAudioError({
      stderr: "cookies are no longer valid\nSign in to confirm you’re not a bot"
    }),
    "cookies.txt is no longer valid."
  );

  const pausedLiveError = {
    stderr: "ERROR: [youtube] YmQ7jRgf4f0: We're experiencing technical difficulties."
  };
  assert.equal(isLiveUnavailableError(pausedLiveError), true);
  assert.equal(summarizeAudioError(pausedLiveError), "Claude FM live stream is paused.");
});

test("player UI defaults to quiet volume and has buffering/login affordances", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync("src/index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const preload = fs.readFileSync("src/preload.js", "utf8");
  const renderer = fs.readFileSync("src/renderer.js", "utf8");
  const settingsHtml = fs.readFileSync("src/settings.html", "utf8");
  const settingsRenderer = fs.readFileSync("src/settingsRenderer.js", "utf8");

  assert.match(html, /id="volumeSlider"[\s\S]*value="20"/);
  assert.match(html, /id="liveLink"[\s\S]*href="https:\/\/www\.youtube\.com\/@claude\/live"[\s\S]*Cloud FM/);
  assert.match(html, /id="volumeIcon"[\s\S]*type="button"/);
  assert.match(html, /id="volumeIcon"[\s\S]*aria-label="静音"/);
  assert.match(html, /id="loginPopover"/);
  assert.match(html, /id="settingsButton"/);
  assert.match(html, /data-lucide="settings"/);
  assert.match(html, /已登录 不用重复登录咯~/);
  assert.match(html, /style-src 'self' 'unsafe-inline'/);
  assert.match(html, /vendor\/motion\.js/);
  assert.match(main, /node_modules[\s\S]*motion[\s\S]*dist[\s\S]*motion\.js/);
  assert.match(main, /shell\.openExternal\(url\)/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(css, /\.play-toggle\.is-buffering \.button-icon/);
  assert.match(css, /\.pixel-popover \{[\s\S]*top: 2px;/);
  assert.doesNotMatch(css, /bufferSpinStep/);
  assert.match(renderer, /className = "button-icon"/);
  assert.match(renderer, /querySelector\("\.button-icon"\)/);
  assert.match(renderer, /Motion\?\.animateMini \|\| window\.Motion\?\.animate/);
  assert.match(renderer, /transform: \["rotate\(0deg\)", "rotate\(360deg\)"\]/);
  assert.match(renderer, /ease: "easeOut"/);
  assert.doesNotMatch(renderer, /times: \[0, 0\.62, 1\]/);
  assert.match(renderer, /lastAudibleVolume = Number\(volumeSlider\.value\) \|\| 20/);
  assert.match(renderer, /volumeSaveQueue = Promise\.resolve\(\)/);
  assert.match(renderer, /window\.claudeFm\.saveSettings\(\{ volume \}\)/);
  assert.match(renderer, /function syncVolume\(\{ save = true \} = \{\}\)/);
  assert.match(renderer, /function restoreVolume\(\)/);
  assert.match(renderer, /window\.claudeFm\.getSettings\(\)/);
  assert.match(renderer, /syncVolume\(\{ save: false \}\)/);
  assert.match(renderer, /function toggleVolumeMute\(\)/);
  assert.match(renderer, /volumeSlider\.value = volume === 0 \? String\(lastAudibleVolume \|\| 20\) : "0"/);
  assert.match(renderer, /volumeIcon\.addEventListener\("click", toggleVolumeMute\)/);
  assert.match(renderer, /settingsButton\.addEventListener\("click"/);
  assert.match(renderer, /window\.claudeFm\.openSettings\(\)/);
  assert.match(renderer, /volumeIcon\.setAttribute\("aria-label", isMuted \? "恢复音量" : "静音"\)/);
  assert.match(renderer, /function setLiveLink\(nextVideoId\)/);
  assert.match(renderer, /liveLink\.href = `https:\/\/www\.youtube\.com\/watch\?v=\$\{encodeURIComponent\(nextVideoId\)\}`/);
  assert.match(renderer, /audio\.src = `\/audio\.mp3\?videoId=/);
  assert.doesNotMatch(renderer, /\/audio\.mp4/);
  assert.match(renderer, /window\.claudeFm\.preloadAudio\(videoId\)/);
  assert.match(renderer, /正在准备音频/);
  assert.match(renderer, /preload\.playable === false/);
  assert.match(renderer, /Claude FM 直播暂停中/);
  assert.match(preload, /preloadAudio: \(videoId\) => ipcRenderer\.invoke\("claude-fm:preload-audio", videoId\)/);
  assert.match(preload, /openSettings: \(\) => ipcRenderer\.invoke\("claude-fm:open-settings"\)/);
  assert.match(preload, /saveSettings: \(settings\) => ipcRenderer\.invoke\("claude-fm:save-settings", settings\)/);
  assert.match(settingsHtml, /id="proxyInput"/);
  assert.match(settingsHtml, /id="applySettings"/);
  assert.match(settingsHtml, /id="cancelSettings"/);
  assert.match(settingsRenderer, /window\.claudeFm\.getSettings\(\)/);
  assert.match(settingsRenderer, /window\.claudeFm\.saveSettings/);
  assert.match(settingsRenderer, /window\.claudeFm\.closeSettings\(\)/);
  assert.match(renderer, /showLoggedInPopover/);
  assert.match(renderer, /authNeedsRefresh/);
  assert.match(renderer, /isLoggedIn && !authNeedsRefresh/);
  assert.match(renderer, /clearRefresh: true/);
  assert.match(renderer, /invalidateAuth/);
  assert.match(renderer, /status\.refreshed/);
  assert.match(renderer, /openLogin\(\{\s*forceLogin: authNeedsRefresh\s*\}\)/);
  assert.match(renderer, /播放失败，请重新登录 YouTube/);
  assert.match(main, /AUDIO_INFO_CACHE_MS = 45_000/);
  assert.match(main, /appSettings = \{ \.\.\.DEFAULT_SETTINGS \}/);
  assert.match(main, /\.\.\.appSettings,[\s\S]*\.\.\.nextSettings/);
  assert.match(main, /warmAudioInfo\(live\.videoId\)/);
  assert.match(main, /getCookieFile: \(\) => ensureAuthCookieFile\(\{ proxyUrl: appSettings\.proxyUrl \}\)/);
  assert.match(main, /getAudioInfo: loadAudioInfo/);
  assert.match(main, /claude-fm:preload-audio/);
  assert.match(main, /settings\.html/);
  assert.match(main, /height: 260/);
  assert.match(main, /useContentSize: true/);
  assert.match(main, /center: true/);
  assert.match(main, /ready-to-show/);
  assert.match(main, /ipcMain\.handle\("claude-fm:open-settings", \(\) =>/);
  assert.doesNotMatch(main, /createSettingsWindow\(parent/);
  assert.doesNotMatch(main, /parent,/);
  assert.match(main, /session\.defaultSession\.setProxy/);
  assert.match(main, /net\.fetch/);
  assert.match(main, /proxyUrl: appSettings\.proxyUrl/);
  assert.match(main, /playable: isPlayableAudioInfo\(audioInfo\)/);
  assert.match(main, /isLiveUnavailableError\(error\)/);
  assert.match(main, /liveStatus: "unavailable"/);
});

test("package metadata supports Windows builds without committing artifacts", () => {
  const fs = require("node:fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const gitignore = fs.readFileSync(".gitignore", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.equal(pkg.scripts.dist, "electron-builder --win --x64");
  assert.equal(pkg.build.productName, "Claude FM Player");
  assert.equal(pkg.build.toolsets.winCodeSign, "1.1.0");
  assert.equal(pkg.build.win.icon, "assets/icon.png");
  assert.equal(pkg.build.win.signAndEditExecutable, false);
  assert.match(pkg.build.nsis.artifactName, /Setup/);
  assert.match(pkg.build.portable.artifactName, /Portable/);
  assert.ok(pkg.build.asarUnpack.includes("node_modules/ffmpeg-static/**"));
  assert.match(gitignore, /^dist\/$/m);
  assert.match(gitignore, /^cookies\.txt$/m);
  assert.match(main, /assets", "icon\.png"/);
  assert.match(main, /app\.getPath\("appData"\)[\s\S]*"claude-fm-player"[\s\S]*"chrome-auth"/);
});
