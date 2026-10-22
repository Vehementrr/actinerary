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
  apiKey: 'AIzaSyArDz-9U0N_6zIXPfk273jhBdDFH4Fyu-A',
  authDomain: 'actionary-b6dff.firebaseapp.com',
  projectId: 'actionary-b6dff',
  storageBucket: 'actionary-b6dff.firebasestorage.app',
  messagingSenderId: '381264655574',
  appId: '1:381264655574:web:b079b191376c97ed28c577',
};

export const isConfigured = !Object.values(firebaseConfig).some(v => String(v).includes('PASTE_'));
