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

## Database & sync

The admin dashboard starts in **Local Browser Mode** and does not attempt to contact PostgreSQL, MySQL, MongoDB, or SQLite. Browsers cannot safely connect directly to those database servers from a static page, so connection tests and push/pull require a trusted adapter. Without one, the dashboard reports that no connection was made and leaves local data unchanged.

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

Accounts and music data stay in this browser; this app does not connect to a backend. NMStudio asks you to sign in each time the page is opened; logging out or closing/reloading the page ends the local session without deleting your library or account. Local sign-in and the self-selected account role are not secure authentication or access control. Uploaded audio is stored in this browser’s IndexedDB and is not uploaded to a server. A browser may restrict IndexedDB when opening a local file directly; Live Server can provide more consistent storage in that case. Backups can contain your uploaded audio files, so store and share them carefully.

Direct audio URLs depend on the hosting server allowing playback. Browser security restrictions may prevent a cross-origin audio stream from being analyzed by the visualizer or EQ.

The Nepali artist links open YouTube Music or Spotify search results in a new tab. Streaming-service pages are not direct audio files, so they cannot be played by NMStudio’s in-app player.