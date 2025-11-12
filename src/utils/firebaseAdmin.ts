import 'dotenv/config';
import * as admin from 'firebase-admin';

function initFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing');
  }

  const sa = JSON.parse(raw);

  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  return admin.initializeApp({
    credential: admin.credential.cert(sa as admin.ServiceAccount),
  });
}

const app = initFirebaseAdmin();
export const db = admin.firestore(app);
export const authAdmin = admin.auth(app);
