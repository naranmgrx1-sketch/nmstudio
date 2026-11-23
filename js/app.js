(function () {
  'use strict';
  const state = {
    view: 'home',
    playlistId: null,
    query: '',
    libraryFilter: 'all',
    activeTrackId: null,
    queue: [],
    queueIndex: -1,
    playing: false,
    currentTime: 0,
    duration: 0,
    adminFile: null,
    toastTimer: null
  };
  const objectUrls = new Map();
  const nepaliArtists = ['Sujan Chapagain', 'Yabesh Thapa', 'Sabin Rai', 'Purna Rai'];
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function formatTime(seconds) {
    const time = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0');
  }

  function announce(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { toast.classList.remove('visible'); }, 2500);
  }

  function tracks() { return NMStore.getTracks(); }
  function getTrack(id) { return NMStore.getTrack(id); }
  function playlists() { return NMStore.getPlaylists(); }
  function currentUser() { return NMAuth.getCurrentUser(); }

  function visiblePlaylists() {
    if (!state.query) return playlists();
    const query = state.query.toLowerCase();
    return playlists().filter(function (playlist) {
      return String(playlist.name || '').toLowerCase().includes(query) || String(playlist.description || '').toLowerCase().includes(query);
    });
  }

  function trackMatches(track) {
    if (!state.query) return true;
    const query = state.query.toLowerCase();
    return [track.title, track.artist, track.album].some(function (value) { return String(value || '').toLowerCase().includes(query); });
  }

  function visibleTracks() {
    let list = tracks();
    if (state.view === 'playlist' && state.playlistId) {
      const playlist = NMStore.getPlaylist(state.playlistId);
      list = playlist ? playlist.trackIds.map(getTrack).filter(Boolean) : [];
    } else if (state.view === 'liked') {
      const likes = NMStore.getLikedIds();
      list = list.filter(function (track) { return likes.includes(track.id); });
    } else if (state.view === 'library' && state.libraryFilter !== 'all') {
      list = list.filter(function (track) { return state.libraryFilter === 'synth' ? track.source === 'synth' : track.source !== 'synth'; });
    }
    return list.filter(trackMatches);
  }

  function emptyMessage(title, detail) {
    return '<div class="empty-state"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(detail) + '</span></div>';
  }

  function renderTrackList(element, list, options) {
    if (!element) return;
    const opts = options || {};
    if (!list.length) {
      element.innerHTML = emptyMessage(state.query ? 'No matches just yet' : (opts.emptyTitle || 'Your next favorite is waiting'), state.query ? 'Try another title, artist, or album.' : (opts.emptyDetail || 'Add a track or start a studio preview to begin.'));
      return;
    }
    element.innerHTML = list.map(function (track, index) {
      const active = state.activeTrackId === track.id;
      const liked = NMStore.isLiked(track.id);
      const album = track.album || (track.source === 'synth' ? 'Studio original' : 'Single');
      return '<div class="track-row' + (active ? ' current' : '') + '">' +
        '<span class="track-index">' + (active && state.playing ? '♫' : String(index + 1).padStart(2, '0')) + '</span>' +
        '<button class="track-play" data-play="' + escapeHtml(track.id) + '" aria-label="Play ' + escapeHtml(track.title) + '" title="Play track">' + (active && state.playing ? 'Ⅱ' : '▶') + '</button>' +
        '<button class="track-info" data-play="' + escapeHtml(track.id) + '" style="border:0;background:transparent;text-align:left;cursor:pointer;padding:0">' +
          '<strong>' + escapeHtml(track.title) + '</strong><span>' + escapeHtml(track.artist || 'Unknown artist') + '</span></button>' +
        '<span class="track-album">' + escapeHtml(album) + '</span>' +
        '<span class="track-duration">' + formatTime(track.duration) + '</span>' +
        '<span class="track-actions"><button class="row-action' + (liked ? ' liked' : '') + '" data-like="' + escapeHtml(track.id) + '" aria-label="' + (liked ? 'Unlike ' : 'Like ') + escapeHtml(track.title) + '">' + (liked ? '♥' : '♡') + '</button>' +
        '<button class="row-action" data-add-playlist="' + escapeHtml(track.id) + '" aria-label="Add ' + escapeHtml(track.title) + ' to a playlist" title="Add to playlist">＋</button>' +
        (opts.removable ? '<button class="row-action" data-remove-playlist="' + escapeHtml(track.id) + '" aria-label="Remove from playlist" title="Remove from playlist">×</button>' : '') +
        '</span></div>';
    }).join('');
  }

  function playlistCard(playlist) {
    const count = playlist.trackIds.length;
    return '<button class="playlist-card" data-playlist-view="' + escapeHtml(playlist.id) + '">' +
      '<span class="playlist-cover"><span>' + escapeHtml((playlist.name || 'N').slice(0, 1).toUpperCase()) + '</span></span>' +
      '<span class="playlist-info"><strong>' + escapeHtml(playlist.name) + '</strong><small>' + count + (count === 1 ? ' track' : ' tracks') + '</small></span></button>';
  }

  function renderPlaylistCards(element, list) {
    if (!element) return;
    element.innerHTML = list.length ? list.map(playlistCard).join('') : emptyMessage(state.query ? 'No playlists match' : 'Nothing in the collection', state.query ? 'Try another playlist name or description.' : 'Create a playlist for the sounds you want to keep close.');
  }

  function renderNepaliArtists() {
    const query = state.query.toLowerCase();
    const artists = nepaliArtists.filter(function (artist) { return !query || artist.toLowerCase().includes(query); });
    $('#nepaliArtists').innerHTML = artists.length ? artists.map(function (artist) {
      const search = encodeURIComponent(artist + ' Nepali songs');
      return '<article class="artist-card"><span class="artist-monogram" aria-hidden="true">♫</span>' +
        '<span class="artist-copy"><strong>' + escapeHtml(artist) + '</strong><small>Explore songs and releases</small></span>' +
        '<span class="artist-links"><a href="https://music.youtube.com/search?q=' + search + '" target="_blank" rel="noopener noreferrer" aria-label="Search ' + escapeHtml(artist) + ' on YouTube Music">YouTube</a>' +
        '<a href="https://open.spotify.com/search/' + search + '" target="_blank" rel="noopener noreferrer" aria-label="Search ' + escapeHtml(artist) + ' on Spotify">Spotify</a></span></article>';
    }).join('') : emptyMessage('No artist matches that search', 'Try Sujan Chapagain, Yabesh Thapa, Sabin Rai, or Purna Rai.');
  }

  function setView(view, playlistId) {
    const user = currentUser();
    if (view === 'admin' && (!user || user.role !== 'admin')) {
      announce('Studio controls are only available to accounts with the admin role.');
      view = 'home';
    }
    state.view = view;
    state.playlistId = view === 'playlist' ? playlistId : null;
    state.query = $('#searchInput').value.trim();
    $$('.view').forEach(function (element) { element.classList.add('hidden'); });
    const target = view === 'playlist' ? $('#playlistView') : $('#' + view + 'View');
    if (target) target.classList.remove('hidden');
    $$('.primary-nav [data-view], .mobile-nav [data-view], #adminNav').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === view || (view === 'playlist' && button.dataset.view === 'playlists'));
    });
    render();
    $('#stageScroll').scrollTop = 0;
  }

  function renderSidebar() {
    const user = currentUser();
    if (!user) return;
    $('#userName').textContent = user.name;
    $('#userRole').textContent = user.role.toUpperCase() + ' · LOCAL';
    $('#userAvatar').textContent = user.name.trim().charAt(0).toUpperCase() || 'N';
    $('#adminNav').classList.toggle('hidden', user.role !== 'admin');
    $('#mobileAdminNav').classList.toggle('hidden', user.role !== 'admin');
    const likedCount = NMStore.getLikedIds().length;
    $('#likedCount').textContent = likedCount + (likedCount === 1 ? ' track' : ' tracks');
    $('#playlistNav').innerHTML = playlists().map(function (playlist) {
      return '<button class="nav-link' + (state.view === 'playlist' && state.playlistId === playlist.id ? ' active' : '') + '" data-playlist-view="' + escapeHtml(playlist.id) + '"><span class="nav-icon">▧</span><span>' + escapeHtml(playlist.name) + '</span></button>';
    }).join('');
  }

  function renderPlaylistDetail() {
    const playlist = NMStore.getPlaylist(state.playlistId);
    if (!playlist) {
      $('#playlistDetail').innerHTML = emptyMessage('Playlist not found', 'It may have been removed from your collection.');
      return;
    }
    $('#playlistDetail').innerHTML = '<header class="playlist-hero"><div class="playlist-hero-art">♫</div><div class="playlist-hero-copy"><span class="eyebrow">YOUR PERSONAL MIX</span><h1>' + escapeHtml(playlist.name) + '</h1><p>' + escapeHtml(playlist.description || 'A collection of your favorites.') + '</p><span class="result-count">' + playlist.trackIds.length + ' TRACKS</span></div></header>' +
      '<div class="playlist-tools"><button class="button button-primary" data-play-playlist="' + escapeHtml(playlist.id) + '">▶ Play playlist</button><button class="button button-quiet" data-delete-playlist="' + escapeHtml(playlist.id) + '">Delete playlist</button></div>' +
      '<div class="track-list" id="detailTracks"></div>';
    renderTrackList($('#detailTracks'), visibleTracks(), { removable: true, emptyTitle: 'This playlist is still a blank canvas', emptyDetail: 'Add tracks using the ＋ button beside any song.' });
  }

  function renderQueue() {
    const queue = state.queue.length ? state.queue : tracks().map(function (track) { return track.id; });
    let upcomingIds = state.queueIndex >= 0 ? queue.slice(state.queueIndex + 1) : queue.filter(function (id) { return id !== state.activeTrackId; });
    if (!upcomingIds.length && NMStore.getRepeat() === 'all' && queue.length > 1) upcomingIds = queue.filter(function (id) { return id !== state.activeTrackId; });
    const upcoming = upcomingIds.slice(0, 5).map(getTrack).filter(Boolean);
    $('#queueCount').textContent = upcoming.length + (upcoming.length === 1 ? ' track' : ' tracks');
    $('#queueList').innerHTML = upcoming.length ? upcoming.map(function (track, index) {
      return '<button class="queue-row" data-queue-play="' + escapeHtml(track.id) + '"><span class="queue-art">' + String(index + 1).padStart(2, '0') + '</span><span class="queue-copy"><strong>' + escapeHtml(track.title) + '</strong><small>' + escapeHtml(track.artist) + '</small></span><span class="track-duration">' + formatTime(track.duration) + '</span></button>';
    }).join('') : '<div class="queue-empty">Your next listen will show up here.</div>';
  }

  function renderNowPlaying() {
    const track = getTrack(state.activeTrackId);
    const title = track ? track.title : 'Choose a track';
    const artist = track ? track.artist : 'Your next favorite is waiting.';
    const album = track ? track.album || 'Single' : 'NMStudio originals';
    const source = track ? (track.source === 'synth' ? 'STUDIO' : track.source === 'url' ? 'STREAM' : 'YOUR AUDIO') : 'STUDIO';
    $('#nowTitle').textContent = title;
    $('#nowArtist').textContent = artist;
    $('#nowAlbum').textContent = album;
    $('#nowSource').textContent = source;
    $('#transportTitle').textContent = title;
    $('#transportArtist').textContent = artist;
    $('#nowLike').classList.toggle('liked', Boolean(track && NMStore.isLiked(track.id)));
    $('#transportLike').classList.toggle('liked', Boolean(track && NMStore.isLiked(track.id)));
    $('#nowLike').textContent = track && NMStore.isLiked(track.id) ? '♥' : '♡';
    $('#transportLike').textContent = track && NMStore.isLiked(track.id) ? '♥' : '♡';
    const playing = track && state.playing;
    $('#visualizerLabel').textContent = playing ? 'NOW IN YOUR ROOM' : track ? 'PAUSED' : 'READY WHEN YOU ARE';
    $('#miniArtwork').textContent = track ? track.title.slice(0, 1).toUpperCase() : 'NM';
    $('#nowArtwork').innerHTML = '<span>NM</span><i>' + (track ? '✳' : '✦') + '</i>';
    $('#nowArtwork').style.filter = track && track.source === 'url' ? 'hue-rotate(35deg)' : '';
    $('#playButton').textContent = state.playing ? 'Ⅱ' : '▶';
    $('#playButton').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    $('#shuffleButton').classList.toggle('active', NMStore.getShuffle());
    $('#repeatButton').classList.toggle('active', NMStore.getRepeat() !== 'off');
    $('#repeatButton').setAttribute('aria-label', 'Repeat ' + NMStore.getRepeat());
    $('#repeatOne').classList.toggle('hidden', NMStore.getRepeat() !== 'one');
    $('#seekSlider').value = state.duration ? String(Math.round(state.currentTime / state.duration * 1000)) : '0';
    $('#elapsedTime').textContent = formatTime(state.currentTime);
    $('#durationTime').textContent = formatTime(state.duration || (track && track.duration));
    renderQueue();
  }

  function renderAdmin() {
    const user = currentUser();
    if (!user || user.role !== 'admin') return;
    window.dispatchEvent(new CustomEvent('nmadminrender'));
  }

  function render() {
    renderSidebar();
    if (state.view === 'home') {
      renderTrackList($('#homeTracks'), visibleTracks().slice(0, 6), { emptyTitle: 'A new listening room', emptyDetail: 'Add a track from your device or try a studio original.' });
      renderPlaylistCards($('#homePlaylists'), visiblePlaylists().slice(0, 3));
      renderNepaliArtists();
      const recent = NMStore.getRecentIds().map(getTrack).filter(function (track) { return track && trackMatches(track); });
      $('#recentSection').classList.toggle('hidden', !recent.length);
      renderTrackList($('#recentTracks'), recent.slice(0, 5), { emptyTitle: '', emptyDetail: '' });
    } else if (state.view === 'library' || state.view === 'liked') {
      const list = visibleTracks();
      renderTrackList($(state.view === 'library' ? '#libraryTracks' : '#likedTracks'), list, {
        emptyTitle: state.view === 'liked' ? 'Make it a favorite' : 'Your library is ready',
        emptyDetail: state.view === 'liked' ? 'Tap the heart on a track to keep it here.' : 'Add audio from your device, or explore studio originals.'
      });
      if (state.view === 'library') $('#libraryCount').textContent = list.length + ' TRACKS';
    } else if (state.view === 'playlists') {
      renderPlaylistCards($('#playlistPageGrid'), visiblePlaylists());
    } else if (state.view === 'playlist') {
      renderPlaylistDetail();
    } else if (state.view === 'admin') {
      renderAdmin();
    }
    renderNowPlaying();
  }

  async function resolveAudioTrack(track) {
    if (track.source !== 'local') return track;
    if (!track.audioId) throw new Error('This local track is missing its audio file.');
    let url = objectUrls.get(track.id);
    if (!url) {
      const blob = await NMStorage.getAudio(track.audioId);
      if (!blob) throw new Error('The saved audio file is unavailable. Re-add the file from your device.');
      url = URL.createObjectURL(blob);
      objectUrls.set(track.id, url);
    }
    return Object.assign({}, track, { url: url });
  }

  function updateTime(time, duration) {
    state.currentTime = time;
    state.duration = duration || (getTrack(state.activeTrackId) || {}).duration || 0;
    const active = getTrack(state.activeTrackId);
    if (active && active.source !== 'synth' && duration > 0 && active.duration !== Math.floor(duration)) {
      NMStore.setTrackDuration(active.id, duration);
      render();
    }
    $('#seekSlider').value = state.duration ? String(Math.round(state.currentTime / state.duration * 1000)) : '0';
    $('#elapsedTime').textContent = formatTime(state.currentTime);
    $('#durationTime').textContent = formatTime(state.duration);
  }

  async function startTrack(id, queueIds, index) {
    const track = getTrack(id);
    if (!track) {
      announce('That track is no longer in your library.');
      return;
    }
    if (Array.isArray(queueIds)) {
      state.queue = queueIds.slice();
      state.queueIndex = Number.isInteger(index) ? index : state.queue.indexOf(id);
    } else if (state.queueIndex < 0 || !state.queue.includes(id)) {
      state.queue = tracks().map(function (item) { return item.id; });
      state.queueIndex = state.queue.indexOf(id);
    }
    state.activeTrackId = id;
    state.currentTime = 0;
    state.duration = track.duration || 0;
    $('#nowPanel').classList.remove('mobile-open');
    $('#mobileSessionButton').setAttribute('aria-expanded', 'false');
    renderNowPlaying();
    try {
      const playable = await resolveAudioTrack(track);
      await NMAudio.play(playable, 0);
      NMStore.recordPlayed(id);
      render();
    } catch (error) {
      state.playing = false;
      renderNowPlaying();
      announce(error.message || 'Could not play this track.');
    }
  }

  async function togglePlayback() {
    if (NMAudio.isPlaying()) {
      NMAudio.pause();
      return;
    }
    if (!state.activeTrackId) {
      const list = visibleTracks();
      if (list.length) startTrack(list[0].id, list.map(function (track) { return track.id; }), 0);
      else announce('Choose a track to start listening.');
      return;
    }
    const track = getTrack(state.activeTrackId);
    if (!track) return;
    try {
      await NMAudio.play(await resolveAudioTrack(track), state.currentTime);
    } catch (error) {
      announce(error.message || 'Could not resume playback.');
    }
  }

  function nextTrack() {
    const queue = state.queue.length ? state.queue : tracks().map(function (track) { return track.id; });
    if (!queue.length) return;
    if (NMStore.getRepeat() === 'one' && state.activeTrackId) {
      startTrack(state.activeTrackId, queue, queue.indexOf(state.activeTrackId));
      return;
    }
    if (NMStore.getShuffle() && queue.length > 1) {
      const choices = queue.filter(function (id) { return id !== state.activeTrackId; });
      const id = choices[Math.floor(Math.random() * choices.length)];
      startTrack(id, queue, queue.indexOf(id));
      return;
    }
    let next = state.queueIndex + 1;
    if (next >= queue.length) {
      if (NMStore.getRepeat() !== 'all') {
        state.playing = false;
        state.currentTime = 0;
        updateTime(0, state.duration);
        renderNowPlaying();
        return;
      }
      next = 0;
    }
    startTrack(queue[next], queue, next);
  }

  function previousTrack() {
    if (state.currentTime > 3) {
      NMAudio.seek(0);
      return;
    }
    const queue = state.queue.length ? state.queue : tracks().map(function (track) { return track.id; });
    if (!queue.length) return;
    const previous = state.queueIndex <= 0 ? queue.length - 1 : state.queueIndex - 1;
    startTrack(queue[previous], queue, previous);
  }

  function createPlaylistModal() {
    openModal('<div class="modal-header"><h2 id="modalTitle">A new playlist</h2><button class="icon-button" data-modal-close aria-label="Close dialog">×</button></div>' +
      '<form id="playlistForm" class="modal-form"><label>Give it a name<input name="name" required maxlength="45" placeholder="Late-night notes"></label><label>Set the scene <span class="optional">OPTIONAL</span><textarea name="description" maxlength="120" placeholder="What does this playlist feel like?"></textarea></label><div class="modal-actions"><button class="button button-quiet" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit">Create playlist</button></div></form>');
  }

  function addToPlaylistModal(trackId) {
    const track = getTrack(trackId);
    if (!track) return;
    const options = playlists().map(function (playlist) {
      const hasTrack = playlist.trackIds.includes(trackId);
      return '<button class="playlist-option" data-toggle-playlist="' + escapeHtml(playlist.id) + '" data-track-id="' + escapeHtml(trackId) + '"><span>' + (hasTrack ? '✓' : '＋') + '</span><strong>' + escapeHtml(playlist.name) + '</strong><small>' + (hasTrack ? 'Added' : playlist.trackIds.length + ' tracks') + '</small></button>';
    }).join('');
    openModal('<div class="modal-header"><h2 id="modalTitle">Add to a playlist</h2><button class="icon-button" data-modal-close aria-label="Close dialog">×</button></div><p class="auth-intro">Choose where “' + escapeHtml(track.title) + '” belongs.</p>' +
      (options || emptyMessage('No playlists yet', 'Create a playlist to keep this track.')) +
      '<div class="modal-actions"><button class="button button-quiet" data-modal-create-playlist>Create playlist</button><button class="button button-primary" data-modal-close>Done</button></div>');
  }

  function openModal(content) {
    $('#modalContent').innerHTML = content;
    $('#modalOverlay').classList.remove('hidden');
    const focusable = $('input, textarea, button', $('#modalContent'));
    if (focusable) focusable.focus();
  }

  function closeModal() {
    $('#modalOverlay').classList.add('hidden');
    $('#modalContent').innerHTML = '';
  }

  function showAuth() {
    $('#authOverlay').classList.remove('hidden');
    $('#appShell').classList.add('hidden');
  }

  function logOut() {
    NMAudio.pause();
    NMAuth.signOut();
    $('#signInForm').reset();
    $('#signUpForm').reset();
    $$('.auth-tabs button').forEach(function (button, index) { button.classList.toggle('active', index === 0); });
    $('#signInForm').classList.remove('hidden');
    $('#signUpForm').classList.add('hidden');
    showAuth();
    $('#signInForm input[name="email"]').focus();
  }

  function enterApp() {
    $('#authOverlay').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    state.view = 'home';
    state.playlistId = null;
    $('#searchInput').value = '';
    setView('home');
  }

  async function addAudioFiles(files, publishData) {
    const list = Array.from(files || []);
    if (!list.length) return;
    for (const file of list) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) {
        announce('Skipped ' + file.name + ': that file does not look like audio.');
        continue;
      }
      const bits = file.name.replace(/\.[^.]+$/, '').split(' - ');
      const supplied = publishData || {};
      const artist = supplied.artist || (bits.length > 1 ? bits[0].trim() : (currentUser() || {}).name || 'Local upload');
      const title = supplied.title || (bits.length > 1 ? bits.slice(1).join(' - ').trim() : bits[0].trim());
      const audioId = 'audio-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      const persistent = await NMStorage.putAudio(audioId, file);
      const track = NMStore.addTrack({
        title: title || 'Untitled audio',
        artist: artist || 'Unknown artist',
        album: supplied.album || 'Local files',
        duration: 0,
        source: 'local',
        audioId: audioId,
        fileName: file.name
      });
      if (!persistent) announce('Audio is available for this session, but this browser could not persist the file.');
      else announce('Added “' + track.title + '” to your library.');
    }
    render();
  }

  function bindEvents() {
    $$('.primary-nav [data-view], #adminNav').forEach(function (button) {
      button.addEventListener('click', function () { setView(button.dataset.view); });
    });
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-view], [data-play], [data-like], [data-add-playlist], [data-playlist-view], [data-play-playlist], [data-queue-play], [data-delete-playlist], [data-remove-playlist], [data-delete-track], [data-modal-close], [data-modal-create-playlist], [data-toggle-playlist]');
      if (!target) return;
      if (target.hasAttribute('data-modal-close')) { closeModal(); return; }
      if (target.hasAttribute('data-view') && !target.matches('.primary-nav [data-view], #adminNav')) {
        event.preventDefault();
        setView(target.dataset.view);
        return;
      }
      if (target.dataset.play) {
        const list = visibleTracks().map(function (track) { return track.id; });
        if (!list.includes(target.dataset.play)) list.unshift(target.dataset.play);
        startTrack(target.dataset.play, list, list.indexOf(target.dataset.play));
        return;
      }
      if (target.dataset.like) {
        NMStore.toggleLike(target.dataset.like);
        render();
        return;
      }
      if (target.dataset.addPlaylist) { addToPlaylistModal(target.dataset.addPlaylist); return; }
      if (target.dataset.playlistView) { setView('playlist', target.dataset.playlistView); return; }
      if (target.dataset.playPlaylist) {
        const playlist = NMStore.getPlaylist(target.dataset.playPlaylist);
        if (playlist && playlist.trackIds.length) startTrack(playlist.trackIds[0], playlist.trackIds, 0);
        else announce('Add a track to this playlist first.');
        return;
      }
      if (target.dataset.queuePlay) {
        const ids = state.queue.length ? state.queue : tracks().map(function (track) { return track.id; });
        const index = ids.indexOf(target.dataset.queuePlay);
        startTrack(target.dataset.queuePlay, ids, index);
        return;
      }
      if (target.dataset.deletePlaylist) {
        const playlist = NMStore.getPlaylist(target.dataset.deletePlaylist);
        if (playlist && window.confirm('Delete the playlist “' + playlist.name + '”?')) {
          NMStore.deletePlaylist(playlist.id);
          setView('playlists');
          announce('Playlist deleted.');
        }
        return;
      }
      if (target.dataset.removePlaylist && state.playlistId) {
        NMStore.togglePlaylistTrack(state.playlistId, target.dataset.removePlaylist);
        render();
        announce('Removed from playlist.');
        return;
      }
      if (target.dataset.deleteTrack) {
        const user = currentUser();
        if (!user || user.role !== 'admin') return;
        const track = getTrack(target.dataset.deleteTrack);
        if (track && window.confirm('Remove “' + track.title + '” from this local catalog?')) {
          if (state.activeTrackId === track.id) {
            NMAudio.pause();
            state.activeTrackId = null;
            state.playing = false;
          }
          const removed = NMStore.removeTrack(track.id);
          if (removed && removed.audioId) NMStorage.deleteAudio(removed.audioId);
          if (objectUrls.has(track.id)) {
            URL.revokeObjectURL(objectUrls.get(track.id));
            objectUrls.delete(track.id);
          }
          state.queue = state.queue.filter(function (id) { return id !== track.id; });
          state.queueIndex = state.queue.indexOf(state.activeTrackId);
          render();
          announce('Track removed from the catalog.');
        }
        return;
      }
      if (target.dataset.modalCreatePlaylist) { createPlaylistModal(); return; }
      if (target.dataset.togglePlaylist) {
        const added = NMStore.togglePlaylistTrack(target.dataset.togglePlaylist, target.dataset.trackId);
        addToPlaylistModal(target.dataset.trackId);
        render();
        announce(added ? 'Added to playlist.' : 'Removed from playlist.');
      }
    });

    $('#newPlaylistButton').addEventListener('click', createPlaylistModal);
    $('#homeNewPlaylist').addEventListener('click', createPlaylistModal);
    $('#newPlaylistPage').addEventListener('click', createPlaylistModal);
    $('#heroPlay').addEventListener('click', function () {
      const list = tracks();
      if (list.length) startTrack(list[0].id, list.map(function (track) { return track.id; }), 0);
    });
    $('#searchInput').addEventListener('input', function (event) { state.query = event.target.value.trim(); render(); });
    $('#libraryFilters').addEventListener('click', function (event) {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.libraryFilter = button.dataset.filter;
      $$('.filter-pill', $('#libraryFilters')).forEach(function (pill) { pill.classList.toggle('active', pill === button); });
      render();
    });
    $('#uploadButton').addEventListener('click', function () { $('#audioFileInput').click(); });
    $('#audioFileInput').addEventListener('change', function (event) {
      addAudioFiles(event.target.files);
      event.target.value = '';
    });
    $('#adminAudioInput').addEventListener('change', function (event) {
      state.adminFile = event.target.files[0] || null;
      $('#adminFileName').textContent = state.adminFile ? state.adminFile.name : 'or publish a synth preview';
    });
    $('#publishForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const title = String(data.get('title') || '').trim();
      const artist = String(data.get('artist') || '').trim();
      if (state.adminFile) {
        const file = state.adminFile;
        await addAudioFiles([file], { title: title, artist: artist, album: String(data.get('album') || '').trim() || 'Studio releases' });
        state.adminFile = null;
        $('#adminFileName').textContent = 'or publish a synth preview';
        $('#adminAudioInput').value = '';
        event.currentTarget.reset();
        return;
      }
      const url = String(data.get('url') || '').trim();
      const album = String(data.get('album') || '').trim() || 'Studio releases';
      const parsedUrl = url ? new URL(url) : null;
      if (parsedUrl && !['http:', 'https:'].includes(parsedUrl.protocol)) {
        announce('Audio URLs must use HTTP or HTTPS.');
        return;
      }
      NMStore.addTrack(url
        ? { title: title, artist: artist, album: album, source: 'url', url: url, duration: 0 }
        : { title: title, artist: artist, album: album, source: 'synth', duration: 150, synth: { base: 123.47, tempo: 100, scale: [0, 3, 5, 7, 10, 12], wave: 'triangle' } });
      event.currentTarget.reset();
      render();
      announce(url ? 'Audio URL published to your local catalog.' : 'Synth preview published to your local catalog.');
    });
    $('#exportBackup').addEventListener('click', async function () {
      try {
        const backup = await NMStore.exportBackup();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = 'nmstudio-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
        announce('Your NMStudio backup is ready.');
      } catch (error) { announce(error.message || 'Could not export a backup.'); }
    });
    $('#importBackup').addEventListener('change', async function (event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (!window.confirm('Restoring this backup replaces the library, playlists, favorites, and listening settings on this device. Continue?')) return;
      try {
        const result = await NMStore.importBackup(await file.text());
        NMAudio.pause();
        objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
        objectUrls.clear();
        state.queue = [];
        state.queueIndex = -1;
        state.activeTrackId = null;
        state.playing = false;
        state.currentTime = 0;
        render();
        announce(result.audioPersisted ? 'Backup restored successfully.' : 'Backup restored, but audio files may only be available for this session.');
      } catch (error) { announce(error.message || 'Could not restore this backup.'); }
    });
    $('#playButton').addEventListener('click', togglePlayback);
    $('#previousButton').addEventListener('click', previousTrack);
    $('#nextButton').addEventListener('click', nextTrack);
    $('#shuffleButton').addEventListener('click', function () {
      NMStore.setPreference('shuffle', !NMStore.getShuffle());
      renderNowPlaying();
      announce(NMStore.getShuffle() ? 'Shuffle is on.' : 'Shuffle is off.');
    });
    $('#repeatButton').addEventListener('click', function () {
      const order = ['off', 'all', 'one'];
      const next = order[(order.indexOf(NMStore.getRepeat()) + 1) % order.length];
      NMStore.setPreference('repeat', next);
      renderNowPlaying();
      announce('Repeat ' + next + '.');
    });
    $('#seekSlider').addEventListener('input', function (event) {
      if (!state.duration) return;
      const target = Number(event.target.value) / 1000 * state.duration;
      $('#elapsedTime').textContent = formatTime(target);
    });
    $('#seekSlider').addEventListener('change', function (event) {
      if (state.duration) NMAudio.seek(Number(event.target.value) / 1000 * state.duration);
    });
    $('#volumeSlider').value = String(NMStore.getVolume());
    $('#volumeSlider').addEventListener('input', function (event) {
      const volume = Number(event.target.value);
      NMAudio.setVolume(volume);
      NMStore.setPreference('volume', volume);
      $('#volumeValue').textContent = Math.round(volume * 100) + '%';
    });
    $('#eqReset').addEventListener('click', function () { setEQ({ low: 0, mid: 0, high: 0 }); });
    $('#nowLike').addEventListener('click', toggleActiveLike);
    $('#transportLike').addEventListener('click', toggleActiveLike);
    $('#queueToggle').addEventListener('click', function () { $('#queueList').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    $('#mobileSessionButton').addEventListener('click', function () {
      const open = $('#nowPanel').classList.toggle('mobile-open');
      $('#mobileSessionButton').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if ($('#nowPanel').classList.contains('mobile-open') && !$('#nowPanel').contains(event.target) && !$('#mobileSessionButton').contains(event.target)) {
        $('#nowPanel').classList.remove('mobile-open');
        $('#mobileSessionButton').setAttribute('aria-expanded', 'false');
      }
    });
    $('#signOut').addEventListener('click', logOut);
    $('#mobileSignOut').addEventListener('click', logOut);
    $('#modalOverlay').addEventListener('click', function (event) { if (event.target === $('#modalOverlay')) closeModal(); });
    $('#modalContent').addEventListener('submit', function (event) {
      if (event.target.id !== 'playlistForm') return;
      event.preventDefault();
      const data = new FormData(event.target);
      const playlist = NMStore.addPlaylist(data.get('name'), data.get('description'));
      closeModal();
      render();
      setView('playlist', playlist.id);
      announce('Playlist created.');
    });
    $$('.auth-tabs button').forEach(function (button) {
      button.addEventListener('click', function () {
        const signup = button.dataset.authTab === 'signup';
        $$('.auth-tabs button').forEach(function (tab) { tab.classList.toggle('active', tab === button); });
        $('#signInForm').classList.toggle('hidden', signup);
        $('#signUpForm').classList.toggle('hidden', !signup);
      });
    });
    $('#signInForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try { await NMAuth.signIn(data.get('email'), data.get('password')); enterApp(); }
      catch (error) { announce(error.message); }
    });
    $('#signUpForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try { await NMAuth.signUp({ name: data.get('name'), email: data.get('email'), password: data.get('password'), role: data.get('role') }); enterApp(); }
      catch (error) { announce(error.message); }
    });
    document.addEventListener('keydown', function (event) {
      const tag = event.target.tagName;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable;
      if (event.key === '/' && !typing) { event.preventDefault(); $('#searchInput').focus(); return; }
      if (event.key === 'Escape') {
        if (!$('#modalOverlay').classList.contains('hidden')) closeModal();
        else if (!$('#authOverlay').classList.contains('hidden')) return;
        else {
          $('#searchInput').blur();
          $('#nowPanel').classList.remove('mobile-open');
          $('#mobileSessionButton').setAttribute('aria-expanded', 'false');
        }
        return;
      }
      if (event.code === 'Space' && !typing && $('#authOverlay').classList.contains('hidden')) {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key === 'ArrowRight' && !typing && event.altKey) nextTrack();
      if (event.key === 'ArrowLeft' && !typing && event.altKey) previousTrack();
    });
  }

  function toggleActiveLike() {
    if (!state.activeTrackId) { announce('Play a track before adding it to your favorites.'); return; }
    NMStore.toggleLike(state.activeTrackId);
    render();
  }

  function setEQ(values) {
    NMStore.setPreference('eq', values);
    NMAudio.setEQ(values);
  }

  function drawVisualizer() {
    const canvas = $('#visualizer');
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * pixelRatio));
    const height = Math.max(1, Math.floor(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    const frequency = NMAudio.getFrequencyData();
    const bars = Math.max(12, Math.floor(rect.width / 7));
    const gap = 3 * pixelRatio;
    const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
    const time = performance.now() / 700;
    for (let i = 0; i < bars; i += 1) {
      const value = frequency ? frequency[Math.floor(i / bars * frequency.length)] / 255 : (state.playing ? .2 + Math.abs(Math.sin(time + i * .42)) * .45 : .045 + Math.abs(Math.sin(time / 2 + i * .2)) * .045);
      const barHeight = Math.max(2 * pixelRatio, value * (height * .8));
      context.fillStyle = i % 5 === 0 ? '#99bd60' : '#748b50';
      context.globalAlpha = .4 + value * .8;
      context.fillRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
    }
    context.globalAlpha = 1;
    window.requestAnimationFrame(drawVisualizer);
  }

  function init() {
    window.addEventListener('nmstoragewarning', function (event) {
      if (event.detail && event.detail.message) announce(event.detail.message);
    });
    window.addEventListener('nmdatachange', render);
    NMStore.init();
    const user = NMAuth.init();
    NMAudio.init({
      onState: function (playing) {
        state.playing = playing;
        renderNowPlaying();
      },
      onTime: updateTime,
      onEnded: nextTrack,
      onError: function (message) { announce(message); }
    });
    NMAudio.setVolume(NMStore.getVolume());
    NMAudio.setEQ(NMStore.getEq());
    bindEvents();
    render();
    if (user) enterApp();
    else showAuth();
    window.requestAnimationFrame(drawVisualizer);
  }

  document.addEventListener('DOMContentLoaded', init);
}());
