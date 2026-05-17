const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudeFm", {
  closeSettings: () => ipcRenderer.invoke("claude-fm:close-settings"),
  getAuthStatus: () => ipcRenderer.invoke("claude-fm:get-auth-status"),
  getSettings: () => ipcRenderer.invoke("claude-fm:get-settings"),
  invalidateAuth: () => ipcRenderer.invoke("claude-fm:invalidate-auth"),
  openLogin: (options) => ipcRenderer.invoke("claude-fm:open-login", options),
  openSettings: () => ipcRenderer.invoke("claude-fm:open-settings"),
  preloadAudio: (videoId) => ipcRenderer.invoke("claude-fm:preload-audio", videoId),
  refreshAuthStatus: () => ipcRenderer.invoke("claude-fm:refresh-auth-status"),
  resolveLive: () => ipcRenderer.invoke("claude-fm:resolve-live"),
  saveSettings: (settings) => ipcRenderer.invoke("claude-fm:save-settings", settings)
});
