(function () {
  'use strict';

  function isAvailable() {
    return window.location.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  async function request(action, method, body) {
    if (!isAvailable()) throw new Error('The local API is available only from localhost.');
    const controller = window.AbortController ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(function () { controller.abort(); }, 5000) : null;
    try {
      const response = await window.fetch('api.php?action=' + encodeURIComponent(action), {
        method: method || 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined
      });
      let result;
      try {
        result = await response.json();
      } catch (error) {
        const invalidResponse = new Error('The API returned an invalid JSON response.');
        invalidResponse.status = response.status;
        throw invalidResponse;
      }
      if (!response.ok || !result || result.success !== true) {
        const apiError = new Error(result && result.error ? result.error : 'The API request failed.');
        apiError.status = response.status;
        throw apiError;
      }
      return result.data;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }

  function toTrack(track) {
    const source = ['synth', 'local', 'url'].includes(track.source_type) ? track.source_type : 'database';
    const item = {
      id: String(track.id),
      remoteId: String(track.id),
      title: String(track.title || ''),
      artist: String(track.artist || 'Unknown artist'),
      album: 'Single',
      duration: 150,
      source: source,
      mood: String(track.mood || '')
    };
    if (source === 'url' && track.audio_url) item.url = String(track.audio_url);
    if (source === 'synth') item.synth = { base: 110, tempo: 94, scale: [0, 3, 7, 10, 12, 15], wave: 'triangle' };
    return item;
  }

  function toPlaylist(playlist) {
    let trackIds = playlist.track_ids;
    if (typeof trackIds === 'string') {
      try { trackIds = JSON.parse(trackIds); } catch (error) { trackIds = []; }
    }
    return {
      id: String(playlist.id),
      remoteId: String(playlist.id),
      name: String(playlist.name || ''),
      description: '',
      trackIds: Array.isArray(trackIds) ? trackIds.map(String) : []
    };
  }

  window.NMDBClient = {
    isAvailable: isAvailable,
    health: function () { return request('health', 'GET'); },
    getTracks: async function () { return (await request('tracks', 'GET')).map(toTrack); },
    saveTrack: function (track) {
      const source = track.source === 'synth' || track.source === 'local' || track.source === 'url' ? track.source : 'database';
      return request('tracks', 'POST', {
        id: track.remoteId || track.id,
        title: track.title,
        artist: track.artist || 'Unknown artist',
        mood: track.mood || '',
        source_type: source,
        audio_url: source === 'url' ? (track.url || track.audio_url || '') : ''
      });
    },
    deleteTrack: function (track) {
      return request('tracks', 'POST', { id: track.remoteId || track.id, title: track.title, artist: track.artist, deleted: true });
    },
    getPlaylists: async function () { return (await request('playlists', 'GET')).map(toPlaylist); },
    savePlaylist: function (playlist) {
      const currentUser = window.NMAuth && window.NMAuth.getCurrentUser();
      return request('playlists', 'POST', {
        id: playlist.remoteId || playlist.id,
        user_id: currentUser && /^\d+$/.test(String(currentUser.id)) ? currentUser.id : null,
        name: playlist.name,
        track_ids: (playlist.trackIds || []).map(function (id) {
          const track = window.NMStore && window.NMStore.getTrack(id);
          return track && track.remoteId ? track.remoteId : id;
        })
      });
    },
    deletePlaylist: function (playlist) {
      const currentUser = window.NMAuth && window.NMAuth.getCurrentUser();
      return request('playlists', 'POST', {
        id: playlist.remoteId || playlist.id,
        user_id: currentUser && /^\d+$/.test(String(currentUser.id)) ? currentUser.id : null,
        name: playlist.name,
        deleted: true
      });
    },
    signIn: function (email, password) {
      return request('login', 'POST', { email: email, password: password });
    },
    signUp: function (data) {
      return request('register', 'POST', data);
    }
  };
}());
