const CLAUDE_LIVE_URL = "https://www.youtube.com/@claude/live";

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.replace("/", "");
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    const watchId = parsed.searchParams.get("v");
    if (watchId && VIDEO_ID_PATTERN.test(watchId)) {
      return watchId;
    }

    const embedMatch = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    return embedMatch ? embedMatch[1] : null;
  } catch {
    return null;
  }
}

function extractVideoIdFromHtml(html) {
  const currentVideoIndex = html.indexOf('"currentVideoEndpoint"');
  if (currentVideoIndex >= 0) {
    const currentVideoData = html.slice(currentVideoIndex, currentVideoIndex + 5000);
    const currentVideoMatch = currentVideoData.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (currentVideoMatch) {
      return currentVideoMatch[1];
    }
  }

  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})["']/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})["']/i,
    /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

async function resolveClaudeLiveVideoId({
  fetchImpl = fetch,
  liveUrl = CLAUDE_LIVE_URL,
  signal
} = {}) {
  const response = await fetchImpl(liveUrl, {
    redirect: "follow",
    signal,
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube returned ${response.status}`);
  }

  const finalUrl = response.url || liveUrl;
  const idFromUrl = extractVideoId(finalUrl);
  if (idFromUrl) {
    return { videoId: idFromUrl, sourceUrl: finalUrl };
  }

  const html = await response.text();
  const idFromHtml = extractVideoIdFromHtml(html);
  if (!idFromHtml) {
    throw new Error("Could not find an active Claude FM live video.");
  }

  return { videoId: idFromHtml, sourceUrl: finalUrl };
}

module.exports = {
  CLAUDE_LIVE_URL,
  extractVideoId,
  extractVideoIdFromHtml,
  resolveClaudeLiveVideoId
};
