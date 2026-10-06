"""Compact binary packet codec for water-quality telemetry.

The packet uses fixed-width fields so the payload is substantially smaller
than a JSON representation.  Values are scaled before packing to preserve
the precision needed by the dashboard.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

MAGIC = b"AS"
VERSION = 1
HEADER = struct.Struct("<2sBBHB")
PAYLOAD = struct.Struct("<H H H h B H")
# magic, version, flags, sequence, source-node
# pH*100, turbidity*10, TDS, temperature*10, battery, payload sequence


@dataclass(frozen=True)
class WaterPacket:
    node_id: int
    sequence: int
    ph: float
    turbidity_ntu: float
    tds_ppm: int
    temperature_c: float
    battery_pct: int


def encode(packet: WaterPacket) -> bytes:
    node = packet.node_id & 0xFF
    header = HEADER.pack(MAGIC, VERSION, 0, packet.sequence & 0xFFFF, node)
    payload = PAYLOAD.pack(
        round(packet.ph * 100),
        round(packet.turbidity_ntu * 10),
        int(packet.tds_ppm),
        round(packet.temperature_c * 10),
        int(packet.battery_pct) & 0xFF,
        packet.sequence & 0xFFFF,
    )
    return header + payload


def decode(data: bytes) -> WaterPacket:
    if len(data) != HEADER.size + PAYLOAD.size:
        raise ValueError("Invalid packet length")
    magic, version, _flags, sequence, node_id = HEADER.unpack_from(data)
    if magic != MAGIC or version != VERSION:
        raise ValueError("Unsupported packet header")
    ph, turbidity, tds, temperature, battery, _seq2 = PAYLOAD.unpack_from(data, HEADER.size)
    return WaterPacket(node_id, sequence, ph / 100, turbidity / 10, tds, temperature / 10, battery)


def json_size_estimate(packet: WaterPacket) -> int:
    """Approximate compact JSON size for the same fields for comparison."""
    import json
    return len(json.dumps({
        "node_id": packet.node_id,
        "sequence": packet.sequence,
        "ph": packet.ph,
        "turbidity_ntu": packet.turbidity_ntu,
        "tds_ppm": packet.tds_ppm,
        "temperature_c": packet.temperature_c,
        "battery_pct": packet.battery_pct,
    }, separators=(",", ":")).encode())
