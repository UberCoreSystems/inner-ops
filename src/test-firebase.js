
// Simple Firebase connection test
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyCNO79Mw06MClVux9Fg1qC2-n1sj8mcyqI",
  authDomain: "inner-ops.firebaseapp.com",
  projectId: "inner-ops",
  storageBucket: "inner-ops.firebasestorage.app",
  messagingSenderId: "196049580582",
  appId: "1:196049580582:web:fcd232716e233951946ce7",
  measurementId: "G-K2L34NYKW5"
};

try {
  const app = initializeApp(firebaseConfig);
  console.log('Firebase initialized successfully:', app);
} catch (error) {
  console.error('Firebase initialization failed:', error);
}
