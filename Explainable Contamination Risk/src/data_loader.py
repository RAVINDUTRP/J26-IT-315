"""
Data loading and dataset accessor utilities for raw, processed, and external environmental data.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import pandas as pd

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root

logger = logging.getLogger("contamination_risk.data_loader")


class EnvironmentalDataLoader:
    """Convenient, standardized data loader interface for all research stages."""

    def __init__(self, root_dir: Optional[Path] = None):
        self.root_dir = root_dir or get_project_root()
        self.raw_path = self.root_dir / "data" / "raw" / "synthetic_water_quality_weather.csv"
        self.events_path = self.root_dir / "data" / "raw" / "synthetic_contamination_events.csv"
        self.processed_path = self.root_dir / "data" / "processed" / "engineered_features.csv"
        self.meta_path = self.root_dir / "data" / "processed" / "dataset_metadata.json"
        self.dict_path = self.root_dir / "data" / "data_dictionary.csv"

    def load_raw_dataset(self, parse_dates: bool = True) -> pd.DataFrame:
        """Load raw synthetic water quality and meteorology dataset."""
        if not self.raw_path.exists():
            raise FileNotFoundError(f"Raw dataset not found at {self.raw_path}. Run data_generator.py first.")
        logger.info(f"Loading raw dataset from {self.raw_path}...")
        df = pd.read_csv(self.raw_path)
        if parse_dates and "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
        return df

    def load_contamination_events(self) -> pd.DataFrame:
        """Load logged contamination events."""
        if not self.events_path.exists():
            return pd.DataFrame()
        return pd.read_csv(self.events_path)

    def load_dataset_metadata(self) -> Dict[str, Any]:
        """Load metadata json describing dataset parameters."""
        if not self.meta_path.exists():
            return {}
        with open(self.meta_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def load_data_dictionary(self) -> pd.DataFrame:
        """Load data dictionary detailing parameters, data types, and units."""
        if not self.dict_path.exists():
            return pd.DataFrame()
        return pd.read_csv(self.dict_path)

    def load_processed_features(self, parse_dates: bool = True) -> pd.DataFrame:
        """Load feature-engineered dataset."""
        if not self.processed_path.exists():
            raise FileNotFoundError(f"Processed dataset not found at {self.processed_path}. Run feature_engineering first.")
        df = pd.read_csv(self.processed_path)
        if parse_dates and "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
        return df


def load_raw_data() -> pd.DataFrame:
    """Quick helper function to load raw dataset."""
    loader = EnvironmentalDataLoader()
    return loader.load_raw_dataset()
