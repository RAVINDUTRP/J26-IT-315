import 'user_role.dart';

/// User profile model corresponding to `/userProfiles/{uid}` in RTDB.
class UserProfile {
  final String uid;
  final String fullName;
  final String email;
  final String? contactNumber;
  final String createdAt;
  final UserRole role;

  const UserProfile({
    required this.uid,
    required this.fullName,
    required this.email,
    this.contactNumber,
    required this.createdAt,
    this.role = UserRole.user,
  });

  factory UserProfile.fromMap(
    String uid,
    Map<dynamic, dynamic>? map, {
    UserRole role = UserRole.user,
  }) {
    if (map == null) {
      return UserProfile(
        uid: uid,
        fullName: 'Unknown User',
        email: '',
        createdAt: '',
        role: role,
      );
    }

    return UserProfile(
      uid: uid,
      fullName: map['fullName']?.toString() ?? 'AquaShield User',
      email: map['email']?.toString() ?? '',
      contactNumber: map['contactNumber']?.toString(),
      createdAt: map['createdAt']?.toString() ?? '',
      role: role,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'fullName': fullName,
      'email': email,
      'contactNumber': contactNumber ?? '',
      'createdAt': createdAt,
    };
  }

  UserProfile copyWith({
    String? fullName,
    String? email,
    String? contactNumber,
    String? createdAt,
    UserRole? role,
  }) {
    return UserProfile(
      uid: uid,
      fullName: fullName ?? this.fullName,
      email: email ?? this.email,
      contactNumber: contactNumber ?? this.contactNumber,
      createdAt: createdAt ?? this.createdAt,
      role: role ?? this.role,
    );
  }
}
