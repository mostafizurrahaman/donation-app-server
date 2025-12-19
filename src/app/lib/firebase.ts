import * as admin from 'firebase-admin';
import config from '../config';

const firebaseAdmin = admin.apps.length
  ? admin.app()
  : admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
      }),
    });

export default firebaseAdmin;
