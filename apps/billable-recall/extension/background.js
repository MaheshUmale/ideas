const state = { tabId: undefined, host: undefined, startedAt: undefined, idle: false };

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((s) => {
  state.idle = s !== "active";
  if (state.idle) void flush();
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await flush();
  const tab = await chrome.tabs.get(tabId);
  await begin(tab);
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (tab.active && info.url) {
    await flush();
    await begin(tab);
  }
});

async function begin(tab) {
  if (state.idle || !tab.url) return;
  const host = new URL(tab.url).hostname;
  const { allowlist = [], paused = false } = await chrome.storage.local.get(["allowlist", "paused"]);
  if (paused) return;
  if (allowlist.includes(host)) {
    state.tabId = tab.id;
    state.host = host;
    state.startedAt = Date.now();
  }
}

async function flush() {
  if (state.host && state.startedAt) {
    const endedAt = Date.now();
    if (endedAt - state.startedAt >= 15_000) {
      const { intervals = [] } = await chrome.storage.local.get("intervals");
      intervals.push({ host: state.host, startedAt: state.startedAt, endedAt });
      await chrome.storage.local.set({ intervals });
    }
  }
  delete state.tabId;
  delete state.host;
  delete state.startedAt;
}
