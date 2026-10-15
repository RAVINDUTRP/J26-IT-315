try:
    from component2_comms.src.crypto import protect, unprotect
    from component2_comms.src.node_health import classify_health, health_score
    from component2_comms.src.packet_codec import WaterPacket, decode, encode, json_size_estimate
    from component2_comms.src.routing import select_route
except ModuleNotFoundError:
    from src.crypto import protect, unprotect
    from src.node_health import classify_health, health_score
    from src.packet_codec import WaterPacket, decode, encode, json_size_estimate
    from src.routing import select_route


def sample_state():
    return {
        "nodes": {
            "S1": {"rssi": -82, "snr": 7.5, "battery": 78, "congestion": 0.1},
            "R2": {"rssi": -79, "snr": 8.4, "battery": 88, "congestion": 0.1},
            "R4": {"rssi": -108, "snr": -2, "battery": 19, "congestion": 0.8},
            "R5": {"rssi": -81, "snr": 7.9, "battery": 83, "congestion": 0.1},
            "GW": {"rssi": -70, "snr": 10, "battery": 100, "congestion": 0.05},
        },
        "edges": {
            "S1>R2": {"rssi_score": 0.68, "snr_score": 0.736, "packet_loss": 0.02, "up": True},
            "R2>R4": {"rssi_score": 0.30, "snr_score": 0.444, "packet_loss": 0.09, "up": True},
            "R2>R5": {"rssi_score": 0.65, "snr_score": 0.716, "packet_loss": 0.02, "up": True},
            "R4>GW": {"rssi_score": 0.23, "snr_score": 0.38, "packet_loss": 0.15, "up": True},
            "R5>GW": {"rssi_score": 0.83, "snr_score": 0.8, "packet_loss": 0.01, "up": True},
        },
    }


def test_health_score_is_bounded_and_classified():
    score = health_score(-79, 8.4, 88, 0.1)
    assert 0 <= score <= 1
    assert classify_health(score) == "healthy"


def test_adaptive_routing_prefers_healthy_path():
    state = sample_state()
    paths = [["S1", "R2", "R4", "GW"], ["S1", "R2", "R5", "GW"]]
    result = select_route(paths, state, paths[0])
    assert result["selected_path"] == ["S1", "R2", "R5", "GW"]
    assert result["switched"] is True


def test_packet_round_trip_and_compaction():
    packet = WaterPacket(2, 17, 7.12, 28.4, 132, 28.4, 87)
    encoded = encode(packet)
    decoded = decode(encoded)
    assert decoded == packet
    assert len(encoded) < json_size_estimate(packet)


def test_rolling_key_protection_round_trip_and_tamper_detection():
    plaintext = b"water-quality telemetry"
    key = b"AquaShield-C2-demo-key"
    protected = protect(plaintext, key, 17)
    assert unprotect(protected, key, 17) == plaintext

    tampered = protected[:-9] + bytes([protected[-9] ^ 0x01]) + protected[-8:]
    try:
        unprotect(tampered, key, 17)
    except ValueError:
        pass
    else:
        raise AssertionError("tampering must fail authentication")
