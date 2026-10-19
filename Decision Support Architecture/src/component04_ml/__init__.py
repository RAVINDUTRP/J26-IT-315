"""
Component 04: AI-Based Disaster Decision Support Framework
Python-based Machine Learning Research & Inference Package.
"""

from pathlib import Path

__version__ = "1.0.0"

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def get_project_root() -> Path:
    """Return absolute path to Decision Support Architecture root directory."""
    return _PROJECT_ROOT
