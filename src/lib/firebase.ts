
import { initializeApp, getApps, getApp } from 'firebase/app';

// This configuration is automatically provided by Firebase Hosting's backend.
// It's the recommended way to initialize Firebase on the client-side for App Hosting.
const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG!);

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
