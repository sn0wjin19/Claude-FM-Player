const button = document.querySelector("#playToggle");
const statusText = document.querySelector("#status");
const audio = document.querySelector("#audio");
const loginButton = document.querySelector("#loginButton");
const loginPopover = document.querySelector("#loginPopover");
const volumeIcon = document.querySelector("#volumeIcon");
const volumeSlider = document.querySelector("#volumeSlider");

let videoId;
let audioLoadedForVideoId;
let loginPollTimer;
let loginPopoverTimer;
let isLoggedIn = false;
let authNeedsRefresh = false;
let bufferAnimation;

function renderIcons() {
  window.lucide?.createIcons({ icons: window.lucide.icons });
}

function stopBufferAnimation() {
  if (bufferAnimation) {
    if (typeof bufferAnimation.cancel === "function") {
      bufferAnimation.cancel();
    } else if (typeof bufferAnimation.stop === "function") {
      bufferAnimation.stop();
    }
    bufferAnimation = null;
  }

  const currentIconHost = button.querySelector(".button-icon");
  if (currentIconHost) {
    currentIconHost.style.transform = "";
    currentIconHost.style.transformOrigin = "";
  }
}

function startBufferAnimation() {
  const currentIconHost = button.querySelector(".button-icon");
  const animate = window.Motion?.animateMini || window.Motion?.animate;

  if (!currentIconHost || typeof animate !== "function") {
    return;
  }

  currentIconHost.style.transformOrigin = "50% 50%";
  bufferAnimation = animate(
    currentIconHost,
    { transform: ["rotate(0deg)", "rotate(360deg)"] },
    {
      duration: 1.2,
      ease: "easeOut",
      repeat: Infinity
    }
  );
}

function setButton(iconName, label, disabled = false) {
  const isBuffering = iconName === "loader-circle";
  stopBufferAnimation();
  button.textContent = "";
  const iconHost = document.createElement("span");
  iconHost.className = "button-icon";
  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  iconHost.append(icon);
  button.append(iconHost);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.disabled = disabled;
  button.classList.toggle("is-buffering", isBuffering);
  renderIcons();

  if (isBuffering) {
    startBufferAnimation();
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function setIcon(target, iconName) {
  target.textContent = "";
  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  target.append(icon);
  renderIcons();
}

function setVolumeIcon() {
  const volume = Number(volumeSlider.value);
  setIcon(volumeIcon, volume === 0 ? "volume-x" : "volume-2");
}

function syncVolume() {
  audio.volume = Number(volumeSlider.value) / 100;
  setVolumeIcon();
}

function setLoginButton(nextIsLoggedIn) {
  isLoggedIn = Boolean(nextIsLoggedIn);
  const showLoggedIn = isLoggedIn && !authNeedsRefresh;
  setIcon(loginButton, showLoggedIn ? "user-check" : "user-round");
  loginButton.classList.toggle("is-authed", showLoggedIn);
  loginButton.setAttribute(
    "aria-label",
    authNeedsRefresh
      ? "重新登录 YouTube"
      : showLoggedIn
        ? "YouTube 已登录"
        : "登录 YouTube"
  );
  loginButton.title = authNeedsRefresh
    ? "重新登录 YouTube"
    : showLoggedIn
      ? "YouTube 已登录"
      : "登录 YouTube";
}

function markAuthNeedsRefresh() {
  authNeedsRefresh = true;
  invalidateStoredAuth();
  setLoginButton(false);
}

function showLoggedInPopover() {
  loginPopover.hidden = false;
  clearTimeout(loginPopoverTimer);
  loginPopoverTimer = setTimeout(() => {
    loginPopover.hidden = true;
  }, 2400);
}

async function updateAuthStatus({ clearRefresh = false, refresh = false } = {}) {
  try {
    const status = refresh
      ? await window.claudeFm.refreshAuthStatus()
      : await window.claudeFm.getAuthStatus();
    if (clearRefresh && status.isLoggedIn && status.refreshed) {
      authNeedsRefresh = false;
    }
    setLoginButton(Boolean(status.isLoggedIn));
    return status;
  } catch (error) {
    console.error(error);
    setLoginButton(false);
    return { isLoggedIn: false };
  }
}

async function invalidateStoredAuth() {
  try {
    await window.claudeFm.invalidateAuth();
  } catch (error) {
    console.error(error);
  }
}

function startLoginPolling() {
  clearInterval(loginPollTimer);

  let remainingChecks = 40;
  loginPollTimer = setInterval(async () => {
    const status = await updateAuthStatus({
      clearRefresh: true,
      refresh: true
    });
    if ((status.isLoggedIn && !authNeedsRefresh) || remainingChecks-- <= 0) {
      clearInterval(loginPollTimer);
      loginPollTimer = null;
      if (status.isLoggedIn) {
        setStatus("YouTube 登录已刷新");
      }
    }
  }, 3000);
}

async function resolveLive() {
  setButton("loader-circle", "加载中", true);
  setStatus("正在寻找 Claude FM");

  try {
    const result = await window.claudeFm.resolveLive();
    videoId = result.videoId;
    setButton("play", "播放");
    setStatus("Claude FM 已就绪");
  } catch (error) {
    console.error(error);
    setButton("rotate-cw", "重试");
    setStatus("暂时找不到直播");
  }
}

function stopAudioStream() {
  audio.pause();
  audioLoadedForVideoId = null;
  audio.removeAttribute("src");
  audio.load();
}

function loadAudio(force = false) {
  if (!force && audioLoadedForVideoId === videoId) {
    return;
  }

  audio.pause();
  audio.src = `/audio.mp3?videoId=${encodeURIComponent(videoId)}&t=${Date.now()}`;
  audioLoadedForVideoId = videoId;
}

async function play() {
  if (!videoId) {
    await resolveLive();
  }

  if (!videoId) {
    return;
  }

  loadAudio(true);
  setButton("loader-circle", "连接中", true);
  setStatus("正在连接音频");

  try {
    await audio.play();
    setButton("pause", "暂停");
    setStatus("正在播放");
  } catch (error) {
    console.error(error);
    stopAudioStream();
    markAuthNeedsRefresh();
    setButton("rotate-cw", "重试");
    setStatus("播放失败，请重新登录 YouTube");
  }
}

button.addEventListener("click", () => {
  if (!audio.paused) {
    stopAudioStream();
    setButton("play", "播放");
    setStatus("已暂停");
    return;
  }

  play();
});

audio.addEventListener("playing", () => {
  authNeedsRefresh = false;
  updateAuthStatus();
  setButton("pause", "暂停");
  setStatus("正在播放");
});

audio.addEventListener("waiting", () => {
  setButton("loader-circle", "连接中", true);
  setStatus("正在缓冲");
});

audio.addEventListener("pause", () => {
  setButton("play", "播放");
  setStatus("已暂停");
});

audio.addEventListener("error", () => {
  audioLoadedForVideoId = null;
  markAuthNeedsRefresh();
  setButton("rotate-cw", "重试");
  setStatus("播放失败，请重新登录 YouTube");
});

volumeSlider.addEventListener("input", syncVolume);
loginButton.addEventListener("click", async () => {
  if (isLoggedIn && !authNeedsRefresh) {
    showLoggedInPopover();
    return;
  }

  loginButton.disabled = true;
  setStatus(authNeedsRefresh ? "正在打开 YouTube 重新登录页" : "正在打开 YouTube 登录页");
  try {
    if (authNeedsRefresh) {
      await invalidateStoredAuth();
    }
    const status = await window.claudeFm.openLogin({
      forceLogin: authNeedsRefresh
    });
    if (status.isLoggedIn && status.refreshed) {
      authNeedsRefresh = false;
    }
    const refreshedStatus = status.refreshed
      ? status
      : await updateAuthStatus({ clearRefresh: true, refresh: true });
    setLoginButton(Boolean(refreshedStatus.isLoggedIn));
    setStatus(
      refreshedStatus.isLoggedIn && !authNeedsRefresh
        ? "YouTube 登录已刷新"
        : authNeedsRefresh
          ? "请在 Chrome 窗口重新登录 YouTube"
          : "请在 Chrome 窗口登录 YouTube"
    );
    startLoginPolling();
  } catch (error) {
    console.error(error);
    setStatus("无法打开 Chrome 登录");
  } finally {
    loginButton.disabled = false;
  }
});
syncVolume();
renderIcons();
updateAuthStatus();
resolveLive();
