/// Roles supported by the AquaShield application.
enum UserRole {
  admin,
  user,
  none;

  static UserRole fromString(String? roleStr) {
    if (roleStr == null) return UserRole.none;
    switch (roleStr.trim().toUpperCase()) {
      case 'ADMIN':
        return UserRole.admin;
      case 'USER':
        return UserRole.user;
      default:
        return UserRole.none;
    }
  }

  String toDbValue() {
    switch (this) {
      case UserRole.admin:
        return 'ADMIN';
      case UserRole.user:
        return 'USER';
      case UserRole.none:
        return 'NONE';
    }
  }

  bool get isAdmin => this == UserRole.admin;
  bool get isUser => this == UserRole.user;

  String get displayName {
    switch (this) {
      case UserRole.admin:
        return 'Administrator';
      case UserRole.user:
        return 'Field Researcher';
      case UserRole.none:
        return 'Unassigned';
    }
  }
}
