import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../utils/formatters.dart';

/// Interactive OpenStreetMap widget that displays the real-time boat GPS coordinates,
/// custom watercraft marker, satellite status, and external navigation link.
class BoatMapCard extends StatefulWidget {
  final double? latitude;
  final double? longitude;
  final bool gpsValid;
  final int satellites;
  final double? speedKmh;
  final double? altitudeM;

  const BoatMapCard({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.gpsValid,
    this.satellites = 0,
    this.speedKmh,
    this.altitudeM,
  });

  @override
  State<BoatMapCard> createState() => _BoatMapCardState();
}

class _BoatMapCardState extends State<BoatMapCard> {
  late final MapController _mapController;
  double _currentZoom = 15.0;
  bool _isMarkerInfoVisible = true;

  // Default fallback coordinates (Sri Lanka research lake / inland water body)
  static const double defaultLat = 6.419002;
  static const double defaultLng = 80.823292;

  bool get _hasValidPosition {
    return widget.gpsValid &&
        widget.latitude != null &&
        widget.longitude != null &&
        widget.latitude != 0.0 &&
        widget.longitude != 0.0;
  }

  LatLng get _currentPoint {
    if (_hasValidPosition) {
      return LatLng(widget.latitude!, widget.longitude!);
    }
    return const LatLng(defaultLat, defaultLng);
  }

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
  }

  @override
  void didUpdateWidget(covariant BoatMapCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Auto-center map if new valid position is received
    if (_hasValidPosition &&
        (oldWidget.latitude != widget.latitude ||
            oldWidget.longitude != widget.longitude)) {
      _mapController.move(_currentPoint, _currentZoom);
    }
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  void _recenterMap() {
    _mapController.move(_currentPoint, 15.5);
    setState(() {
      _currentZoom = 15.5;
      _isMarkerInfoVisible = true;
    });
  }

  void _zoomIn() {
    final newZoom = (_currentZoom + 1).clamp(3.0, 18.0);
    _mapController.move(_mapController.camera.center, newZoom);
    setState(() => _currentZoom = newZoom);
  }

  void _zoomOut() {
    final newZoom = (_currentZoom - 1).clamp(3.0, 18.0);
    _mapController.move(_mapController.camera.center, newZoom);
    setState(() => _currentZoom = newZoom);
  }

  Future<void> _openInExternalMaps() async {
    final lat = _hasValidPosition ? widget.latitude! : defaultLat;
    final lng = _hasValidPosition ? widget.longitude! : defaultLng;
    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');

    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {
      // Ignored if external app launch is unsupported
    }
  }

  @override
  Widget build(BuildContext context) {
    final point = _currentPoint;
    final hasValid = _hasValidPosition;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.navyDark.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.navyDark.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Interactive Map View with Overlaid Controls
          SizedBox(
            height: 250,
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: point,
                    initialZoom: _currentZoom,
                    minZoom: 3.0,
                    maxZoom: 18.0,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                    ),
                    onPositionChanged: (camera, hasGesture) {
                      if (hasGesture) {
                        _currentZoom = camera.zoom;
                      }
                    },
                  ),
                  children: [
                    // OpenStreetMap Standard Tiles
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.aquashield.aquashield',
                      maxZoom: 19,
                    ),

                    // Custom Boat Marker
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: point,
                          width: 80,
                          height: 80,
                          child: GestureDetector(
                            onTap: () {
                              setState(() {
                                _isMarkerInfoVisible = !_isMarkerInfoVisible;
                              });
                            },
                            child: _buildBoatMarker(hasValid),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                // Top Left: Satellite & Fix Status Pill
                Positioned(
                  top: 12,
                  left: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.12),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: hasValid ? AppColors.statusOnline : AppColors.statusWarning,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          hasValid
                              ? 'GPS FIX (${widget.satellites} SATS)'
                              : 'SEARCHING SATS (${widget.satellites})',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: hasValid ? AppColors.statusOnline : AppColors.statusWarning,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Top Right: Floating Map Control Buttons
                Positioned(
                  top: 12,
                  right: 12,
                  child: Column(
                    children: [
                      // Re-center boat
                      _buildMapButton(
                        icon: Icons.my_location,
                        tooltip: 'Recenter Boat',
                        onPressed: _recenterMap,
                        color: AppColors.aquaDark,
                      ),
                      const SizedBox(height: 6),
                      // Zoom In
                      _buildMapButton(
                        icon: Icons.add,
                        tooltip: 'Zoom In',
                        onPressed: _zoomIn,
                      ),
                      const SizedBox(height: 6),
                      // Zoom Out
                      _buildMapButton(
                        icon: Icons.remove,
                        tooltip: 'Zoom Out',
                        onPressed: _zoomOut,
                      ),
                      const SizedBox(height: 6),
                      // Open External Google Maps
                      _buildMapButton(
                        icon: Icons.open_in_new,
                        tooltip: 'Open in Google Maps',
                        onPressed: _openInExternalMaps,
                        color: AppColors.navyPrimary,
                      ),
                    ],
                  ),
                ),

                // Marker Floating Info Pill (if toggled)
                if (_isMarkerInfoVisible)
                  Positioned(
                    bottom: 10,
                    left: 12,
                    right: 60,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.navyDark.withValues(alpha: 0.88),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.directions_boat,
                            color: AppColors.aquaLight,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              hasValid
                                  ? 'AquaShield Node • ${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}'
                                  : 'AquaShield Node (Default Area: Sri Lanka)',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // 2. Coordinate & Kinematics Data Strip
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _buildCoordinateTile(
                        label: 'Latitude',
                        value: Formatters.formatCoordinate(
                          hasValid ? widget.latitude : defaultLat,
                          isLatitude: true,
                        ),
                        icon: Icons.north,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildCoordinateTile(
                        label: 'Longitude',
                        value: Formatters.formatCoordinate(
                          hasValid ? widget.longitude : defaultLng,
                          isLatitude: false,
                        ),
                        icon: Icons.east,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildKinematicItem(
                      label: 'Speed',
                      value: '${Formatters.formatDecimal(widget.speedKmh, precision: 1)} km/h',
                      icon: Icons.speed,
                    ),
                    _buildKinematicItem(
                      label: 'Altitude',
                      value: '${Formatters.formatDecimal(widget.altitudeM, precision: 1)} m',
                      icon: Icons.terrain,
                    ),
                    _buildKinematicItem(
                      label: 'Satellites',
                      value: '${widget.satellites}',
                      icon: Icons.satellite_alt,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBoatMarker(bool hasValid) {
    return Center(
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Radar pulse ring
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: (hasValid ? AppColors.aquaPrimary : Colors.amber)
                  .withValues(alpha: 0.25),
              border: Border.all(
                color: (hasValid ? AppColors.aquaPrimary : Colors.amber)
                    .withValues(alpha: 0.6),
                width: 1.5,
              ),
            ),
          ),
          // Inner boat beacon
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.navyPrimary,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const Icon(
              Icons.directions_boat,
              size: 15,
              color: AppColors.aquaLight,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    Color? color,
  }) {
    return Material(
      color: Colors.white.withValues(alpha: 0.92),
      borderRadius: BorderRadius.circular(8),
      elevation: 2,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onPressed,
        child: Tooltip(
          message: tooltip,
          child: Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            child: Icon(
              icon,
              size: 18,
              color: color ?? AppColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCoordinateTile({
    required String label,
    required String value,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              Icon(icon, size: 14, color: AppColors.aquaDark),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  value,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildKinematicItem({
    required String label,
    required String value,
    required IconData icon,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.textMuted),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
            ),
          ],
        ),
      ],
    );
  }
}
