(function () {
  'use strict';
  const STATE_KEY = 'nmstudio_state_v1';
  const seedTracks = [
    { id: 'seed-horizon', title: 'Emerald Horizon', artist: 'NM Studio', album: 'Green Line Sessions', duration: 150, source: 'synth', synth: { base: 110, tempo: 94, scale: [0, 3, 7, 10, 12, 15], wave: 'triangle' } },
    { id: 'seed-focus', title: 'Midnight Focus', artist: 'Koda Beats', album: 'Deep Work Vol. 1', duration: 180, source: 'synth', synth: { base: 130.81, tempo: 102, scale: [0, 2, 4, 7, 9, 12], wave: 'sine' } },
    { id: 'seed-neon', title: 'Neon Sprint', artist: 'Hyperion', album: 'Pulse & Drive', duration: 156, source: 'synth', synth: { base: 98, tempo: 126, scale: [0, 3, 5, 7, 10, 12], wave: 'sawtooth' } },
    { id: 'seed-rain', title: 'Rain on Glass', artist: 'Aether Drift', album: 'Ambient Sketches', duration: 192, source: 'synth', synth: { base: 146.83, tempo: 78, scale: [0, 4, 7, 11, 14], wave: 'sine' } },
    { id: 'seed-solaris', title: 'Solaris Drift', artist: 'Luna V', album: 'Orbitals', duration: 168, source: 'synth', synth: { base: 164.81, tempo: 96, scale: [0, 2, 5, 7, 9, 12], wave: 'triangle' } },
    { id: 'seed-runner', title: 'Synthwave Runner', artist: 'Vortex 84', album: 'Night City', duration: 164, source: 'synth', synth: { base: 82.41, tempo: 122, scale: [0, 3, 7, 8, 10, 12], wave: 'sawtooth' } }
  ];
  const seedPlaylists = [
    { id: 'mix-focus', name: 'Chill & Focus', description: 'Quiet electronic grooves for a clearer head.', trackIds: ['seed-horizon', 'seed-focus', 'seed-rain'] },
    { id: 'mix-energy', name: 'High Energy', description: 'Bright tempos to keep you moving.', trackIds: ['seed-neon', 'seed-solaris', 'seed-runner'] }
  ];
  let state;

  function makeId(prefix) {
    return prefix + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  function persist() {
    const saved = NMStorage.set(STATE_KEY, state);
    return saved;
  }

  function saveRemote(method, item) {
    if (!window.NMDBClient || !window.NMDBClient.isAvailable()) return;
    window.NMDBClient[method](item).then(function (result) {
      if (result && result.id && (method === 'saveTrack' || method === 'savePlaylist')) {
        item.remoteId = String(result.id);
        persist();
      }
    }).catch(function (error) {
      console.warn('NMStudio could not sync ' + method + ' with the local API:', error);
    });
  }

  function mergeRemote(localItems, remoteItems, sameItem) {
    const merged = remoteItems.slice();
    localItems.forEach(function (localItem) {
      const index = merged.findIndex(function (remoteItem) { return sameItem(localItem, remoteItem); });
      if (index < 0) merged.push(localItem);
      else merged[index] = Object.assign({}, merged[index], localItem);
    });
    return merged;
  }

  async function syncRemote() {
    if (!window.NMDBClient || !window.NMDBClient.isAvailable()) return false;
    try {
      const results = await Promise.all([window.NMDBClient.getTracks(), window.NMDBClient.getPlaylists()]);
      state.tracks = mergeRemote(state.tracks, results[0], function (local, remote) {
        return local.id === remote.id ||
          (local.title.trim().toLowerCase() === remote.title.trim().toLowerCase() &&
            String(local.artist || '').trim().toLowerCase() === String(remote.artist || '').trim().toLowerCase());
      });
      state.playlists = mergeRemote(state.playlists, results[1], function (local, remote) {
        return local.id === remote.id || local.name.trim().toLowerCase() === remote.name.trim().toLowerCase();
      });
      persist();
      window.dispatchEvent(new CustomEvent('nmdatachange'));
      return true;
    } catch (error) {
      console.warn('NMStudio is using its local library because the API could not be reached:', error);
      return false;
    }
  }

  function init() {
    const saved = NMStorage.get(STATE_KEY, null);
    if (saved && Array.isArray(saved.tracks) && Array.isArray(saved.playlists)) {
      state = {
        tracks: saved.tracks.filter(function (track) { return track && typeof track.id === 'string' && typeof track.title === 'string'; }),
        playlists: saved.playlists.filter(function (playlist) { return playlist && typeof playlist.id === 'string' && typeof playlist.name === 'string'; }),
        likes: Array.isArray(saved.likes) ? saved.likes : [],
        recent: Array.isArray(saved.recent) ? saved.recent : [],
        volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.72,
        shuffle: Boolean(saved.shuffle),
        repeat: ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off',
        eq: saved.eq && typeof saved.eq === 'object' ? saved.eq : { low: 0, mid: 0, high: 0 }
      };
    } else {
      state = { tracks: seedTracks.map(function (track) { return Object.assign({}, track); }), playlists: seedPlaylists.map(function (list) { return Object.assign({}, list, { trackIds: list.trackIds.slice() }); }), likes: ['seed-horizon'], recent: [], volume: 0.72, shuffle: false, repeat: 'off', eq: { low: 0, mid: 0, high: 0 } };
      persist();
    }
    syncRemote();
  }

  function addTrack(track) {
    const item = Object.assign({ id: makeId('track'), album: 'Single', duration: 150, source: 'synth' }, track);
    state.tracks.unshift(item);
    persist();
    saveRemote('saveTrack', item);
    return item;
  }

  function addPlaylist(name, description) {
    const playlist = { id: makeId('playlist'), name: String(name).trim(), description: String(description || '').trim() || 'A collection of your favorites.', trackIds: [] };
    state.playlists.unshift(playlist);
    persist();
    saveRemote('savePlaylist', playlist);
    return playlist;
  }

  function togglePlaylistTrack(playlistId, trackId) {
    const playlist = state.playlists.find(function (item) { return item.id === playlistId; });
    if (!playlist) throw new Error('This playlist no longer exists.');
    const index = playlist.trackIds.indexOf(trackId);
    if (index >= 0) playlist.trackIds.splice(index, 1);
    else playlist.trackIds.push(trackId);
    persist();
    saveRemote('savePlaylist', playlist);
    return index < 0;
  }

  function deletePlaylist(id) {
    const playlist = state.playlists.find(function (item) { return item.id === id; });
    state.playlists = state.playlists.filter(function (playlist) { return playlist.id !== id; });
    persist();
    if (playlist) saveRemote('deletePlaylist', playlist);
  }

  function toggleLike(id) {
    const index = state.likes.indexOf(id);
    if (index >= 0) state.likes.splice(index, 1);
    else state.likes.unshift(id);
    persist();
    return index < 0;
  }

  function removeTrack(id) {
    const track = state.tracks.find(function (item) { return item.id === id; });
    if (!track) return null;
    state.tracks = state.tracks.filter(function (item) { return item.id !== id; });
    state.likes = state.likes.filter(function (item) { return item !== id; });
    state.recent = state.recent.filter(function (item) { return item !== id; });
    state.playlists.forEach(function (playlist) { playlist.trackIds = playlist.trackIds.filter(function (item) { return item !== id; }); });
    persist();
    saveRemote('deleteTrack', track);
    state.playlists.forEach(function (playlist) { saveRemote('savePlaylist', playlist); });
    return track;
  }

  function recordPlayed(id) {
    state.recent = [id].concat(state.recent.filter(function (item) { return item !== id; })).slice(0, 12);
    persist();
  }

  function setTrackDuration(id, duration) {
    const track = state.tracks.find(function (item) { return item.id === id; });
    const length = Math.floor(Number(duration) || 0);
    if (!track || !length || track.duration === length) return;
    track.duration = length;
    persist();
  }

  function setPreference(key, value) {
    if (!['volume', 'shuffle', 'repeat', 'eq'].includes(key)) throw new Error('Unknown listening preference.');
    state[key] = value;
    persist();
  }

  function fileToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Could not include an audio file in the backup.')); };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !/^data:(audio\/[^;,]+|application\/octet-stream);base64,/.test(dataUrl)) throw new Error('The backup contains an invalid audio file.');
    const comma = dataUrl.indexOf(',');
    const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function exportBackup() {
    const backup = {
      app: 'NMStudio',
      version: 1,
      exportedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(state)),
      audio: {}
    };
    for (const track of state.tracks) {
      if (!track.audioId) continue;
      const blob = await NMStorage.getAudio(track.audioId);
      if (!blob) throw new Error('The saved audio for “' + track.title + '” is unavailable. Re-add that file before exporting a complete backup.');
      backup.audio[track.audioId] = { name: track.fileName || track.title, data: await fileToDataUrl(blob) };
    }
    return backup;
  }

  async function importBackup(input) {
    let backup = input;
    if (typeof input === 'string') {
      try { backup = JSON.parse(input); } catch (error) { throw new Error('That file is not valid JSON.'); }
    }
    if (!backup || backup.app !== 'NMStudio' || backup.version !== 1 || !backup.state || !Array.isArray(backup.state.tracks) || !Array.isArray(backup.state.playlists)) {
      throw new Error('This is not a compatible NMStudio backup.');
    }
    const tracks = backup.state.tracks.filter(function (track) {
      return track && typeof track.id === 'string' && typeof track.title === 'string' && typeof track.artist === 'string';
    });
    if (backup.state.tracks.length && !tracks.length) throw new Error('The backup does not contain any valid tracks.');
    const audio = backup.audio && typeof backup.audio === 'object' ? backup.audio : {};
    tracks.forEach(function (track) {
      if (track.source === 'local' && (!track.audioId || !Object.prototype.hasOwnProperty.call(audio, track.audioId))) {
        throw new Error('The backup is missing the audio file for “' + track.title + '”.');
      }
    });
    let audioPersisted = true;
    for (const id of Object.keys(audio)) {
      const blob = dataUrlToBlob(audio[id].data);
      if (!await NMStorage.putAudio(id, blob)) audioPersisted = false;
    }
    const next = {
      tracks: tracks,
      playlists: backup.state.playlists.filter(function (list) { return list && typeof list.id === 'string' && typeof list.name === 'string'; }).map(function (list) {
        return Object.assign({}, list, { trackIds: Array.isArray(list.trackIds) ? list.trackIds.filter(function (id) { return tracks.some(function (track) { return track.id === id; }); }) : [] });
      }),
      likes: Array.isArray(backup.state.likes) ? backup.state.likes.filter(function (id) { return tracks.some(function (track) { return track.id === id; }); }) : [],
      recent: Array.isArray(backup.state.recent) ? backup.state.recent.filter(function (id) { return tracks.some(function (track) { return track.id === id; }); }) : [],
      volume: Number.isFinite(backup.state.volume) ? Math.min(1, Math.max(0, backup.state.volume)) : 0.72,
      shuffle: Boolean(backup.state.shuffle),
      repeat: ['off', 'all', 'one'].includes(backup.state.repeat) ? backup.state.repeat : 'off',
      eq: backup.state.eq && typeof backup.state.eq === 'object' ? backup.state.eq : { low: 0, mid: 0, high: 0 }
    };
    const previous = state;
    state = next;
    if (!persist()) {
      state = previous;
      NMStorage.set(STATE_KEY, previous);
      throw new Error('The backup was read, but this browser could not save the restored library.');
    }
    return { audioPersisted: audioPersisted };
  }

  window.NMStore = {
    init: init,
    addTrack: addTrack,
    addPlaylist: addPlaylist,
    togglePlaylistTrack: togglePlaylistTrack,
    deletePlaylist: deletePlaylist,
    toggleLike: toggleLike,
    removeTrack: removeTrack,
    recordPlayed: recordPlayed,
    setTrackDuration: setTrackDuration,
    setPreference: setPreference,
    exportBackup: exportBackup,
    importBackup: importBackup,
    syncRemote: syncRemote,
    getTracks: function () { return state.tracks.slice(); },
    getTrack: function (id) { return state.tracks.find(function (track) { return track.id === id; }) || null; },
    getPlaylists: function () { return state.playlists.slice(); },
    getPlaylist: function (id) { return state.playlists.find(function (playlist) { return playlist.id === id; }) || null; },
    getLikedIds: function () { return state.likes.slice(); },
    getRecentIds: function () { return state.recent.slice(); },
    isLiked: function (id) { return state.likes.includes(id); },
    getVolume: function () { return state.volume; },
    getShuffle: function () { return state.shuffle; },
    getRepeat: function () { return state.repeat; },
    getEq: function () { return Object.assign({}, state.eq); }
  };
}());
