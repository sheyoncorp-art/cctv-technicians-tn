# CCTV Technicians TN

Technician community app for Tamil Nadu: technical tips and doubts, manpower and contract-work listings,
and a technician directory. Not for promotion.

`index.html` at the repo root is the WhatsApp group landing page. The Android app lives in `app/`
(Capacitor + Firebase). Every push to `main` that touches `app/` builds an APK and publishes it under
Releases as **latest**.

## One-time setup
1. Create a **separate** Firebase project for this app (do not reuse the SHEYON CORP OMS project).
2. Enable **Authentication > Email/Password** and create a **Firestore** database.
3. Paste `app/firestore.rules` into Firestore > Rules and publish.
4. Add a Web app in Project settings, copy its config into `app/src/firebase-config.js`, and push.
5. To make yourself admin: create the document `admins/<your user uid>` in Firestore (any field).

## Local
```
cd app && npm install && npm run dev
```
