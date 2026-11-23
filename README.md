# NMStudio

A client-side music player and creative listening space built with plain HTML, CSS, and vanilla JavaScript. No server, package manager, or build step is required.

## Run it

Open `index.html` in a modern browser, or use VS Code Live Server. Audio playback and uploaded-file persistence work best in a current Chromium, Firefox, or Safari browser.

## Create an account

Choose **Create account** on the sign-in screen and select a customer or admin role. Sign in with that local account on later visits; NMStudio asks you to sign in each time the page is opened.

## What’s included

- Searchable library, playlists, favorites, and recently played tracks.
- Built-in Web Audio synth previews, local audio files, and direct audio URLs.
- Playback queue, seek, volume, shuffle, repeat, a live visualizer, and three-band EQ.
- Studio controls for publishing audio, URLs, and synth previews, plus JSON backup and restore.
- Admin database dashboard with local-only status, connection configuration, backup controls, and a filterable storage inspector.
- Sign-in on each app launch, with visible logout actions on desktop and mobile.
- Nepali artist discovery links for Sujan Chapagain, Yabesh Thapa, Sabin Rai, and Purna Rai.
- Local browser storage using `localStorage` and IndexedDB where available.
- Keyboard controls: `/` focuses search, Space toggles playback, and Alt+Left/Right skips tracks.

## Local XAMPP database

NMStudio can use a local MySQL database through the PHP JSON API in `api.php`. The browser never connects directly to MySQL. Keep XAMPP's Apache and MySQL services running and put the project files at:

```text
C:\xampp\htdocs\nmstudio
```

You can copy the project contents there, or create a Windows directory junction from an Administrator or developer terminal:

```text
mklink /J C:\xampp\htdocs\nmstudio "C:\path\to\NM"
```

The API is configured for `127.0.0.1:3306`, database `nmstudio_db`, user `root`, and an empty password. Ensure PHP's `pdo_mysql` extension is enabled in XAMPP. The existing database should have `users` (`id`, `name`, `email`, `password_hash`, `role`, `created_at`), `tracks` (`id`, `title`, `artist`, `mood`, `source_type`, `audio_url`, `created_at`), and `playlists` (`id`, `user_id`, `name`, `track_ids`, `created_at`) tables. IDs should be auto-incrementing, and `track_ids` should be a JSON or text column.

Open [http://localhost/nmstudio/](http://localhost/nmstudio/) to use the app through XAMPP. Check the PHP/MySQL connection directly at [http://localhost/nmstudio/api.php?action=health](http://localhost/nmstudio/api.php?action=health); a working setup returns JSON with `"success": true` and `"status": "ok"`. The database dashboard's connection test also checks this API for the default local MySQL configuration.

The app loads server tracks and playlists when available and sends new or changed catalog entries to the API. Browser-local data remains available and is merged with the server catalog. If the API or database is unreachable, the app continues using `localStorage` and IndexedDB; local uploaded audio remains in IndexedDB and is not uploaded to MySQL. Account registration/login use the API when it responds, and use the existing device-local account store when the server is offline.

This endpoint is intended for local XAMPP development, not public hosting: it uses the default local root account, has no CSRF/session security layer, and registration accepts the selected role. Do not expose it to a network or use it for production authentication. A production deployment needs server-managed credentials, authorization, and transport security.

## Database & sync

The admin database dashboard includes a connection check for the local PHP API. Its optional full-backup push/pull and per-track adapter actions still require a separately installed trusted adapter:

A trusted integration can provide `window.NMStudioDbAdapter` before `js/databaseStudio.js` initializes:

```js
window.NMStudioDbAdapter = {
  async testConnection(config) {
    // Return true or { connected: true, latencyMs: 42 } only after verifying a real connection.
  },
  async pushBackup(backup, config) {
    // Return true or { success: true } only after the server confirms the write.
  },
  async pullBackup(config) {
    // Return a compatible NMStudio JSON backup (or { backup }).
  },
  async syncTrack(track, config) {
    // Optional per-track inspector action; return true or { success: true } after confirmation.
  }
};
```

The form saves non-secret connection fields in browser storage. Passwords/API tokens are not persisted; if an adapter is installed, a secret entered in the form is passed to it only when the user explicitly runs an adapter operation. Do not put real credentials or database connection code in public client-side files. Prefer a secured server-side API for production.

## Privacy and security

When using XAMPP, account and catalog metadata can be stored in the local MySQL database; otherwise accounts and music data stay in this browser. NMStudio asks you to sign in each time the page is opened. Local fallback sign-in and the self-selected account role are not secure authentication or access control. Uploaded audio is stored in this browser’s IndexedDB and is not uploaded to MySQL. A browser may restrict IndexedDB when opening a local file directly; XAMPP or Live Server can provide more consistent storage. Backups can contain your uploaded audio files, so store and share them carefully.

Direct audio URLs depend on the hosting server allowing playback. Browser security restrictions may prevent a cross-origin audio stream from being analyzed by the visualizer or EQ.

The Nepali artist links open YouTube Music or Spotify search results in a new tab. Streaming-service pages are not direct audio files, so they cannot be played by NMStudio’s in-app player.