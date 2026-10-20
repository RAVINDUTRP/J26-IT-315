# AquaShield — Firebase Configuration & Setup Guide

This guide documents the native Firebase configuration, administrator provisioning process, and security rule enforcement for the AquaShield mobile application.

---

## 1. Firebase Project Overview

- **Project ID:** `boat-research-e08fb`
- **Project Number:** `1055283234675`
- **Realtime Database Endpoint:** `https://boat-research-e08fb-default-rtdb.firebaseio.com`
- **Storage Bucket:** `boat-research-e08fb.firebasestorage.app`
- **Authentication:** Email / Password Provider Enabled

### Registered App Configurations:
- **Android App ID:** `1:1055283234675:android:3afc5549c1ea7cfd32e706` (Package: `com.aquashield.aquashield`)
- **Web App ID:** `1:1055283234675:web:5b58844d796e384a32e706`
- **Android Google Services Config:** `android/app/google-services.json`
- **Flutter Options:** `lib/firebase_options.dart`

---

## 2. Administrator Account Provisioning

### Default Admin Credentials:
- **Email:** `admin@gmail.com`
- **Initial Password:** `Admin@123`

### Security Principle:
Administrator privileges are **never** self-assigned via the mobile application registration form. They must be provisioned through a trusted administrative environment using the Firebase Admin SDK.

### Running the Provisioning Script:
A dedicated script is provided at `scripts/provision_admin.py`:

```bash
# Ensure firebase-admin is installed
pip install firebase-admin

# Run the provisioning script
python scripts/provision_admin.py --email admin@gmail.com --password Admin@123
```

This script:
1. Authenticates with Firebase using the project Service Account key.
2. Creates or verifies the user in Firebase Authentication.
3. Sets trusted Custom Claims: `{"role": "ADMIN", "admin": true}` on the Auth ID Token.
4. Records the role in the protected Realtime Database node: `/userRoles/{uid}/role = 'ADMIN'`.
5. Creates the administrator's profile record in `/userProfiles/{uid}`.

> **IMPORTANT:**  
> The service account JSON key (`*-firebase-adminsdk-*.json`) must **never** be checked into public version control or bundled into the mobile app binary. It is excluded via `.gitignore`.

---

## 3. Public User Registration Flow

1. Any public registration made through the mobile app assigns the `USER` role strictly.
2. The registration writes the profile to `/userProfiles/{uid}` and writes `'USER'` to `/userRoles/{uid}`.
3. If an unauthorized client attempts to send `'ADMIN'`, the Firebase Realtime Database Security Rules reject the write.

---

## 4. Applying Firebase Realtime Database Security Rules

1. Navigate to the [Firebase Console](https://console.firebase.google.com/project/boat-research-e08fb/database).
2. Select **Realtime Database** from the Build menu.
3. Click the **Rules** tab.
4. Paste the JSON rules from `docs/security_rules.json`.
5. Click **Publish**.

---

## 5. Running the Application Locally

```bash
cd Mobile

# Install Flutter dependencies
flutter pub get

# Verify code analysis
flutter analyze

# Execute automated tests
flutter test

# Run on Android device or emulator
flutter run -d android
```
