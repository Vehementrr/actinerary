// Firebase: Google sign-in and syncing lists to Firestore.
// Lists live at users/{uid}/lists/{listId}. firestore.rules only lets a signed-in user touch their own folder.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  connectFirestoreEmulator, collection, doc, setDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { toSaved } from './logic.js';

// Opened at localhost, the app uses Firebase's emulators: a fake database and fake sign-in on this computer.
// Started with `firebase emulators:start`. The live app never takes this path.
const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Keeps a copy of your lists on the device, so the app works offline and syncs when you reconnect.
// Not when testing, so fake lists never mix with a saved copy of real ones.
const db = initializeFirestore(app, {
  localCache: onLocalhost ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});
if (onLocalhost) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }

// Surfaces any error from a sign-in that came back via redirect.
export async function redirectError() {
  try { await getRedirectResult(auth); return null; } catch (e) { return e; }
}

export async function signIn() {
  // Installed apps and iPhones use a full-page redirect; desktop browsers use a popup.
  if (isStandalone() || isIOS()) return signInWithRedirect(auth, provider);
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth, provider);
    }
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
  }
}
export const signOutUser = () => signOut(auth);

const listsCol = uid => collection(db, 'users', uid, 'lists');

// Calls cb(lists, removedIds) whenever lists change on any device.
export function watchLists(uid, cb, onError) {
  return onSnapshot(listsCol(uid), snap => {
    const lists = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const removed = snap.docChanges().filter(c => c.type === 'removed').map(c => c.doc.id);
    cb(lists, removed, snap.metadata.fromCache);
  }, onError);
}

// Writes are queued locally first, so these never wait for the network.
export function saveList(uid, list) {
  const { id, title, items, createdAt, sortedAt, completedAt } = list;
  list.updatedAt = Date.now();
  return setDoc(doc(db, 'users', uid, 'lists', id), {
    title: title || '', items: toSaved(items), createdAt: createdAt || list.updatedAt, updatedAt: list.updatedAt, sortedAt, completedAt,
  });
}
export const removeList = (uid, id) => deleteDoc(doc(db, 'users', uid, 'lists', id));
