from fastapi import APIRouter
from .. import mock_data as m
from ..schemas import RiskAssessment

router = APIRouter()


@router.get("/risk", response_model=list[RiskAssessment])
def risk():
    return m.risk()
