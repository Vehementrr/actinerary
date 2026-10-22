// Your Firebase web app settings.
//
// These values are NOT secrets. They tell the app which Firebase project to talk to, and every visitor's
// browser can see them anyway. Your data is protected by the rules in firestore.rules (enforced on
// Google's servers) and by Google sign-in, not by hiding these values. It's safe to commit this file.
//
// Never put a service account key (a JSON file with "private_key" in it) anywhere in this project.
//
// Paste the values from Firebase console → Project settings → Your apps → Web app → SDK setup and configuration.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};

export const isConfigured = !Object.values(firebaseConfig).some(v => String(v).includes('PASTE_'));
