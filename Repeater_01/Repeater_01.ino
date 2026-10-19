#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <WebServer.h>

#include "MeshConfig.h"
#include "MeshProtocol.h"
#include "LosslessCompression.h"
#include "MeshCrypto.h"
#include "PacketCodec.h"

// =============================================================================
// LORA BOAT REPEATER 01 FIRMWARE (STORE-AND-FORWARD MESH NODE)
// Node ID: REP_01 | Wi-Fi SSID: LORA_REPEATER_01 | IP: 192.168.4.1
// Collision Backoff: Slot 1 (120ms + jitter)
// =============================================================================

#define THIS_NODE_ID      REPEATER_01_NODE_ID // "REP_01"
#define SOFTAP_SSID       "LORA_REPEATER_01"
#define SOFTAP_PASS       "MeshPass123!"
#define BACKOFF_BASE_MS   REP1_BASE_BACKOFF_MS // 120ms
#define BACKOFF_JITTER_MS REP1_JITTER_MAX_MS  // 80ms

// -----------------------------------------------------------------------------
// WEB SERVER & SOFTAP CONFIGURATION
// -----------------------------------------------------------------------------
WebServer webServer(80);
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

// -----------------------------------------------------------------------------
// MESH PACKET COUNTERS & ROUTING METRICS
// -----------------------------------------------------------------------------
struct MeshStats {
    uint32_t total_received   = 0;
    uint32_t total_forwarded  = 0;
    uint32_t duplicates       = 0;
    uint32_t expired_hops     = 0;
    uint32_t routing_loops    = 0;
    uint32_t auth_failed      = 0;
    uint32_t crc_failed       = 0;
    uint32_t invalid_frames   = 0;
};
MeshStats meshStats;

// Bounded Expiring Duplicate Cache
DuplicateCacheEntry dupCache[MESH_DUP_CACHE_SIZE];
size_t dupCacheHead = 0;

// Node Liveness Tracker
NodeTrackInfo trackedNodes[4];

// Latest Decoded Boat Telemetry Cache (for Web Dashboard display)
BinaryTelemetry latestTelemetry;
bool hasTelemetry = false;
uint32_t lastTelemetrySeq = 0;
unsigned long lastTelemetryTime = 0;
int lastTelemetryRssi = 0;
float lastTelemetrySnr = 0.0f;
String lastRouteString = "None";

// Scheduled Forwarding Queue Entry (Avoids blocking during randomized backoff)
struct ScheduledTx {
    bool active = false;
    uint8_t buffer[LORA_HW_MAX_PAYLOAD];
    size_t length = 0;
    unsigned long transmit_at_ms = 0;
    uint32_t sequence = 0;
    char source[MESH_MAX_NODE_ID_LEN];
};
ScheduledTx scheduledForward;

unsigned long lastHeartbeatBroadcast = 0;
bool loraReady = false;

// =============================================================================
// NODE TRACKING HELPERS
// =============================================================================
void updateNodeLiveness(const char *nodeId, uint8_t nodeType, int rssi, float snr, uint8_t hops, const char *route) {
    unsigned long now = millis();
    int slot = -1;

    for (int i = 0; i < 4; i++) {
        if (trackedNodes[i].active && strncmp(trackedNodes[i].node_id, nodeId, MESH_MAX_NODE_ID_LEN) == 0) {
            slot = i;
            break;
        }
    }
    if (slot == -1) {
        for (int i = 0; i < 4; i++) {
            if (!trackedNodes[i].active) {
                slot = i;
                strncpy(trackedNodes[i].node_id, nodeId, MESH_MAX_NODE_ID_LEN - 1);
                trackedNodes[i].node_id[MESH_MAX_NODE_ID_LEN - 1] = '\0';
                trackedNodes[i].node_type = nodeType;
                trackedNodes[i].active = true;
                break;
            }
        }
    }
    if (slot != -1) {
        trackedNodes[slot].last_seen_ms = now;
        trackedNodes[slot].last_rssi = rssi;
        trackedNodes[slot].last_snr = snr;
        trackedNodes[slot].last_hops = hops;
        trackedNodes[slot].packet_count++;
        if (route) {
            strncpy(trackedNodes[slot].last_route, route, sizeof(trackedNodes[slot].last_route) - 1);
            trackedNodes[slot].last_route[sizeof(trackedNodes[slot].last_route) - 1] = '\0';
        }
    }
}

NodeStatus getNodeStatus(unsigned long lastSeenMs) {
    if (lastSeenMs == 0) return NODE_OFFLINE;
    unsigned long age = millis() - lastSeenMs;
    if (age <= NODE_STALE_TIMEOUT_MS) return NODE_ONLINE;
    if (age <= NODE_OFFLINE_TIMEOUT_MS) return NODE_STALE;
    return NODE_OFFLINE;
}

const char* statusToString(NodeStatus s) {
    switch (s) {
        case NODE_ONLINE:  return "ONLINE";
        case NODE_STALE:   return "STALE";
        case NODE_OFFLINE: return "OFFLINE";
        default:           return "UNKNOWN";
    }
}

// =============================================================================
// WEB SERVER API & DASHBOARD HANDLERS
// =============================================================================
void handleApiStatus() {
    String json = "{";
    json += "\"node_id\":\"" + String(THIS_NODE_ID) + "\",";
    json += "\"uptime_sec\":" + String(millis() / 1000) + ",";
    json += "\"free_heap\":" + String(ESP.getFreeHeap()) + ",";
    json += "\"wifi_clients\":" + String(WiFi.softAPgetStationNum()) + ",";
    json += "\"lora\":{";
    json += "\"freq_mhz\":" + String(LORA_FREQUENCY / 1E6, 1) + ",";
    json += "\"sync_word\":\"0x" + String(LORA_SYNC_WORD, HEX) + "\",";
    json += "\"sf\":" + String(LORA_SPREAD_FACTOR) + ",";
    json += "\"bw_khz\":" + String(LORA_BANDWIDTH / 1E3, 0) + ",";
    json += "\"cr\":\"4/" + String(LORA_CODING_RATE) + "\"";
    json += "},";
    json += "\"stats\":{";
    json += "\"received\":" + String(meshStats.total_received) + ",";
    json += "\"forwarded\":" + String(meshStats.total_forwarded) + ",";
    json += "\"duplicates\":" + String(meshStats.duplicates) + ",";
    json += "\"expired_hops\":" + String(meshStats.expired_hops) + ",";
    json += "\"routing_loops\":" + String(meshStats.routing_loops) + ",";
    json += "\"auth_failed\":" + String(meshStats.auth_failed) + ",";
    json += "\"crc_failed\":" + String(meshStats.crc_failed) + ",";
    json += "\"invalid\":" + String(meshStats.invalid_frames);
    json += "},";
    json += "\"nodes\":[";
    bool first = true;
    for (int i = 0; i < 4; i++) {
        if (!trackedNodes[i].active) continue;
        if (!first) json += ",";
        first = false;
        NodeStatus st = getNodeStatus(trackedNodes[i].last_seen_ms);
        unsigned long age = (millis() - trackedNodes[i].last_seen_ms) / 1000;
        json += "{";
        json += "\"id\":\"" + String(trackedNodes[i].node_id) + "\",";
        json += "\"status\":\"" + String(statusToString(st)) + "\",";
        json += "\"age_sec\":" + String(age) + ",";
        json += "\"rssi\":" + String(trackedNodes[i].last_rssi) + ",";
        json += "\"snr\":" + String(trackedNodes[i].last_snr, 1) + ",";
        json += "\"hops\":" + String(trackedNodes[i].last_hops) + ",";
        json += "\"packets\":" + String(trackedNodes[i].packet_count) + ",";
        json += "\"route\":\"" + String(trackedNodes[i].last_route) + "\"";
        json += "}";
    }
    json += "]}";
    webServer.sendHeader("Access-Control-Allow-Origin", "*");
    webServer.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    webServer.sendHeader("Pragma", "no-cache");
    webServer.sendHeader("Expires", "0");
    webServer.send(200, "application/json", json);
}

void handleApiTelemetry() {
    webServer.sendHeader("Access-Control-Allow-Origin", "*");
    webServer.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    webServer.sendHeader("Pragma", "no-cache");
    webServer.sendHeader("Expires", "0");
    if (!hasTelemetry) {
        webServer.send(200, "application/json", "{\"status\":\"NO_DATA_YET\"}");
        return;
    }
    String json = PacketCodec::serializeTelemetryToJson(
        latestTelemetry, BOAT_NODE_ID, lastTelemetrySeq, 0, lastTelemetryTime
    );
    json.remove(json.length() - 1);
    json += ",\"rx_rssi\":" + String(lastTelemetryRssi) + ",";
    json += "\"rx_snr\":" + String(lastTelemetrySnr, 1) + ",";
    json += "\"rx_route\":\"" + lastRouteString + "\",";
    json += "\"age_sec\":" + String((millis() - lastTelemetryTime) / 1000) + "}";
    webServer.send(200, "application/json", json);
}

void handleRoot() {
    String html = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Repeater 01 Dashboard</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--card-border:#334155;--primary:#38bdf8;--accent:#818cf8;--success:#22c55e;--warn:#f59e0b;--danger:#ef4444;--text:#f8fafc;--muted:#94a3b8}
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body{background:var(--bg);color:var(--text);padding:16px;min-height:100vh}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:var(--card);border:1px solid var(--card-border);border-radius:12px;margin-bottom:16px}
.badge{padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:700}
.badge-online{background:rgba(34,197,94,0.2);color:var(--success);border:1px solid var(--success)}
.badge-stale{background:rgba(245,158,11,0.2);color:var(--warn);border:1px solid var(--warn)}
.badge-offline{background:rgba(239,68,68,0.2);color:var(--danger);border:1px solid var(--danger)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--card-border);border-radius:12px;padding:16px}
.card h3{font-size:14px;color:var(--primary);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid var(--card-border);padding-bottom:6px}
.stat-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}
.stat-val{font-weight:600;color:#fff}
.table-wrapper{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px;border-radius:8px}
.table-wrapper::-webkit-scrollbar{height:6px}
.table-wrapper::-webkit-scrollbar-track{background:rgba(255,255,255,0.05);border-radius:3px}
.table-wrapper::-webkit-scrollbar-thumb{background:var(--card-border);border-radius:3px}
table{width:100%;min-width:640px;border-collapse:collapse;font-size:12px}
th,td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--card-border);white-space:nowrap}
th{color:var(--muted);font-weight:600;background:rgba(15,23,42,0.4)}
.scroll-hint{display:none;font-size:11px;color:var(--muted);background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;border:1px solid var(--card-border)}
@media(max-width:700px){
  body{padding:10px}
  header{flex-direction:column;align-items:flex-start;gap:8px}
  header>div:last-child{text-align:left}
  .grid{grid-template-columns:1fr}
  .scroll-hint{display:inline-block}
}
</style>
</head>
<body>
<header>
  <div>
    <h1 style="font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px">
      <span style="color:var(--primary)">LoRa Repeater 01</span>
      <span class="badge badge-online">REP_01</span>
      <span id="liveStatus" class="badge" style="background:rgba(56,189,248,0.2);color:var(--primary);border:1px solid var(--primary)">● Connecting...</span>
    </h1>
    <p style="font-size:12px;color:var(--muted);margin-top:4px">Slot 1 Forwarder (120ms Base Backoff)</p>
  </div>
  <div style="text-align:right">
    <div style="font-size:12px;color:var(--muted)">Uptime: <span id="uptime" style="color:#fff;font-weight:600">0s</span></div>
    <div style="font-size:12px;color:var(--muted);margin-top:2px">Wi-Fi Clients: <span id="wifiClients" style="color:var(--primary);font-weight:700">0</span></div>
  </div>
</header>

<div id="statusBanner" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);padding:10px 14px;border-radius:10px;font-size:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:8px">
    <span id="bannerIcon">📡</span>
    <span id="bannerText">Listening on 433 MHz... Waiting for Boat transmissions (sends every 60s)</span>
  </div>
  <span id="bannerSub" style="color:var(--muted);font-size:11px">Auto-refresh: 2s</span>
</div>

<div class="grid">
  <div class="card">
    <h3>Mesh Routing Statistics</h3>
    <div style="display:flex;gap:12px;margin-bottom:8px">
      <div style="flex:1"><div class="big-stat" id="statFwd">0</div><div style="font-size:11px;color:var(--muted)">FORWARDED</div></div>
      <div style="flex:1"><div class="big-stat" id="statRecv" style="color:var(--accent)">0</div><div style="font-size:11px;color:var(--muted)">RECEIVED</div></div>
      <div style="flex:1"><div class="big-stat" id="statDup" style="color:var(--warn)">0</div><div style="font-size:11px;color:var(--muted)">DUPLICATES</div></div>
    </div>
    <div class="stat-row"><span>Hop Limit Exceeded:</span><span class="stat-val" id="statExp">0</span></div>
    <div class="stat-row"><span>Routing Loops Prevented:</span><span class="stat-val" id="statLoop">0</span></div>
    <div class="stat-row"><span>CRC / Auth Rejections:</span><span class="stat-val" id="statCrc">0</span></div>
  </div>

  <div class="card">
    <h3>LoRa Radio Configuration</h3>
    <div class="stat-row"><span>Frequency:</span><span class="stat-val" id="radioFreq">433.0 MHz</span></div>
    <div class="stat-row"><span>Sync Word:</span><span class="stat-val" id="radioSync">0xF3</span></div>
    <div class="stat-row"><span>Spreading Factor:</span><span class="stat-val" id="radioSf">SF7</span></div>
    <div class="stat-row"><span>Bandwidth:</span><span class="stat-val" id="radioBw">125 kHz</span></div>
    <div class="stat-row"><span>Backoff Slot:</span><span class="stat-val">120ms + Jitter</span></div>
    <div class="stat-row"><span>Free Heap:</span><span class="stat-val" id="freeHeap">0 KB</span></div>
  </div>

  <div class="card">
    <h3>Latest Boat Water Quality</h3>
    <div class="stat-row"><span>Water Temperature:</span><span class="stat-val" id="boatWTemp">-- &deg;C</span></div>
    <div class="stat-row"><span>pH Level:</span><span class="stat-val" id="boatPH">--</span></div>
    <div class="stat-row"><span>TDS:</span><span class="stat-val" id="boatTDS">-- ppm</span></div>
    <div class="stat-row"><span>Turbidity:</span><span class="stat-val" id="boatTurb">-- %</span></div>
    <div class="stat-row"><span>Air Temp & Hum:</span><span class="stat-val" id="boatAir">-- &deg;C / -- %</span></div>
    <div class="stat-row"><span>Data Age:</span><span class="stat-val" id="telemetryAge">Waiting...</span></div>
  </div>

  <div class="card">
    <h3>Boat Navigation & Motion</h3>
    <div class="stat-row"><span>GPS Latitude:</span><span class="stat-val" id="boatLat">--</span></div>
    <div class="stat-row"><span>GPS Longitude:</span><span class="stat-val" id="boatLon">--</span></div>
    <div class="stat-row"><span>Speed & Sats:</span><span class="stat-val" id="boatSpeed">-- km/h (0 sats)</span></div>
    <div class="stat-row"><span>Roll & Pitch:</span><span class="stat-val" id="boatAttitude">--&deg; / --&deg;</span></div>
    <div class="stat-row"><span>Route Path:</span><span class="stat-val" id="routePath" style="color:var(--primary);font-size:11px">--</span></div>
    <div class="stat-row"><span>Last RSSI / SNR:</span><span class="stat-val" id="linkQuality">-- dBm / -- dB</span></div>
  </div>
</div>

<div class="card" style="overflow:hidden">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--card-border);padding-bottom:6px">
    <h3 style="margin:0;border:none;padding:0">Mesh Node Heartbeat & Status Tracker</h3>
    <span class="scroll-hint">&larr; Swipe to view &rarr;</span>
  </div>
  <div class="table-wrapper">
    <table>
      <thead><tr><th>Node ID</th><th>Status</th><th>Last Seen</th><th>Signal (RSSI)</th><th>SNR</th><th>Hops</th><th>Packets</th><th>Observed Route</th></tr></thead>
      <tbody id="nodesTable"><tr><td colspan="8" style="text-align:center;color:var(--muted)">Discovering mesh nodes...</td></tr></tbody>
    </table>
  </div>
</div>

<script>
function updateData(){
  let ts = Date.now();
  fetch('/api/status?_=' + ts, {cache: 'no-store'}).then(r=>{
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(d=>{
    let live = document.getElementById('liveStatus');
    if(live){ live.innerText = '● Live'; live.className = 'badge badge-online'; }

    if(d.uptime_sec !== undefined){
      document.getElementById('uptime').innerText = Math.floor(d.uptime_sec/60) + 'm ' + (d.uptime_sec%60) + 's';
    }
    if(d.wifi_clients !== undefined) document.getElementById('wifiClients').innerText = d.wifi_clients;

    if(d.stats){
      document.getElementById('statFwd').innerText = d.stats.forwarded || 0;
      document.getElementById('statRecv').innerText = d.stats.received || 0;
      document.getElementById('statDup').innerText = d.stats.duplicates || 0;
      document.getElementById('statExp').innerText = d.stats.expired_hops || 0;
      document.getElementById('statLoop').innerText = d.stats.routing_loops || 0;
      document.getElementById('statCrc').innerText = (d.stats.crc_failed || 0) + (d.stats.auth_failed || 0);

      let bText = document.getElementById('bannerText');
      let bIcon = document.getElementById('bannerIcon');
      let bBox = document.getElementById('statusBanner');
      if(d.stats.received > 0 && bBox){
        bIcon.innerText = '✅';
        bText.innerHTML = `<strong>Mesh Link Active:</strong> Received ${d.stats.received} packet(s). Forwarded ${d.stats.forwarded} to gateway.`;
        bBox.style.borderColor = 'var(--success)';
        bBox.style.background = 'rgba(34,197,94,0.12)';
      }
    }

    if(d.lora){
      document.getElementById('radioFreq').innerText = d.lora.freq_mhz + ' MHz';
      document.getElementById('radioSync').innerText = d.lora.sync_word;
      document.getElementById('radioSf').innerText = 'SF' + d.lora.sf;
      document.getElementById('radioBw').innerText = d.lora.bw_khz + ' kHz';
    }
    if(d.free_heap) document.getElementById('freeHeap').innerText = Math.round(d.free_heap/1024) + ' KB';

    let tbl = document.getElementById('nodesTable');
    if(d.nodes && d.nodes.length > 0){
      let h = '';
      d.nodes.forEach(n=>{
        let bClass = (n.status === 'ONLINE') ? 'badge-online' : ((n.status === 'STALE') ? 'badge-stale' : 'badge-offline');
        h += `<tr><td><strong>${n.id}</strong></td><td><span class="badge ${bClass}">${n.status}</span></td><td>${n.age_sec}s ago</td><td>${n.rssi} dBm</td><td>${n.snr} dB</td><td>${n.hops}</td><td>${n.packets}</td><td style="color:var(--primary)">${n.route || '--'}</td></tr>`;
      });
      tbl.innerHTML = h;
    }
  }).catch(e=>{
    console.log('Status error:', e);
    let live = document.getElementById('liveStatus');
    if(live){ live.innerText = '● Reconnecting'; live.className = 'badge badge-offline'; }
  });

  fetch('/api/telemetry?_=' + ts, {cache: 'no-store'}).then(r=>{
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(d=>{
    if(d && d.status !== 'NO_DATA_YET' && d.water){
      document.getElementById('boatWTemp').innerText = (d.water.wt !== null && d.water.wt !== undefined) ? d.water.wt + ' °C' : 'N/A';
      document.getElementById('boatPH').innerText = (d.water.ph !== null && d.water.ph !== undefined) ? d.water.ph : 'N/A';
      document.getElementById('boatTDS').innerText = (d.water.tds !== null && d.water.tds !== undefined) ? d.water.tds + ' ppm' : 'N/A';
      document.getElementById('boatTurb').innerText = (d.water.turb !== null && d.water.turb !== undefined) ? d.water.turb + ' %' : 'N/A';
      document.getElementById('boatAir').innerText = `${(d.env && d.env.t!==null)?d.env.t:'--'} °C / ${(d.env && d.env.h!==null)?d.env.h:'--'} %`;
      document.getElementById('telemetryAge').innerText = (d.age_sec !== undefined) ? d.age_sec + 's ago' : 'Live';

      if(d.gps && d.gps.ok && d.gps.lat !== null && d.gps.lon !== null){
        let lat = Number(d.gps.lat);
        let lon = Number(d.gps.lon);
        document.getElementById('boatLat').innerText = !isNaN(lat) ? lat.toFixed(6) : String(d.gps.lat);
        document.getElementById('boatLon').innerText = !isNaN(lon) ? lon.toFixed(6) : String(d.gps.lon);
        document.getElementById('boatSpeed').innerText = `${d.gps.spd !== null ? d.gps.spd : 0} km/h (${d.gps.sat || 0} sats)`;
      } else {
        document.getElementById('boatLat').innerText = 'No GPS Fix';
        document.getElementById('boatLon').innerText = 'No GPS Fix';
        document.getElementById('boatSpeed').innerText = '0 km/h (0 sats)';
      }
      if(d.imu && d.imu.ok){
        document.getElementById('boatAttitude').innerText = `Roll: ${d.imu.roll}° | Pitch: ${d.imu.pitch}°`;
      }
      document.getElementById('routePath').innerText = d.rx_route || '--';
      document.getElementById('linkQuality').innerText = `${d.rx_rssi} dBm / ${d.rx_snr} dB`;
    }
  }).catch(e=>{
    console.log('Telemetry fetch error:', e);
  });
}
setInterval(updateData, 2000);
updateData();
</script>
</body>
</html>)rawliteral";
    webServer.send(200, "text/html", html);
}

// =============================================================
// REPEATER STORE-AND-FORWARD ENGINE
// =============================================================
void processIncomingLoRaPacket() {
    int packetSize = LoRa.parsePacket();
    if (!packetSize) return;

    meshStats.total_received++;
    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    if (packetSize < (int)(sizeof(MeshHeader) + 2) || packetSize > LORA_HW_MAX_PAYLOAD) {
        meshStats.invalid_frames++;
        return;
    }

    uint8_t rxBuffer[LORA_HW_MAX_PAYLOAD];
    int bytesRead = 0;
    while (LoRa.available() && bytesRead < packetSize) {
        rxBuffer[bytesRead++] = (uint8_t)LoRa.read();
    }

    // CRC16 Check
    uint16_t expectedCrc = ((uint16_t)rxBuffer[packetSize - 2] << 8) | rxBuffer[packetSize - 1];
    uint16_t actualCrc = meshCalculateCRC16(rxBuffer, packetSize - 2);
    if (expectedCrc != actualCrc) {
        meshStats.crc_failed++;
        return;
    }

    MeshHeader header;
    memcpy(&header, rxBuffer, sizeof(MeshHeader));
    if (header.magic != MESH_MAGIC_BYTE) {
        meshStats.invalid_frames++;
        return;
    }

    unsigned long now = millis();

    // Duplicate Check
    if (PacketCodec::isDuplicatePacket(dupCache, MESH_DUP_CACHE_SIZE, header.source_id, header.session_id, header.sequence_id, now, MESH_DUP_EXPIRY_MS)) {
        meshStats.duplicates++;
        return;
    }
    PacketCodec::registerPacketInCache(dupCache, MESH_DUP_CACHE_SIZE, dupCacheHead, header.source_id, header.session_id, header.sequence_id, header.msg_type, now);

    // Loop Prevention
    if (PacketCodec::isNodeInPath(header, THIS_NODE_ID)) {
        meshStats.routing_loops++;
        return;
    }

    // Hop Limit
    if (header.hop_count >= header.max_hops) {
        meshStats.expired_hops++;
        return;
    }

    String currentRoute = PacketCodec::formatRoutePath(header, THIS_NODE_ID);
    uint8_t nodeType = (strcmp(header.source_id, BOAT_NODE_ID) == 0) ? 1 : 2;
    updateNodeLiveness(header.source_id, nodeType, rssi, snr, header.hop_count, currentRoute.c_str());

    // Decode telemetry for local web dashboard view
    if (header.msg_type == MSG_TYPE_TELEMETRY) {
        MeshHeader dummyHeader;
        uint8_t decodedPayload[sizeof(BinaryTelemetry) + 32];
        size_t decodedLen = 0;
        PacketDropReason dropReason;

        bool decodeOk = PacketCodec::decodeMeshPacket(
            rxBuffer, packetSize,
            dummyHeader,
            decodedPayload, decodedLen, sizeof(decodedPayload),
            dropReason
        );

        if (decodeOk && decodedLen == sizeof(BinaryTelemetry)) {
            memcpy(&latestTelemetry, decodedPayload, sizeof(BinaryTelemetry));
            hasTelemetry = true;
            lastTelemetrySeq = header.sequence_id;
            lastTelemetryTime = now;
            lastTelemetryRssi = rssi;
            lastTelemetrySnr = snr;
            lastRouteString = currentRoute;
        } else if (dropReason == DROP_AUTH_FAILED) {
            meshStats.auth_failed++;
        }
    }

    // Append this node to route path
    if (header.path_count < MESH_MAX_PATH_HOPS) {
        strncpy(header.path_nodes[header.path_count], THIS_NODE_ID, MESH_MAX_NODE_ID_LEN - 1);
        header.path_nodes[header.path_count][MESH_MAX_NODE_ID_LEN - 1] = '\0';
        header.path_count++;
    }
    header.hop_count++;

    // Copy updated header back into frame buffer
    memcpy(rxBuffer, &header, sizeof(MeshHeader));

    // Recalculate CRC16
    uint16_t newCrc = meshCalculateCRC16(rxBuffer, packetSize - 2);
    rxBuffer[packetSize - 2] = (uint8_t)(newCrc >> 8);
    rxBuffer[packetSize - 1] = (uint8_t)(newCrc & 0xFF);

    // Schedule Forwarding with Randomized Collision Backoff (Slot 1: 120ms + jitter)
    unsigned long backoffMs = BACKOFF_BASE_MS + random(10, BACKOFF_JITTER_MS);

    scheduledForward.active = true;
    memcpy(scheduledForward.buffer, rxBuffer, packetSize);
    scheduledForward.length = packetSize;
    scheduledForward.transmit_at_ms = now + backoffMs;
    scheduledForward.sequence = header.sequence_id;
    strncpy(scheduledForward.source, header.source_id, MESH_MAX_NODE_ID_LEN);

    Serial.printf("[REP_01] Packet #%u from %s queued in %lu ms | Route: %s (Hops: %d)\n",
                  header.sequence_id, header.source_id, backoffMs, currentRoute.c_str(), header.hop_count);
}

void executeScheduledForward() {
    if (!scheduledForward.active) return;

    if (millis() >= scheduledForward.transmit_at_ms) {
        LoRa.beginPacket();
        LoRa.write(scheduledForward.buffer, scheduledForward.length);
        int txResult = LoRa.endPacket();

        meshStats.total_forwarded++;
        scheduledForward.active = false;

        Serial.printf("[REP_01 FWD] Forwarded Packet #%u from %s (Result=%d, %u bytes)\n",
                      scheduledForward.sequence, scheduledForward.source, txResult, (unsigned int)scheduledForward.length);
    }
}

void broadcastRepeaterHeartbeat() {
    if (!loraReady) return;

    BinaryHeartbeat hb;
    hb.node_type = 2; // Repeater
    hb.uptime_sec = millis() / 1000;
    hb.battery_mv = 3300;
    hb.packets_forwarded = (uint16_t)meshStats.total_forwarded;
    hb.packets_dropped = (uint16_t)(meshStats.duplicates + meshStats.expired_hops);
    hb.last_rssi = (int8_t)lastTelemetryRssi;

    uint8_t packetBuf[LORA_HW_MAX_PAYLOAD];
    size_t packetLen = PacketCodec::encodeMeshPacket(
        packetBuf, sizeof(packetBuf),
        MSG_TYPE_HEARTBEAT,
        THIS_NODE_ID, 0x11223344, meshStats.total_forwarded, millis(),
        MESH_MAX_PATH_HOPS,
        (const uint8_t*)&hb, sizeof(BinaryHeartbeat),
        ACTIVE_SECURITY_MODE
    );

    if (packetLen > 0) {
        LoRa.beginPacket();
        LoRa.write(packetBuf, packetLen);
        LoRa.endPacket();
        Serial.printf("[HEARTBEAT TX] %s Heartbeat sent (Fwd: %u, Drops: %u)\n", THIS_NODE_ID, hb.packets_forwarded, hb.packets_dropped);
    }
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("=================================================================");
    Serial.println("       ESP32 LORA MESH REPEATER 01 FIRMWARE (REP_01)            ");
    Serial.println("=================================================================");

    // SoftAP & Web Dashboard
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(apIP, apIP, netMsk);
    if (WiFi.softAP(SOFTAP_SSID, SOFTAP_PASS)) {
        Serial.printf("[SoftAP] Started SSID: %s | Pass: %s\n", SOFTAP_SSID, SOFTAP_PASS);
        Serial.printf("[SoftAP] Web Dashboard URL: http://%s/\n", WiFi.softAPIP().toString().c_str());
    }
    WiFi.setSleep(false);

    webServer.on("/", HTTP_GET, handleRoot);
    webServer.on("/api/status", HTTP_GET, handleApiStatus);
    webServer.on("/api/telemetry", HTTP_GET, handleApiTelemetry);
    webServer.begin();
    Serial.println("[WebServer] HTTP Server started on port 80.");

    // LoRa Radio
    SPI.begin(LORA_SCK_PIN, LORA_MISO_PIN, LORA_MOSI_PIN, LORA_SS_PIN);
    LoRa.setPins(LORA_SS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

    if (!LoRa.begin(LORA_FREQUENCY)) {
        Serial.println("[LoRa] ERROR: Radio initialization failed! Check SPI wiring.");
        loraReady = false;
    } else {
        LoRa.setSyncWord(LORA_SYNC_WORD);
        LoRa.setSpreadingFactor(LORA_SPREAD_FACTOR);
        LoRa.setSignalBandwidth(LORA_BANDWIDTH);
        LoRa.setCodingRate4(LORA_CODING_RATE);
        LoRa.setPreambleLength(LORA_PREAMBLE_LEN);
        if (LORA_ENABLE_CRC) LoRa.enableCrc();
        LoRa.setTxPower(LORA_TX_POWER);
        loraReady = true;
        Serial.printf("[LoRa] Radio ready: %.1f MHz, Sync 0x%02X, SF%d, BW %.0f kHz\n",
                      LORA_FREQUENCY / 1E6, LORA_SYNC_WORD, LORA_SPREAD_FACTOR, LORA_BANDWIDTH / 1E3);
    }

    Serial.println("\nRepeater 01 operational. Listening for mesh packets...\n");
}

// =============================================================================
// MAIN LOOP
// =============================================================================
void loop() {
    webServer.handleClient();
    processIncomingLoRaPacket();
    executeScheduledForward();

    unsigned long now = millis();
    if (now - lastHeartbeatBroadcast >= REPEATER_HEARTBEAT_MS) {
        lastHeartbeatBroadcast = now;
        broadcastRepeaterHeartbeat();
    }
}
