# CCTV Technicians TN

Verified community app for CCTV dealers and technicians in Tamil Nadu: technical tips and doubts,
manpower and contract-work listings, official SHEYON CORP orders, and a member directory. No promotion.

`index.html` at the repo root is the WhatsApp group landing page. The Android app lives in `app/`
(Capacitor + Firebase). Every push to `main` that touches `app/` builds an APK and publishes it under
Releases as **latest**.

## How it works
1. Sign in with Google.
2. Fill the verification form. The app decides the category from the answers (the applicant never picks it):
   office + GST + staff = A, no office and no GST = C, everything else = B.
3. A SHEYON CORP telecaller calls, ticks the checks, confirms or changes the category, then verifies.
4. The community, orders, jobs and member directory open automatically. Nothing is visible before that.

Promotion is blocked: links and phone numbers are rejected in post text (client and Firestore rules),
sales words are rejected in posts and replies, only admins can publish offers, members can report, and
an admin can delete content or suspend a member.

## One-time setup
1. Create a **separate** Firebase project for this app (do not reuse the SHEYON CORP OMS project).
2. Authentication > Sign-in method: enable **Google**.
3. Firestore: create the database, then paste `app/firestore.rules` into Rules and publish.
4. Project settings > Add Android app:
   - package name `com.sheyoncorp.cctvtechnicianstn`
   - SHA-1 `23:62:6F:E3:A2:DC:15:F6:9A:1E:B1:D3:A7:11:9A:DD:59:7B:3D:66` (the fixed debug key in this repo)
   - download `google-services.json` **after** Google sign-in is enabled and put it at
     `app/android/app/google-services.json`.
5. Project settings > Add Web app, copy its config into `app/src/firebase-config.js`.
6. Push. The APK is rebuilt automatically.
7. Create staff in Firestore by hand (collection `staff`, document id = the person's user ID, shown on
   the app screens as "Your ID" after they sign in with Google):
   - admin: `{ role: "admin", name: "SHEYON CORP" }`
   - telecaller: `{ role: "telecaller", name: "Priya" }`

## Local
```
cd app && npm install && npm run dev
```
