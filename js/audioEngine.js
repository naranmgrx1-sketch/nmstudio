(function () {
  'use strict';
  const media = new Audio();
  let context = null;
  let mediaSource = null;
  let lowFilter = null;
  let midFilter = null;
  let highFilter = null;
  let masterGain = null;
  let analyser = null;
  let activeTrack = null;
  let synthTimer = null;
  let synthStartedAt = 0;
  let synthOffset = 0;
  let synthStep = 0;
  let volume = 0.72;
  let callbacks = {};
  let eq = { low: 0, mid: 0, high: 0 };

  function notifyState(playing) {
    if (callbacks.onState) callbacks.onState(Boolean(playing));
  }

  function createContext() {
    if (context) return true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      context = new AudioContext();
      mediaSource = context.createMediaElementSource(media);
      lowFilter = context.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 250;
      midFilter = context.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 0.9;
      highFilter = context.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 4000;
      masterGain = context.createGain();
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      mediaSource.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(masterGain);
      masterGain.connect(analyser);
      analyser.connect(context.destination);
      media.volume = 1;
      applySettings();
      return true;
    } catch (error) {
      console.warn('NMStudio could not initialize Web Audio processing:', error);
      context = null;
      mediaSource = lowFilter = midFilter = highFilter = masterGain = analyser = null;
      return false;
    }
  }

  function applySettings() {
    if (!context || !masterGain) return;
    const now = context.currentTime;
    lowFilter.gain.setTargetAtTime(eq.low, now, 0.025);
    midFilter.gain.setTargetAtTime(eq.mid, now, 0.025);
    highFilter.gain.setTargetAtTime(eq.high, now, 0.025);
    masterGain.gain.setTargetAtTime(volume, now, 0.025);
  }

  function stopSynth() {
    if (synthTimer !== null) window.clearInterval(synthTimer);
    synthTimer = null;
  }

  function playSynthNote(frequency, length, wave, peak) {
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const voiceFilter = context.createBiquadFilter();
    const now = context.currentTime;
    oscillator.type = wave || 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    voiceFilter.type = 'lowpass';
    voiceFilter.frequency.setValueAtTime(Math.min(8000, Math.max(650, frequency * 10)), now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.008, peak || 0.12), now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(voiceFilter);
    voiceFilter.connect(envelope);
    envelope.connect(lowFilter || context.destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.03);
  }

  function tickSynth() {
    if (!activeTrack || !context || !activeTrack.synth) return;
    const config = activeTrack.synth;
    const scale = Array.isArray(config.scale) && config.scale.length ? config.scale : [0, 3, 7, 10, 12];
    const stepDuration = 60 / Math.max(45, Math.min(180, Number(config.tempo) || 100)) / 2;
    const note = scale[synthStep % scale.length];
    const octave = synthStep % 8 === 4 ? 2 : 1;
    const frequency = (Number(config.base) || 110) * Math.pow(2, note / 12) * octave;
    playSynthNote(frequency, stepDuration * 0.82, config.wave, 0.075);
    if (synthStep % 4 === 0) playSynthNote((Number(config.base) || 110) / 2, stepDuration * 2.8, 'sine', 0.17);
    if (synthStep % 2 === 1) playSynthNote(frequency * 2.01, stepDuration * 0.35, 'sine', 0.025);
    synthStep += 1;
  }

  function currentTime() {
    if (!activeTrack) return 0;
    if (activeTrack.source === 'synth') {
      return Math.max(0, synthOffset + (synthTimer === null || !context ? 0 : context.currentTime - synthStartedAt));
    }
    return Number.isFinite(media.currentTime) ? media.currentTime : 0;
  }

  function duration() {
    if (!activeTrack) return 0;
    if (activeTrack.source !== 'synth' && Number.isFinite(media.duration) && media.duration > 0) return media.duration;
    return Number(activeTrack.duration) || 0;
  }

  function tickTime() {
    const time = currentTime();
    const length = duration();
    if (callbacks.onTime) callbacks.onTime(time, length);
    if (activeTrack && activeTrack.source === 'synth' && length > 0 && time >= length) finish();
  }

  function finish() {
    stopSynth();
    media.pause();
    notifyState(false);
    if (callbacks.onEnded) callbacks.onEnded(activeTrack);
  }

  media.addEventListener('timeupdate', tickTime);
  media.addEventListener('durationchange', tickTime);
  media.addEventListener('loadedmetadata', tickTime);
  media.addEventListener('ended', finish);
  media.addEventListener('error', function () {
    if (callbacks.onError && activeTrack && activeTrack.source !== 'synth') {
      const error = media.error;
      callbacks.onError(error ? 'This audio source could not be played. Check the URL, file format, or network access.' : 'This audio source could not be played.');
    }
    stopSynth();
    notifyState(false);
  });

  async function play(track, startAt) {
    if (!track) throw new Error('Choose a track before pressing play.');
    const changed = !activeTrack || activeTrack.id !== track.id;
    if (changed) {
      stopSynth();
      media.pause();
      activeTrack = track;
    }
    if (createContext()) {
      if (context.state === 'suspended') await context.resume();
      applySettings();
    }
    if (track.source === 'synth') {
      if (!context) throw new Error('Synth previews need Web Audio support in this browser.');
      if (changed || Number.isFinite(startAt)) {
        synthOffset = Math.max(0, Number(startAt) || 0);
        synthStartedAt = context.currentTime;
        synthStep = Math.floor(synthOffset / (60 / Math.max(45, Number(track.synth && track.synth.tempo) || 100) / 2));
      }
      if (synthTimer !== null) window.clearInterval(synthTimer);
      tickSynth();
      synthTimer = window.setInterval(tickSynth, 60 / Math.max(45, Math.min(180, Number(track.synth && track.synth.tempo) || 100)) * 500);
      notifyState(true);
      tickTime();
      return;
    }
    if (!track.url) throw new Error('This track has no playable audio file or URL.');
    let sourceUrl;
    try { sourceUrl = new URL(track.url, document.baseURI); }
    catch (error) { throw new Error('This track has an invalid audio URL.'); }
    if (!['http:', 'https:', 'blob:'].includes(sourceUrl.protocol)) throw new Error('Audio URLs must use HTTP or HTTPS.');
    if (changed || media.src !== sourceUrl.href) {
      media.src = track.url;
      media.load();
    }
    if (Number.isFinite(startAt)) {
      try { media.currentTime = Math.max(0, startAt); } catch (error) { /* Metadata may not be ready yet. */ }
    }
    try {
      await media.play();
      notifyState(true);
    } catch (error) {
      notifyState(false);
      throw new Error(error && error.name === 'NotAllowedError' ? 'Playback was blocked by the browser. Press play again to allow audio.' : 'Could not start this audio source.');
    }
  }

  function pause() {
    if (activeTrack && activeTrack.source === 'synth' && synthTimer !== null && context) {
      synthOffset = currentTime();
      stopSynth();
    }
    media.pause();
    notifyState(false);
    tickTime();
  }

  function seek(seconds) {
    if (!activeTrack) return;
    const target = Math.max(0, Math.min(Number(seconds) || 0, duration() || Number.MAX_SAFE_INTEGER));
    if (activeTrack.source === 'synth') {
      const wasPlaying = synthTimer !== null;
      synthOffset = target;
      if (context) synthStartedAt = context.currentTime;
      synthStep = Math.floor(target / (60 / Math.max(45, Number(activeTrack.synth && activeTrack.synth.tempo) || 100) / 2));
      if (wasPlaying) tickSynth();
    } else {
      try { media.currentTime = target; } catch (error) { console.warn('NMStudio could not seek this audio source:', error); }
    }
    tickTime();
  }

  function setVolume(value) {
    volume = Math.min(1, Math.max(0, Number(value) || 0));
    media.volume = context ? 1 : volume;
    applySettings();
  }

  function setEQ(values) {
    eq = {
      low: Math.min(12, Math.max(-12, Number(values.low) || 0)),
      mid: Math.min(12, Math.max(-12, Number(values.mid) || 0)),
      high: Math.min(12, Math.max(-12, Number(values.high) || 0))
    };
    applySettings();
  }

  function getFrequencyData() {
    if (!analyser) return null;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  function init(eventCallbacks) {
    callbacks = eventCallbacks || {};
    media.preload = 'metadata';
    media.volume = volume;
  }

  window.NMAudio = {
    init: init,
    play: play,
    pause: pause,
    seek: seek,
    setVolume: setVolume,
    setEQ: setEQ,
    getFrequencyData: getFrequencyData,
    getCurrentTime: currentTime,
    getDuration: duration,
    getActiveTrack: function () { return activeTrack; },
    isPlaying: function () { return activeTrack && activeTrack.source === 'synth' ? synthTimer !== null : !media.paused; }
  };
}());
