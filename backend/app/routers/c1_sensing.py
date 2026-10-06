from fastapi import APIRouter
from .. import mock_data as m

router = APIRouter()


@router.get("/observations/{site_id}")
def observations(site_id: str):
    return m.observations(site_id)
