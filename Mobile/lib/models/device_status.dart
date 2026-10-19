/// Status of the base station gateway node from `/device_status/gateway`.
class GatewayStatus {
  final int duplicatesRejected;
  final bool firebaseConnected;
  final int freeHeapKb;
  final String status;
  final int totalLoraPackets;
  final int uptimeSec;
  final bool wifiConnected;
  final String wifiIp;
  final int wifiRssi;

  const GatewayStatus({
    this.duplicatesRejected = 0,
    this.firebaseConnected = false,
    this.freeHeapKb = 0,
    this.status = 'unknown',
    this.totalLoraPackets = 0,
    this.uptimeSec = 0,
    this.wifiConnected = false,
    this.wifiIp = '',
    this.wifiRssi = 0,
  });

  factory GatewayStatus.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const GatewayStatus();
    return GatewayStatus(
      duplicatesRejected: (map['duplicates_rejected'] as num?)?.toInt() ?? 0,
      firebaseConnected: map['firebase_connected'] == true,
      freeHeapKb: (map['free_heap_kb'] as num?)?.toInt() ?? 0,
      status: map['status']?.toString() ?? 'unknown',
      totalLoraPackets: (map['total_lora_packets'] as num?)?.toInt() ?? 0,
      uptimeSec: (map['uptime_sec'] as num?)?.toInt() ?? 0,
      wifiConnected: map['wifi_connected'] == true,
      wifiIp: map['wifi_ip']?.toString() ?? '',
      wifiRssi: (map['wifi_rssi'] as num?)?.toInt() ?? 0,
    );
  }

  bool get isOnline => status.toLowerCase() == 'online';
}

/// Status of a LoRa mesh node (e.g. boat_001, repeater_01, repeater_02)
class NodeDeviceStatus {
  final String nodeName;
  final String? lastRoute;
  final int lastSeenSec;
  final int packetCount;
  final int rssi;
  final double snr;
  final String status;

  const NodeDeviceStatus({
    required this.nodeName,
    this.lastRoute,
    this.lastSeenSec = 4294967295,
    this.packetCount = 0,
    this.rssi = 0,
    this.snr = 0.0,
    this.status = 'offline',
  });

  factory NodeDeviceStatus.fromMap(
    String nodeName,
    Map<dynamic, dynamic>? map,
  ) {
    if (map == null) return NodeDeviceStatus(nodeName: nodeName);
    return NodeDeviceStatus(
      nodeName: nodeName,
      lastRoute: map['last_route']?.toString(),
      lastSeenSec: (map['last_seen_sec'] as num?)?.toInt() ?? 4294967295,
      packetCount: (map['packet_count'] as num?)?.toInt() ?? 0,
      rssi: (map['rssi'] as num?)?.toInt() ?? 0,
      snr: (map['snr'] as num?)?.toDouble() ?? 0.0,
      status: map['status']?.toString() ?? 'offline',
    );
  }

  bool get isOnline => status.toLowerCase() == 'online';
}

/// Root Model representing `/device_status` node in Firebase RTDB.
class DeviceStatusData {
  final GatewayStatus gateway;
  final NodeDeviceStatus boat001;
  final NodeDeviceStatus repeater01;
  final NodeDeviceStatus repeater02;
  final String? lastUpdated;

  const DeviceStatusData({
    required this.gateway,
    required this.boat001,
    required this.repeater01,
    required this.repeater02,
    this.lastUpdated,
  });

  factory DeviceStatusData.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) {
      return const DeviceStatusData(
        gateway: GatewayStatus(),
        boat001: NodeDeviceStatus(nodeName: 'boat_001'),
        repeater01: NodeDeviceStatus(nodeName: 'repeater_01'),
        repeater02: NodeDeviceStatus(nodeName: 'repeater_02'),
      );
    }

    final rawGateway = map['gateway'] is Map ? map['gateway'] as Map : null;
    final rawBoat = map['boat_001'] is Map ? map['boat_001'] as Map : null;
    final rawRep1 = map['repeater_01'] is Map
        ? map['repeater_01'] as Map
        : null;
    final rawRep2 = map['repeater_02'] is Map
        ? map['repeater_02'] as Map
        : null;

    return DeviceStatusData(
      gateway: GatewayStatus.fromMap(rawGateway),
      boat001: NodeDeviceStatus.fromMap('boat_001', rawBoat),
      repeater01: NodeDeviceStatus.fromMap('repeater_01', rawRep1),
      repeater02: NodeDeviceStatus.fromMap('repeater_02', rawRep2),
      lastUpdated: map['last_updated']?.toString(),
    );
  }

  List<NodeDeviceStatus> get allMeshNodes => [boat001, repeater01, repeater02];
}
