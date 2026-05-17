const proxyInput = document.querySelector("#proxyInput");
const statusText = document.querySelector("#settingsStatus");
const applyButton = document.querySelector("#applySettings");
const cancelButton = document.querySelector("#cancelSettings");

function setStatus(message, kind = "") {
  statusText.textContent = message;
  statusText.dataset.kind = kind;
}

function setBusy(isBusy) {
  applyButton.disabled = isBusy;
  cancelButton.disabled = isBusy;
}

async function loadSettings() {
  try {
    const settings = await window.claudeFm.getSettings();
    proxyInput.value = settings.proxyUrl || "";
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("无法读取设置。", "error");
  }
}

async function applySettings() {
  setBusy(true);
  setStatus("正在应用设置...", "muted");

  try {
    await window.claudeFm.saveSettings({
      proxyUrl: proxyInput.value
    });
    await window.claudeFm.closeSettings();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "无法保存设置。", "error");
  } finally {
    setBusy(false);
  }
}

applyButton.addEventListener("click", applySettings);
cancelButton.addEventListener("click", () => {
  window.claudeFm.closeSettings();
});
proxyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applySettings();
  }
});

loadSettings();
