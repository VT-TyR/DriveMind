// node scripts/seed.firestorm.js (emulator)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'demo-draftcore' });
const db = getFirestore();

async function run() {
  const players = [
    { id: 'p1', name: 'Bijan Robinson', position: 'RB', team: 'ATL', vorp: 85, adp: 6 },
    { id: 'p2', name: 'Garrett Wilson', position: 'WR', team: 'NYJ', vorp: 78, adp: 13 }
  ];
  const batch = db.batch();
  players.forEach(p => batch.set(db.collection('players').doc(p.id), p));
  await batch.commit();

  console.log('Seed complete:', players.length, 'players');
}

run().catch(e => (console.error(e), process.exit(1)));
