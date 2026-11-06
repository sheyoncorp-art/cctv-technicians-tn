// Paste your Firebase WEB app config here (Firebase console > Project settings > Your apps > Web app).
// Use a SEPARATE Firebase project for this community app, not the SHEYON CORP OMS project.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Existing community WhatsApp group (shown on the Me tab)
export const WHATSAPP_GROUP = 'https://chat.whatsapp.com/Ea9PFxtElBL2x6RMk2VPYR?mode=gi_t';
