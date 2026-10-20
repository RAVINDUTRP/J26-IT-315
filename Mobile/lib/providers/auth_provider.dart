import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import '../models/user_profile.dart';
import '../models/user_role.dart';
import '../services/auth_service.dart';
import '../services/role_service.dart';
import '../services/rtdb_service.dart';

enum AuthStatus {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
  error,
}

/// Provider managing authentication state, role verification, and user profile.
class AppAuthProvider extends ChangeNotifier {
  final AuthService _authService;
  final RoleService _roleService;
  final RtdbService _rtdbService;

  StreamSubscription<User?>? _authSubscription;
  StreamSubscription<UserProfile?>? _profileSubscription;

  AuthStatus _status = AuthStatus.initial;
  User? _currentUser;
  UserProfile? _userProfile;
  UserRole _userRole = UserRole.none;
  String? _errorMessage;

  AppAuthProvider({
    AuthService? authService,
    RoleService? roleService,
    RtdbService? rtdbService,
  }) : _authService = authService ?? AuthService(),
       _roleService = roleService ?? RoleService(),
       _rtdbService = rtdbService ?? RtdbService() {
    _initAuthListener();
  }

  AuthStatus get status => _status;
  User? get currentUser => _currentUser;
  UserProfile? get userProfile => _userProfile;
  UserRole get userRole => _userRole;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated =>
      _status == AuthStatus.authenticated && _currentUser != null;
  bool get isAdmin => _userRole == UserRole.admin;
  bool get isUser => _userRole == UserRole.user;
  bool get isLoading => _status == AuthStatus.authenticating;

  void _initAuthListener() {
    _authSubscription = _authService.authStateChanges.listen((user) async {
      if (user == null) {
        _currentUser = null;
        _userProfile = null;
        _userRole = UserRole.none;
        _status = AuthStatus.unauthenticated;
        _cancelProfileSubscription();
        notifyListeners();
      } else {
        _currentUser = user;
        await _loadUserRoleAndProfile(user.uid);
      }
    });
  }

  Future<void> _loadUserRoleAndProfile(String uid) async {
    try {
      final role = await _roleService.getUserRole(uid);
      _userRole = role;

      final profile = await _rtdbService.fetchUserProfile(uid);
      _userProfile =
          profile?.copyWith(role: role) ??
          UserProfile(
            uid: uid,
            fullName: _currentUser?.displayName ?? 'AquaShield User',
            email: _currentUser?.email ?? '',
            createdAt: '',
            role: role,
          );

      _status = AuthStatus.authenticated;
      _errorMessage = null;

      // Subscribe to profile updates
      _subscribeToProfile(uid);
    } catch (e) {
      _status = AuthStatus.error;
      _errorMessage = 'Failed to load user profile: ${e.toString()}';
    }
    notifyListeners();
  }

  void _subscribeToProfile(String uid) {
    _cancelProfileSubscription();
    _profileSubscription = _rtdbService.streamUserProfile(uid).listen((
      profile,
    ) {
      if (profile != null) {
        _userProfile = profile.copyWith(role: _userRole);
        notifyListeners();
      }
    });
  }

  void _cancelProfileSubscription() {
    _profileSubscription?.cancel();
    _profileSubscription = null;
  }

  /// Authenticate with email & password
  Future<bool> signIn({required String email, required String password}) async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      final cred = await _authService.signIn(email: email, password: password);
      if (cred.user != null) {
        await _loadUserRoleAndProfile(cred.user!.uid);
        return true;
      }
      return false;
    } on FirebaseAuthException catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = _getReadableAuthError(e.code, e.message);
      notifyListeners();
      return false;
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'An unexpected error occurred: ${e.toString()}';
      notifyListeners();
      return false;
    }
  }

  /// Register user with guaranteed USER role
  Future<bool> register({
    required String fullName,
    required String email,
    required String password,
    String? contactNumber,
  }) async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      final profile = await _authService.registerUser(
        fullName: fullName,
        email: email,
        password: password,
        contactNumber: contactNumber,
      );

      _userProfile = profile;
      _userRole = UserRole.user; // Strictly user
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on FirebaseAuthException catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = _getReadableAuthError(e.code, e.message);
      notifyListeners();
      return false;
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'Registration failed: ${e.toString()}';
      notifyListeners();
      return false;
    }
  }

  /// Send password reset email
  Future<bool> sendPasswordReset(String email) async {
    try {
      await _authService.sendPasswordResetEmail(email);
      return true;
    } on FirebaseAuthException catch (e) {
      _errorMessage = _getReadableAuthError(e.code, e.message);
      notifyListeners();
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Sign out
  Future<void> signOut() async {
    _cancelProfileSubscription();
    await _authService.signOut();
    _currentUser = null;
    _userProfile = null;
    _userRole = UserRole.none;
    _status = AuthStatus.unauthenticated;
    _errorMessage = null;
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  String _getReadableAuthError(String code, String? fallback) {
    switch (code) {
      case 'user-not-found':
        return 'No registered account found with this email address.';
      case 'wrong-password':
      case 'invalid-credential':
        return 'Invalid email or password. Please check your credentials.';
      case 'email-already-in-use':
        return 'An account already exists for this email address.';
      case 'weak-password':
        return 'Password should be at least 6 characters long.';
      case 'invalid-email':
        return 'Please enter a valid email address.';
      case 'user-disabled':
        return 'This account has been disabled by an administrator.';
      case 'too-many-requests':
        return 'Too many failed login attempts. Please wait a few moments and try again.';
      case 'network-request-failed':
        return 'Network connection error. Please check your internet connectivity.';
      default:
        return fallback ?? 'Authentication failed ($code).';
    }
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    _cancelProfileSubscription();
    super.dispose();
  }
}
