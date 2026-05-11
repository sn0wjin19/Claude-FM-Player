# Claude FM Player

[简体中文](./README.zh-CN.md)

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Runtime](https://img.shields.io/badge/runtime-Electron-47848f)
![License](https://img.shields.io/badge/license-MIT-green)

A tiny Windows desktop player for the Claude FM YouTube live stream.

Claude FM Player is intentionally small: one window, one stream, play/pause, a
volume slider, and a YouTube login control when YouTube requires an
authenticated session. It resolves the current Claude FM livestream at startup
and plays the live audio directly, reconnecting to the latest live position
whenever playback is resumed.

## Highlights

- Resolves the current Claude FM livestream from `https://www.youtube.com/@claude/live`.
- Plays the YouTube livestream audio only, with no embedded browser playback UI.
- Keeps the interface compact: play/pause, volume, status, and YouTube login.
- Defaults to 20% volume for a gentler first launch.
- Reconnects on resume so playback jumps to the latest live audio position.
- Uses a dedicated Chrome profile for YouTube login instead of reading your
  personal Chrome Default profile.
- Supports a local Netscape-format `cookies.txt` fallback for advanced users.
- Prefers YouTube AAC audio and streams it through ffmpeg without MP3
  re-encoding.
- Ships Windows installer and portable builds with the project icon from
  `assets/icon.png`.

## How It Works

The app is an Electron shell around a small local audio service:

1. The main process resolves the active Claude FM video ID.
2. `yt-dlp` selects the best available audio stream, preferring AAC.
3. `ffmpeg` remuxes the selected stream into browser-playable AAC over a local
   `/audio.mp3` endpoint.
4. The renderer uses a normal HTML audio element for playback and reconnects on
   resume to stay close to the live edge.

For packaged Windows builds, native binaries from `ffmpeg-static` and
`yt-dlp-exec` are unpacked from Electron's ASAR archive before execution.

## Requirements

- Windows
- Node.js and npm for development
- Google Chrome for the in-app YouTube login flow

The packaged app bundles Electron, ffmpeg, and yt-dlp. Chrome is only needed
when YouTube asks for an authenticated session.

## Getting Started

Install dependencies and launch the development app:

```powershell
npm install
npm start
```

Run the test suite:

```powershell
npm test
```

## YouTube Authentication

YouTube can occasionally require login cookies before it will expose a playable
audio stream. Claude FM Player supports two authentication paths.

### Dedicated Chrome Profile

Click the user icon in the app. The player opens a dedicated Chrome profile for
YouTube login and exports only the cookies needed by the audio resolver. This
profile is separate from your everyday Chrome Default profile.

If playback fails because cookies are stale, the app invalidates the exported
cookie file and asks you to refresh the login.

### Local Cookies File

Advanced users can place a Netscape-format `cookies.txt` file in the project
root. The file is ignored by Git and should never be committed.

## Building

Create an unpacked Windows app directory:

```powershell
npm run pack
```

Create the Windows x64 installer and portable executable:

```powershell
npm run dist
```

Build artifacts are written to `dist/`, which is intentionally ignored by Git.

## Project Layout

```text
assets/              Application icon and build resources
src/main.js          Electron main process, local server, IPC handlers
src/renderer.js      Player UI and playback interactions
src/audioStream.js   yt-dlp and ffmpeg audio pipeline
src/chromeAuth.js    Dedicated Chrome profile login and cookie export
src/cookies.js       cookies.txt parsing helpers
src/youtube.js       Claude FM livestream resolution
test/                Node test suite
```

## Troubleshooting

### Portable build asks me to log in even though development works

Make sure you are running the latest portable build. The app uses a stable
`claude-fm-player` auth profile so development and packaged builds read the same
exported YouTube cookies.

### Playback fails after a successful login

YouTube cookies can expire or rotate. Click the user icon and refresh the login
from the dedicated Chrome window. The player will discard stale exported cookies
after an auth-related playback failure.

### Audio quality sounds wrong

The player prefers AAC and remuxes it with ffmpeg instead of re-encoding to MP3.
If the stream still sounds degraded, it is usually caused by the source stream,
temporary YouTube delivery behavior, or the selected live audio rendition.

### Custom ffmpeg path

Set `CLAUDE_FM_FFMPEG_PATH` to force the app to use a specific ffmpeg binary.

## Security and Privacy

- The app does not read your personal Chrome Default profile.
- The dedicated Chrome profile is stored locally under the app auth directory.
- Cookie exports are local files used only to let `yt-dlp` access the YouTube
  audio stream.
- `cookies.txt` is ignored by Git and should be treated as secret material.

## License

Claude FM Player is released under the [MIT License](./LICENSE).

Third-party dependency notices are available in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
