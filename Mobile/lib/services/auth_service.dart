import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import '../core/constants/app_constants.dart';
import '../models/user_profile.dart';
import '../models/user_role.dart';

/// Service managing Firebase Authentication and secure user registration.
class AuthService {
  final FirebaseAuth _auth;
  final FirebaseDatabase _database;

  AuthService({FirebaseAuth? auth, FirebaseDatabase? database})
    : _auth = auth ?? FirebaseAuth.instance,
      _database = database ?? FirebaseDatabase.instance;

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  /// Signs in with email and password.
  Future<UserCredential> signIn({
    required String email,
    required String password,
  }) async {
    try {
      return await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
    } on FirebaseAuthException {
      rethrow;
    } catch (e) {
      throw FirebaseAuthException(code: 'unknown', message: e.toString());
    }
  }

  /// Public registration workflow.
  /// IMPORTANT ROLE-SECURITY RULE:
  /// Public registration ALWAYS creates a normal USER role account.
  /// Never accepts ADMIN from a client form.
  Future<UserProfile> registerUser({
    required String fullName,
    required String email,
    required String password,
    String? contactNumber,
  }) async {
    UserCredential? credential;
    try {
      credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );

      final user = credential.user;
      if (user == null) {
        throw FirebaseAuthException(
          code: 'null-user',
          message: 'Failed to retrieve user after registration.',
        );
      }

      await user.updateDisplayName(fullName.trim());

      final now = DateTime.now().toUtc().toIso8601String();
      final profile = UserProfile(
        uid: user.uid,
        fullName: fullName.trim(),
        email: email.trim(),
        contactNumber: contactNumber?.trim(),
        createdAt: now,
        role: UserRole.user, // Enforced USER role
      );

      // Write user profile record
      final profileRef = _database.ref(
        '${AppConstants.rtdbUserProfilesPath}/${user.uid}',
      );
      await profileRef.set(profile.toMap());

      // Write user role record (Strictly 'USER')
      final roleRef = _database.ref(
        '${AppConstants.rtdbUserRolesPath}/${user.uid}',
      );
      await roleRef.set({'role': AppConstants.roleUser, 'createdAt': now});

      return profile;
    } on FirebaseAuthException {
      // If profile creation failed after Auth creation, clean up or surface error
      rethrow;
    } catch (e) {
      // If RTDB profile creation failed, attempt to delete newly created auth user to avoid orphan account
      if (credential?.user != null) {
        try {
          await credential!.user!.delete();
        } catch (_) {}
      }
      throw FirebaseAuthException(
        code: 'profile-creation-failed',
        message: 'Could not create user profile: ${e.toString()}',
      );
    }
  }

  /// Sends a password reset email using Firebase Auth.
  Future<void> sendPasswordResetEmail(String email) async {
    await _auth.sendPasswordResetEmail(email: email.trim());
  }

  /// Signs out of Firebase.
  Future<void> signOut() async {
    await _auth.signOut();
  }
}
