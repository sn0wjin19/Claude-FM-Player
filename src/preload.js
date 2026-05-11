const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudeFm", {
  getAuthStatus: () => ipcRenderer.invoke("claude-fm:get-auth-status"),
  invalidateAuth: () => ipcRenderer.invoke("claude-fm:invalidate-auth"),
  openLogin: (options) => ipcRenderer.invoke("claude-fm:open-login", options),
  preloadAudio: (videoId) => ipcRenderer.invoke("claude-fm:preload-audio", videoId),
  refreshAuthStatus: () => ipcRenderer.invoke("claude-fm:refresh-auth-status"),
  resolveLive: () => ipcRenderer.invoke("claude-fm:resolve-live")
});
