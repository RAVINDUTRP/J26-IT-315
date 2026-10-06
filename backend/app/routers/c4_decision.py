from fastapi import APIRouter
from component4_decision.src.recommender import recommend  # real component code, wired in already
from .. import mock_data as m

router = APIRouter()


@router.get("/recommendations")
def recommendations():
    pops = {k: v["population"] for k, v in m.SITES.items()}
    comm = {"ambatale": "degraded", "biyagama": "good", "hanwella": "good"}
    return recommend(m.risk(), pops, comm)
