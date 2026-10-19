#!/usr/bin/env python3
"""
AquaShield — Admin Account Provisioning Script
=============================================
This trusted provisioning script initializes or updates the primary Administrator account
in Firebase Authentication and Firebase Realtime Database.

Security Guarantees:
- This script runs ONLY in a trusted administrative/backend environment.
- It uses the Firebase Admin SDK Service Account credentials.
- It sets custom user claims (`role: 'ADMIN'`) that cannot be spoofed by client requests.
- It writes the verified role to `/userRoles/{uid}` in Realtime Database.
- It NEVER bundles service account keys into the client Flutter mobile application.

Usage:
    python scripts/provision_admin.py [--email admin@gmail.com] [--password Admin@123]
"""

import argparse
import datetime
import os
import sys

try:
    import firebase_admin
    from firebase_admin import auth, credentials, db
except ImportError:
    print("Error: firebase_admin is required. Run: pip install firebase-admin")
    sys.exit(1)

# Default Project Configuration
DEFAULT_PROJECT_ID = "boat-research-e08fb"
DEFAULT_RTDB_URL = "https://boat-research-e08fb-default-rtdb.firebaseio.com"
DEFAULT_SERVICE_ACCOUNT_NAME = "boat-research-e08fb-firebase-adminsdk-fbsvc-c15548b1e9.json"


def find_service_account(provided_path: str = None) -> str:
    """Locate the service account JSON key."""
    if provided_path and os.path.exists(provided_path):
        return provided_path

    # Check common locations relative to project root
    candidates = [
        provided_path,
        DEFAULT_SERVICE_ACCOUNT_NAME,
        os.path.join("..", DEFAULT_SERVICE_ACCOUNT_NAME),
        os.path.join(os.path.dirname(__file__), "..", DEFAULT_SERVICE_ACCOUNT_NAME),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)

    # Search for any *-firebase-adminsdk-*.json
    search_dir = os.path.abspath(os.path.dirname(__file__))
    for root, _, files in os.walk(os.path.join(search_dir, "..")):
        for f in files:
            if "firebase-adminsdk" in f and f.endswith(".json"):
                return os.path.join(root, f)

    raise FileNotFoundError(
        "Could not find Firebase Admin SDK service account key file (*-firebase-adminsdk-*.json)."
    )


def provision_admin(email: str, password: str, key_path: str = None):
    key_file = find_service_account(key_path)
    print(f"[*] Using Firebase Service Account: {key_file}")

    cred = credentials.Certificate(key_file)
    try:
        app = firebase_admin.get_app()
    except ValueError:
        app = firebase_admin.initialize_app(cred, {"databaseURL": DEFAULT_RTDB_URL})

    print(f"[*] Connected to Firebase Project: {DEFAULT_PROJECT_ID}")
    print(f"[*] Processing Administrator account: {email}")

    # 1. Fetch or Create User in Firebase Authentication
    try:
        user = auth.get_user_by_email(email)
        print(f"[+] Found existing Firebase Auth user: UID = {user.uid}")
        # Update password if provided
        if password:
            auth.update_user(user.uid, password=password)
            print("[+] Updated administrator password.")
    except auth.UserNotFoundError:
        user = auth.create_user(
            email=email,
            password=password,
            display_name="AquaShield Administrator",
            email_verified=True,
        )
        print(f"[+] Created new Firebase Auth administrator: UID = {user.uid}")

    # 2. Assign Trusted Custom Claims
    custom_claims = {"role": "ADMIN", "admin": True}
    auth.set_custom_user_claims(user.uid, custom_claims)
    print(f"[+] Custom claims set: {custom_claims}")

    # 3. Store Verified Role in RTDB (/userRoles/{uid})
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    roles_ref = db.reference(f"userRoles/{user.uid}")
    roles_ref.set({
        "role": "ADMIN",
        "email": email,
        "updatedAt": now,
        "assignedBy": "AdminSDK_CLI",
    })
    print(f"[+] Recorded role in RTDB: /userRoles/{user.uid} -> 'ADMIN'")

    # 4. Provision Initial Profile (/userProfiles/{uid})
    profiles_ref = db.reference(f"userProfiles/{user.uid}")
    profiles_ref.update({
        "fullName": "AquaShield Administrator",
        "email": email,
        "contactNumber": "+94700000000",
        "createdAt": now,
    })
    print(f"[+] Profile updated in RTDB: /userProfiles/{user.uid}")

    print("\n" + "=" * 60)
    print("SUCCESS: AquaShield Administrator account provisioned securely!")
    print(f"Email:    {email}")
    print(f"UID:      {user.uid}")
    print(f"Role:     ADMIN")
    print("=" * 60)
    print("\nIMPORTANT POST-PROVISIONING SECURITY NOTICE:")
    print("1. If using the default research password, log in to the app and update your password.")
    print("2. Ensure this service account key file is NEVER committed to public repositories.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AquaShield Admin Provisioning CLI")
    parser.add_argument("--email", default="admin@gmail.com", help="Admin email address")
    parser.add_argument("--password", default="Admin@123", help="Initial admin password")
    parser.add_argument("--key", default=None, help="Path to service account JSON key")
    args = parser.parse_args()

    provision_admin(args.email, args.password, args.key)
