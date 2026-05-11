const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudeFm", {
  getAuthStatus: () => ipcRenderer.invoke("claude-fm:get-auth-status"),
  openLogin: () => ipcRenderer.invoke("claude-fm:open-login"),
  refreshAuthStatus: () => ipcRenderer.invoke("claude-fm:refresh-auth-status"),
  resolveLive: () => ipcRenderer.invoke("claude-fm:resolve-live")
});
