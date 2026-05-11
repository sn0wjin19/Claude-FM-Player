# Third-Party Notices

Claude FM Player uses open source packages at runtime and during builds.

## Runtime

- Electron: MIT
- ffmpeg-static: GPL-3.0-or-later
- Lucide: ISC
- Motion: MIT
- yt-dlp-exec: MIT

Packaged Windows builds include the `ffmpeg-static` executable so the player can proxy YouTube audio without requiring a separate system ffmpeg install. See the package license in `node_modules/ffmpeg-static` after `npm install`.

## Development and Packaging

- electron-builder: MIT

Dependency license files are installed under `node_modules/` after `npm install`.
