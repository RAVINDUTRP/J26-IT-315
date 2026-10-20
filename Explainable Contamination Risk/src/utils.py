"""
Utility helpers for path discovery, configuration loading, seed setting,
reproducible hashing, and environmental risk category mapping.
"""

import os
import json
import random
import logging
from pathlib import Path
from typing import Dict, Any, Union, Optional
import numpy as np


def get_project_root() -> Path:
    """
    Robustly discover the Component_03_Contamination_Risk root directory
    from notebooks, scripts, or external callers.
    """
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / "config" / "project_config.json").exists() or (parent / "requirements.txt").exists():
            return parent
    
    # Fallback to current working directory or known path
    cwd = Path.cwd().resolve()
    for parent in [cwd] + list(cwd.parents):
        candidate = parent / "Explainable Contamination Risk"
        if candidate.exists() and (candidate / "config" / "project_config.json").exists():
            return candidate
        if (parent / "config" / "project_config.json").exists():
            return parent
            
    return current.parent


def setup_logger(name: str = "contamination_risk", level: int = logging.INFO) -> logging.Logger:
    """Configure a standard project logger."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(level)
        ch = logging.StreamHandler()
        ch.setLevel(level)
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        ch.setFormatter(formatter)
        logger.addHandler(ch)
    return logger


def load_json_config(config_rel_path: str) -> Dict[str, Any]:
    """Load JSON config file relative to project root."""
    root = get_project_root()
    path = root / config_rel_path
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found at: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_project_config() -> Dict[str, Any]:
    """Load config/project_config.json."""
    return load_json_config("config/project_config.json")


def load_feature_config() -> Dict[str, Any]:
    """Load config/feature_config.json."""
    return load_json_config("config/feature_config.json")


def load_model_config() -> Dict[str, Any]:
    """Load config/model_config.json."""
    return load_json_config("config/model_config.json")


def set_all_seeds(seed: int = 42) -> None:
    """
    Enforce global reproducibility across random, numpy, and tensorflow (if available).
    """
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    
    try:
        import tensorflow as tf
        tf.random.set_seed(seed)
    except ImportError:
        pass


set_random_seeds = set_all_seeds


def score_to_category(score: float, low_max: float = 35.0, medium_max: float = 70.0) -> str:
    """Map a continuous contamination risk score (0-100) to qualitative category."""
    if score is None or np.isnan(score):
        return "UNKNOWN"
    if score < low_max:
        return "LOW"
    elif score < medium_max:
        return "MEDIUM"
    else:
        return "HIGH"


def category_to_numeric(category: str) -> int:
    """Convert category to integer label."""
    mapping = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    return mapping.get(str(category).upper(), 0)


def ensure_directory(path: Union[str, Path]) -> Path:
    """Ensure directory exists and return Path object."""
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p
