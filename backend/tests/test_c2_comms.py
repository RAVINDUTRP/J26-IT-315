from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_c2_network_contract():
    response = client.get("/api/c2/network")
    assert response.status_code == 200
    data = response.json()
    assert len(data["nodes"]) >= 6
    assert data["active_path"][-1] == "GW"
    assert "routing" in data
    assert data["routing"]["algorithm"] == "Adaptive Multi-Hop Routing"


def test_c2_failure_triggers_route_recalculation():
    response = client.get("/api/c2/network?failed_node=R4")
    assert response.status_code == 200
    data = response.json()
    assert data["failed_node"] == "R4"
    assert data["active_path"] == ["S1", "R2", "R5", "GW"]
    assert data["routing"]["switched"] is True


def test_c2_packet_gateway_pipeline():
    response = client.get("/api/c2/packet-demo")
    assert response.status_code == 200
    data = response.json()
    assert data["plain_bytes"] < data["protected_bytes"]
    assert data["recovered"]["ph"] == 7.12
