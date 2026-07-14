const DB_NAME = 'offline-video-player';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';
const PLAYLIST_STORE = 'playlists';

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const videos = db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        videos.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
        db.createObjectStore(PLAYLIST_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存処理が中断されました'));
  });
}

export async function getAllVideos() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(VIDEO_STORE).objectStore(VIDEO_STORE).getAll());
}
export function saveVideo(video) { return withStore(VIDEO_STORE, 'readwrite', store => store.put(video)); }
export function deleteVideo(id) { return withStore(VIDEO_STORE, 'readwrite', store => store.delete(id)); }
export async function getVideo(id) {
  const db = await openDatabase();
  return requestToPromise(db.transaction(VIDEO_STORE).objectStore(VIDEO_STORE).get(id));
}
export async function getAllPlaylists() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(PLAYLIST_STORE).objectStore(PLAYLIST_STORE).getAll());
}
export function savePlaylist(playlist) { return withStore(PLAYLIST_STORE, 'readwrite', store => store.put(playlist)); }
export function deletePlaylist(id) { return withStore(PLAYLIST_STORE, 'readwrite', store => store.delete(id)); }
