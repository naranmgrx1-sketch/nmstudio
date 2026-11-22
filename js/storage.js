(function () {
  'use strict';
  const memory = Object.create(null);
  const audioMemory = new Map();
  let databasePromise;
  const DB_NAME = 'nmstudio-audio';
  const STORE_NAME = 'audio';

  function warn(message) {
    window.dispatchEvent(new CustomEvent('nmstoragewarning', { detail: { message: message } }));
  }

  function get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn('NMStudio could not read local storage:', error);
      warn('Local browser storage could not be read. Changes may not survive a reload.');
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
    }
  }

  function set(key, value) {
    memory[key] = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('NMStudio could not persist local state:', error);
      warn('Local browser storage is full or unavailable. Changes may not survive a reload.');
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('NMStudio could not remove local state:', error);
      warn('Local browser storage could not remove saved data.');
      return false;
    }
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve) {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      let request;
      try {
        request = window.indexedDB.open(DB_NAME, 1);
      } catch (error) {
        console.warn('NMStudio audio storage is unavailable:', error);
        resolve(null);
        return;
      }
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        console.warn('NMStudio could not open audio storage:', request.error);
        resolve(null);
      };
      request.onblocked = function () {
        console.warn('NMStudio audio storage is blocked by another tab.');
      };
    });
    return databasePromise;
  }

  function audioTransaction(mode, operation) {
    return openDatabase().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        let transaction;
        try {
          transaction = db.transaction(STORE_NAME, mode);
          operation(transaction.objectStore(STORE_NAME), resolve, reject);
          transaction.onerror = function () { reject(transaction.error || new Error('Audio storage transaction failed.')); };
          transaction.onabort = function () { reject(transaction.error || new Error('Audio storage transaction was aborted.')); };
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function putAudio(id, blob) {
    audioMemory.set(id, blob);
    return audioTransaction('readwrite', function (store, resolve, reject) {
      const request = store.put(blob, id);
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () { reject(request.error || new Error('Could not save this audio file.')); };
    }).then(function (saved) {
      return saved === true;
    }).catch(function (error) {
      console.warn('NMStudio could not save audio to IndexedDB:', error);
      return false;
    });
  }

  function getAudio(id) {
    return audioTransaction('readonly', function (store, resolve, reject) {
      const request = store.get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error || new Error('Could not load this audio file.')); };
    }).then(function (blob) {
      return blob || audioMemory.get(id) || null;
    }).catch(function (error) {
      console.warn('NMStudio could not load audio from IndexedDB:', error);
      return audioMemory.get(id) || null;
    });
  }

  function deleteAudio(id) {
    audioMemory.delete(id);
    return audioTransaction('readwrite', function (store, resolve, reject) {
      const request = store.delete(id);
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () { reject(request.error || new Error('Could not remove this audio file.')); };
    }).then(function (saved) { return saved === true; }).catch(function (error) {
      console.warn('NMStudio could not remove audio from IndexedDB:', error);
      return false;
    });
  }

  window.NMStorage = { get: get, set: set, remove: remove, putAudio: putAudio, getAudio: getAudio, deleteAudio: deleteAudio };
}());
