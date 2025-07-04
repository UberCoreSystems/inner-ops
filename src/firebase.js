
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

// Firebase configuration for inner-ops project
const firebaseConfig = {
  apiKey: "AIzaSyCNO79Mw06MClVux9Fg1qC2-n1sj8mcyqI",
  authDomain: "inner-ops.firebaseapp.com",
  projectId: "inner-ops",
  storageBucket: "inner-ops.firebasestorage.app",
  messagingSenderId: "196049580582",
  appId: "1:196049580582:web:fcd232716e233951946ce7",
  measurementId: "G-K2L34NYKW5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { auth, db, analytics };
export default app;
