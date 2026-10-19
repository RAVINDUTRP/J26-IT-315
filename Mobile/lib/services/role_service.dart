import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import '../core/constants/app_constants.dart';
import '../models/user_role.dart';

/// Service responsible for validating user authorization roles.
/// Follows strict security rules: roles are verified against trusted Firebase
/// custom claims and Realtime Database protected role records.
class RoleService {
  final FirebaseAuth _auth;
  final FirebaseDatabase _database;

  RoleService({FirebaseAuth? auth, FirebaseDatabase? database})
    : _auth = auth ?? FirebaseAuth.instance,
      _database = database ?? FirebaseDatabase.instance;

  /// Fetches and verifies the role for the given [uid].
  /// 1. Inspects Firebase Auth custom claims on the ID token.
  /// 2. Inspects RTDB `/userRoles/{uid}` record.
  Future<UserRole> getUserRole(
    String uid, {
    bool forceTokenRefresh = false,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user != null && user.uid == uid) {
        final idTokenResult = await user.getIdTokenResult(forceTokenRefresh);
        final claimRole = idTokenResult.claims?['role']?.toString();
        if (claimRole != null && claimRole.isNotEmpty) {
          final parsed = UserRole.fromString(claimRole);
          if (parsed != UserRole.none) {
            return parsed;
          }
        }
      }

      // Read from protected RTDB node
      final snapshot = await _database
          .ref('${AppConstants.rtdbUserRolesPath}/$uid')
          .get();

      if (snapshot.exists && snapshot.value is Map) {
        final roleData = snapshot.value as Map;
        final roleStr = roleData['role']?.toString();
        return UserRole.fromString(roleStr);
      }

      return UserRole.user; // Default fallback if no role record exists
    } catch (e) {
      // In case of permission errors or network issues, deny privileged access
      return UserRole.none;
    }
  }

  /// Listens to real-time changes on `/userRoles/{uid}`
  Stream<UserRole> streamUserRole(String uid) {
    return _database
        .ref('${AppConstants.rtdbUserRolesPath}/$uid')
        .onValue
        .map((event) {
          final val = event.snapshot.value;
          if (val is Map) {
            final roleStr = val['role']?.toString();
            return UserRole.fromString(roleStr);
          }
          return UserRole.none;
        })
        .handleError((_) => UserRole.none);
  }
}
