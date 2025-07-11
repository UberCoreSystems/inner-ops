import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Read Firebase config from your firebase.js file
const firebaseConfig = {
  apiKey: "AIzaSyCNY4-J4aK2WQe55XTQCl1hE3JX_1EKoT4",
  authDomain: "inner-ops-cf8d4.firebaseapp.com",
  projectId: "inner-ops-cf8d4",
  storageBucket: "inner-ops-cf8d4.firebasestorage.app",
  messagingSenderId: "590745001059",
  appId: "1:590745001059:web:1c98c3abc68816e9b4e2b3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkCollections() {
  try {
    console.log('Checking clarityKills collection...');
    const clarityKillsSnapshot = await getDocs(collection(db, 'clarityKills'));
    console.log(`clarityKills collection has ${clarityKillsSnapshot.size} documents`);
    
    console.log('\nChecking killTargets collection...');
    const killTargetsSnapshot = await getDocs(collection(db, 'killTargets'));
    console.log(`killTargets collection has ${killTargetsSnapshot.size} documents`);
    
    if (clarityKillsSnapshot.size > 0) {
      console.log('\nData in clarityKills:');
      clarityKillsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}`);
        console.log(`  Name: ${data.name || 'N/A'}`);
        console.log(`  User: ${data.userId || 'N/A'}`);
        console.log(`  Date: ${data.timestamp?.toDate?.() || data.timestamp || 'N/A'}`);
        console.log('');
      });
    }
    
    if (killTargetsSnapshot.size > 0) {
      console.log('\nData in killTargets:');
      killTargetsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}`);
        console.log(`  Text: ${data.text || 'N/A'}`);
        console.log(`  User: ${data.userId || 'N/A'}`);
        console.log(`  Date: ${data.createdAt || data.timestamp?.toDate?.() || 'N/A'}`);
        console.log('');
      });
    }
    
    console.log('Collection check complete.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkCollections();
