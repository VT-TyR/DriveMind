// node scripts/reset.firestorm.js (emulator)
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'demo-draftcore' });
const db = getFirestore();

async function nuke(collection) {
  const snap = await db.collection(collection).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

async function run() {
  await nuke('players');
  await nuke('users');
  console.log('Reset complete.');
}
run().catch(e => (console.error(e), process.exit(1)));
