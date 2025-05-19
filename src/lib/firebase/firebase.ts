import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  // Your Firebase config object here
  // You can get this from your Firebase Console
  // Project Settings > General > Your Apps > SDK setup and configuration
};

// Initialize Firebase using singleton pattern
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app); 