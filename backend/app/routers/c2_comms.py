from fastapi import APIRouter
from .. import mock_data as m

router = APIRouter()


@router.get("/network")
def network():
    return m.network()
