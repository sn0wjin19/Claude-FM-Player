const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVideoId,
  extractVideoIdFromHtml,
  resolveClaudeLiveVideoId
} = require("../src/youtube");
const {
  buildFfmpegArgs,
  buildWatchUrl,
  getYtDlpOptions,
  resolveAsarUnpackedPath,
  resolveFfmpegPath,
  resolveYtDlpPath,
  summarizeAudioError
} = require("../src/audioStream");
const {
  chromeCookiesToNetscape,
  configureChromeAuth,
  getLoginUrlForStatus,
  getAuthCookieFile,
  hasYouTubeLoginCookies,
  invalidateAuthStatus,
  readStoredAuthStatus,
  findChromeExecutable
} = require("../src/chromeAuth");
const {
  GENERATED_COOKIE_EXPIRY,
  isNetscapeCookieFile,
  parseCookieHeader
} = require("../src/cookies");

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
  assert.equal(buildWatchUrl("abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk");
  const options = await getYtDlpOptions({
    getCookieFile: async () => "C:\\auth\\youtube-cookies.txt"
  });
  assert.equal(options.cookies, "C:\\auth\\youtube-cookies.txt");
  assert.equal(options.cookiesFromBrowser, undefined);
  assert.match(options.format, /acodec\^=mp4a/);
  assert.equal(options.jsRuntimes, process.env.CLAUDE_FM_JS_RUNTIME || "node");

  const fallbackOptions = await getYtDlpOptions();
  assert.ok(fallbackOptions.cookies || fallbackOptions.cookiesFromBrowser);
  assert.equal(fallbackOptions.jsRuntimes, process.env.CLAUDE_FM_JS_RUNTIME || "node");

  const args = buildFfmpegArgs({
    audioCodec: "mp4a.40.2",
    headers: { Referer: "https://www.youtube.com/" },
    url: "https://example.com/audio"
  });

  assert.ok(args.includes("-headers"));
  assert.ok(args.includes("Referer: https://www.youtube.com/\r\n"));
  assert.ok(args.includes("https://example.com/audio"));
  assert.ok(args.includes("-codec:a"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-f"));
  assert.ok(args.includes("adts"));
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

test("chrome auth finds the first existing Chrome executable", () => {
  const chrome = findChromeExecutable({
    existsSync: (candidate) => candidate.endsWith("chrome.exe"),
    paths: ["missing.exe", "chrome.exe"]
  });

  assert.equal(chrome, "chrome.exe");
});

test("cookie helpers understand Netscape and request header formats", () => {
  assert.equal(isNetscapeCookieFile("# Netscape HTTP Cookie File\n"), true);

  const parsed = parseCookieHeader("Cookie: SID=abc=123; YSC=xyz");
  assert.equal(parsed.get("SID"), "abc=123");
  assert.equal(parsed.get("YSC"), "xyz");
  assert.equal(GENERATED_COOKIE_EXPIRY > Math.floor(Date.now() / 1000), true);
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
});

test("player UI defaults to quiet volume and has buffering/login affordances", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync("src/index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const renderer = fs.readFileSync("src/renderer.js", "utf8");

  assert.match(html, /id="volumeSlider"[\s\S]*value="20"/);
  assert.match(html, /id="loginPopover"/);
  assert.match(html, /已登录 不用重复登录咯~/);
  assert.match(html, /style-src 'self' 'unsafe-inline'/);
  assert.match(html, /vendor\/motion\.js/);
  assert.match(main, /node_modules[\s\S]*motion[\s\S]*dist[\s\S]*motion\.js/);
  assert.match(css, /\.play-toggle\.is-buffering \.button-icon/);
  assert.match(css, /\.pixel-popover \{[\s\S]*top: 2px;/);
  assert.doesNotMatch(css, /bufferSpinStep/);
  assert.match(renderer, /className = "button-icon"/);
  assert.match(renderer, /querySelector\("\.button-icon"\)/);
  assert.match(renderer, /Motion\?\.animateMini \|\| window\.Motion\?\.animate/);
  assert.match(renderer, /transform: \["rotate\(0deg\)", "rotate\(360deg\)"\]/);
  assert.match(renderer, /ease: "easeOut"/);
  assert.doesNotMatch(renderer, /times: \[0, 0\.62, 1\]/);
  assert.match(renderer, /showLoggedInPopover/);
  assert.match(renderer, /authNeedsRefresh/);
  assert.match(renderer, /isLoggedIn && !authNeedsRefresh/);
  assert.match(renderer, /clearRefresh: true/);
  assert.match(renderer, /invalidateAuth/);
  assert.match(renderer, /status\.refreshed/);
  assert.match(renderer, /openLogin\(\{\s*forceLogin: authNeedsRefresh\s*\}\)/);
  assert.match(renderer, /播放失败，请重新登录 YouTube/);
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
