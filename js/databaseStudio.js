(function () {
  'use strict';
  const CONFIG_KEY = 'nmstudio_db_config_v1';
  const DEFAULT_PORTS = { postgresql: '5432', mysql: '3306', mongodb: '27017' };
  const ENGINE_LABELS = { postgresql: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', sqlite: 'SQLite' };
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  let lastSync = null;
  let hasSynced = false;
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function sourceType(track) {
    if (track.source === 'local' || track.audioId) return { key: 'local', label: 'Local Blob' };
    if (track.source === 'url' || track.url) return { key: 'url', label: 'Audio URL' };
    if (track.source === 'db' || track.source === 'database' || track.dbRecord) return { key: 'db', label: 'DB Record' };
    return { key: 'synth', label: 'Synth' };
  }

  function announce(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('visible'); }, 2800);
  }

  function updateHealth(status, label) {
    const pill = $('#dbHealthPill');
    pill.classList.remove('is-local', 'is-connecting', 'is-connected', 'is-fallback');
    pill.classList.add('is-' + status);
    $('#dbHealthText').textContent = label;
    $('#dbStatusTitle').textContent = status === 'connected' ? 'Database Server' : 'Local Browser Mode';
    $('#dbStatusDescription').textContent = status === 'connected'
      ? 'A database adapter confirmed the connection. Available sync actions depend on its capabilities.'
      : status === 'connecting'
        ? 'Checking the configured connection adapter. Your local library is unchanged.'
        : status === 'fallback'
          ? 'No adapter is installed or server sync could not be completed. Your local library remains available.'
          : 'Your library is saved on this device. No database server is connected.';
    $('#statStorage').textContent = hasSynced ? 'Local + DB' : 'Local';
  }

  function getFormConfig() {
    return {
      engine: $('#dbEngine').value,
      host: $('#dbHost').value.trim(),
      port: $('#dbPort').value.trim(),
      database: $('#dbName').value.trim(),
      username: $('#dbUsername').value.trim(),
      sqlitePath: $('#dbPath').value.trim()
    };
  }

  function adapterConfig() {
    const config = getFormConfig();
    const secret = $('#dbSecret').value;
    if (secret) config.secret = secret;
    return config;
  }

  function persistConfig(silent) {
    const config = Object.assign(getFormConfig(), { lastSync: lastSync });
    const saved = NMStorage.set(CONFIG_KEY, config);
    if (!saved) {
      $('#dbConnectionMessage').textContent = 'Could not save this config to browser storage. Nothing was sent to a server.';
      return false;
    }
    $('#dbConnectionMessage').textContent = 'Config saved on this device. Passwords and API tokens are not stored.';
    if (!silent) announce('Connection config saved locally. Secret was not saved.');
    return true;
  }

  function loadConfig() {
    const saved = NMStorage.get(CONFIG_KEY, null);
    if (!saved || typeof saved !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(ENGINE_LABELS, saved.engine)) {
      $('#dbEngine').value = saved.engine;
    }
    $('#dbHost').value = typeof saved.host === 'string' ? saved.host : '';
    $('#dbPort').value = typeof saved.port === 'string' || typeof saved.port === 'number' ? saved.port : (DEFAULT_PORTS[saved.engine] || '');
    $('#dbName').value = typeof saved.database === 'string' ? saved.database : '';
    $('#dbUsername').value = typeof saved.username === 'string' ? saved.username : '';
    $('#dbPath').value = typeof saved.sqlitePath === 'string' ? saved.sqlitePath : '';
    lastSync = typeof saved.lastSync === 'string' ? saved.lastSync : null;
    updateEngineFields(false);
    renderLastSync();
  }

  function renderLastSync() {
    const output = $('#dbLastSync');
    if (!lastSync) {
      output.textContent = 'Never';
      output.title = 'No server sync has completed on this device.';
      return;
    }
    const date = new Date(lastSync);
    output.textContent = Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
    output.title = lastSync;
  }

  function updateEngineFields(resetPort) {
    const engine = $('#dbEngine').value;
    $('#dbEngineBadge').textContent = (ENGINE_LABELS[engine] || 'Database').toUpperCase();
    const sqlite = engine === 'sqlite';
    $('#dbHostField').classList.toggle('hidden', sqlite);
    $('#dbPortField').classList.toggle('hidden', sqlite);
    $('#dbNameField').classList.toggle('hidden', sqlite);
    $('#dbPathField').classList.toggle('hidden', !sqlite);
    $('#dbName').required = !sqlite;
    $('#dbPath').required = sqlite;
    $('#dbHost').required = !sqlite;
    $('#dbPort').required = !sqlite;
    if (sqlite) {
      $('#dbNameLabel').textContent = 'Database name';
    } else {
      $('#dbNameLabel').textContent = 'Database name';
      if (resetPort || !$('#dbPort').value) $('#dbPort').value = DEFAULT_PORTS[engine] || '';
    }
  }

  function validateConfig() {
    const config = getFormConfig();
    if (config.engine === 'sqlite') {
      if (!config.sqlitePath) return 'Enter a SQLite file path before testing the adapter.';
      return '';
    }
    if (!config.host || !config.database) return 'Enter a host and database name before testing the adapter.';
    const port = Number(config.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Enter a valid port from 1 to 65535.';
    return '';
  }

  function setFeedback(element, message, tone) {
    element.textContent = message;
    element.classList.remove('is-error', 'is-success', 'is-info');
    element.classList.add('is-' + (tone || 'info'));
  }

  function hasAcknowledgement(result) {
    return result === true || Boolean(result && (result.success === true || result.connected === true));
  }

  function getAdapter(method) {
    const adapter = window.NMStudioDbAdapter;
    return adapter && typeof adapter[method] === 'function' ? adapter : null;
  }

  async function testConnection() {
    const message = $('#dbConnectionMessage');
    const validation = validateConfig();
    if (validation) {
      setFeedback(message, validation, 'error');
      return;
    }
    const adapter = getAdapter('testConnection');
    if (!adapter) {
      updateHealth('connecting', 'Connecting…');
      setFeedback(message, 'Checking adapter availability…', 'info');
      $('#dbTestConnection').disabled = true;
      $('#dbBannerTest').disabled = true;
      await new Promise(function (resolve) { window.setTimeout(resolve, 450); });
      $('#dbTestConnection').disabled = false;
      $('#dbBannerTest').disabled = false;
      updateHealth('fallback', 'Offline / Fallback');
      $('#dbLatency').textContent = 'N/A';
      setFeedback(message, 'No database adapter is installed. No network request was made; Local Browser Mode remains active.', 'error');
      announce('No server adapter is installed. Your local library is unchanged.');
      return;
    }
    updateHealth('connecting', 'Connecting…');
    setFeedback(message, 'Testing the configured adapter…', 'info');
    $('#dbTestConnection').disabled = true;
    $('#dbBannerTest').disabled = true;
    const started = performance.now();
    try {
      const result = await adapter.testConnection(adapterConfig());
      if (!hasAcknowledgement(result)) throw new Error('The adapter did not confirm a successful connection.');
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      const latency = result && Number.isFinite(result.latencyMs) ? Math.max(0, Math.round(result.latencyMs)) : elapsed;
      $('#dbLatency').textContent = latency + ' ms';
      updateHealth('connected', 'Connected');
      setFeedback(message, 'Adapter confirmed a connection in ' + latency + ' ms. Secrets remain only in this tab.', 'success');
      announce('Database adapter connection confirmed.');
    } catch (error) {
      updateHealth('fallback', 'Offline / Fallback');
      $('#dbLatency').textContent = Math.max(0, Math.round(performance.now() - started)) + ' ms';
      setFeedback(message, error.message || 'The adapter could not verify this connection. Local mode remains active.', 'error');
      announce('Connection test failed. Local Browser Mode remains available.');
    } finally {
      $('#dbTestConnection').disabled = false;
      $('#dbBannerTest').disabled = false;
    }
  }

  function requireAdmin() {
    const user = window.NMAuth && window.NMAuth.getCurrentUser();
    if (!user || user.role !== 'admin') {
      announce('Database and sync controls are available to accounts with the admin role.');
      return false;
    }
    return true;
  }

  function useLocalMode() {
    $('#dbSecret').value = '';
    hasSynced = false;
    updateHealth('local', 'Local Only');
    setFeedback($('#dbConnectionMessage'), 'Local-only mode is active. Saved connection settings are unchanged; no secret was saved.', 'info');
    setFeedback($('#dbSyncFeedback'), 'Server sync is paused. Your library remains on this device.', 'info');
    $('#dbLatency').textContent = 'N/A';
    announce('Local Browser Mode is active.');
  }

  function markSynced() {
    lastSync = new Date().toISOString();
    hasSynced = true;
    renderLastSync();
    persistConfig(true);
  }

  async function pushLocal() {
    if (!requireAdmin()) return;
    const adapter = getAdapter('pushBackup');
    if (!adapter) {
      updateHealth('fallback', 'Offline / Fallback');
      setFeedback($('#dbSyncFeedback'), 'Push unavailable: no database adapter with pushBackup() is installed. Local data was not changed.', 'error');
      announce('Push is unavailable without a server adapter.');
      return;
    }
    const button = $('#dbPushButton');
    button.disabled = true;
    setFeedback($('#dbSyncFeedback'), 'Preparing your local library backup…', 'info');
    try {
      const backup = await NMStore.exportBackup();
      const result = await adapter.pushBackup(backup, adapterConfig());
      if (!hasAcknowledgement(result)) throw new Error('The adapter did not confirm that the backup was stored.');
      markSynced();
      updateHealth('connected', 'Connected');
      setFeedback($('#dbSyncFeedback'), 'Adapter confirmed the local backup was pushed. Last sync time updated.', 'success');
      announce('Local backup pushed to the configured adapter.');
    } catch (error) {
      updateHealth('fallback', 'Offline / Fallback');
      setFeedback($('#dbSyncFeedback'), error.message || 'Push failed. Your local library is unchanged.', 'error');
      announce('Push failed. Your local library is unchanged.');
    } finally {
      button.disabled = false;
    }
  }

  async function pullRemote() {
    if (!requireAdmin()) return;
    const adapter = getAdapter('pullBackup');
    if (!adapter) {
      updateHealth('fallback', 'Offline / Fallback');
      setFeedback($('#dbSyncFeedback'), 'Pull unavailable: no database adapter with pullBackup() is installed. Local data was not changed.', 'error');
      announce('Pull is unavailable without a server adapter.');
      return;
    }
    if (!window.confirm('Pulling a server backup replaces the library, playlists, favorites, and listening settings on this device. Continue?')) return;
    const button = $('#dbPullButton');
    button.disabled = true;
    setFeedback($('#dbSyncFeedback'), 'Requesting a backup from the configured adapter…', 'info');
    try {
      const response = await adapter.pullBackup(adapterConfig());
      const backup = response && response.backup ? response.backup : response;
      const result = await NMStore.importBackup(backup);
      markSynced();
      updateHealth('connected', 'Connected');
      window.dispatchEvent(new CustomEvent('nmadminrender'));
      setFeedback($('#dbSyncFeedback'), result.audioPersisted ? 'Server backup restored to this device.' : 'Backup restored, but some audio may only be available for this session.', result.audioPersisted ? 'success' : 'error');
      announce(result.audioPersisted ? 'Server backup restored.' : 'Backup restored with an audio storage warning.');
    } catch (error) {
      updateHealth('fallback', 'Offline / Fallback');
      setFeedback($('#dbSyncFeedback'), error.message || 'Pull failed. Your local library was not replaced.', 'error');
      announce('Pull failed. Your local library was not replaced.');
    } finally {
      button.disabled = false;
    }
  }

  async function syncTrack(trackId, button) {
    if (!requireAdmin()) return;
    const adapter = getAdapter('syncTrack');
    const track = NMStore.getTrack(trackId);
    if (!track) {
      announce('That track is no longer in the local catalog.');
      return;
    }
    if (!adapter) {
      announce('Track sync is unavailable without an adapter that implements syncTrack().');
      return;
    }
    button.disabled = true;
    try {
      const result = await adapter.syncTrack(track, adapterConfig());
      if (!hasAcknowledgement(result)) throw new Error('The adapter did not confirm that the track was synced.');
      markSynced();
      updateHealth('connected', 'Connected');
      setFeedback($('#dbSyncFeedback'), 'Adapter confirmed “' + track.title + '” was synced.', 'success');
      announce('Track synced through the configured adapter.');
    } catch (error) {
      updateHealth('fallback', 'Offline / Fallback');
      setFeedback($('#dbSyncFeedback'), error.message || 'Track sync failed. Your local track is unchanged.', 'error');
      announce('Track sync failed. Your local track is unchanged.');
    } finally {
      button.disabled = false;
    }
  }

  function renderInspector() {
    const tracks = NMStore.getTracks();
    const playlists = NMStore.getPlaylists();
    const likedIds = NMStore.getLikedIds();
    $('#statTracks').textContent = String(tracks.length);
    $('#statPlaylists').textContent = String(playlists.length);
    $('#statLiked').textContent = String(likedIds.length);
    $('#catalogCount').textContent = tracks.length + (tracks.length === 1 ? ' TRACK' : ' TRACKS');
    const query = $('#catalogFilter').value.trim().toLowerCase();
    const sourceFilter = $('#catalogSourceFilter').value;
    const filtered = tracks.filter(function (track) {
      const source = sourceType(track);
      const matchesQuery = [track.title, track.artist, track.album].some(function (value) {
        return String(value || '').toLowerCase().includes(query);
      });
      return matchesQuery && (sourceFilter === 'all' || source.key === sourceFilter);
    });
    const list = $('#catalogRows');
    if (!filtered.length) {
      list.innerHTML = '<div class="db-inspector-empty" role="listitem"><strong>' + (tracks.length ? 'No tracks match these filters' : 'No tracks in your catalog yet') + '</strong><span>' + (tracks.length ? 'Try another search or source type.' : 'Publish a track above to see it here.') + '</span></div>';
      return;
    }
    const canSync = Boolean(getAdapter('syncTrack'));
    list.innerHTML = filtered.map(function (track) {
      const source = sourceType(track);
      const album = track.album || (source.key === 'synth' ? 'Studio original' : 'Single');
      return '<div class="db-catalog-row" role="listitem">' +
        '<span class="db-track-cell"><strong>' + escapeHtml(track.title) + '</strong><small>' + escapeHtml(track.artist || 'Unknown artist') + '</small></span>' +
        '<span class="db-album-cell">' + escapeHtml(album) + '</span>' +
        '<span><span class="db-source-tag db-source-' + source.key + '">' + source.label + '</span></span>' +
        '<span class="db-row-actions">' +
          '<button class="db-row-sync" type="button" data-sync-track="' + escapeHtml(track.id) + '"' + (canSync ? '' : ' disabled title="Requires an adapter with syncTrack()"') + '>Sync</button>' +
          '<button class="db-row-delete" type="button" data-delete-track="' + escapeHtml(track.id) + '" aria-label="Remove ' + escapeHtml(track.title) + '" title="Remove from local catalog">Delete</button>' +
        '</span></div>';
    }).join('');
  }

  function init() {
    if (!$('#dbConfigForm')) return;
    loadConfig();
    updateEngineFields(false);
    updateHealth('local', 'Local Only');
    $('#dbLatency').textContent = 'N/A';
    $('#dbEngine').addEventListener('change', function () { updateEngineFields(true); });
    $('#dbConfigForm').addEventListener('submit', function (event) {
      event.preventDefault();
      persistConfig();
    });
    $('#dbTestConnection').addEventListener('click', testConnection);
    $('#dbBannerTest').addEventListener('click', testConnection);
    $('#dbUseLocal').addEventListener('click', useLocalMode);
    $('#dbBannerLocal').addEventListener('click', useLocalMode);
    $('#dbSecretToggle').addEventListener('click', function () {
      const visible = $('#dbSecret').type === 'password';
      $('#dbSecret').type = visible ? 'text' : 'password';
      $('#dbSecretToggle').textContent = visible ? 'Hide' : 'Show';
      $('#dbSecretToggle').setAttribute('aria-label', visible ? 'Hide password or API token' : 'Show password or API token');
      $('#dbSecretToggle').setAttribute('aria-pressed', String(visible));
    });
    $('#dbPushButton').addEventListener('click', pushLocal);
    $('#dbPullButton').addEventListener('click', pullRemote);
    $('#catalogFilter').addEventListener('input', renderInspector);
    $('#catalogSourceFilter').addEventListener('change', renderInspector);
    $('#catalogRows').addEventListener('click', function (event) {
      const button = event.target.closest('[data-sync-track]');
      if (button && !button.disabled) syncTrack(button.dataset.syncTrack, button);
    });
    window.addEventListener('nmadminrender', renderInspector);
  }

  document.addEventListener('DOMContentLoaded', init);
}());
