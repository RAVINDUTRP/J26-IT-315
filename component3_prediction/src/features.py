import pandas as pd


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Expects columns: timestamp, turbidity_ntu, ec_us_cm, tds_ppm, ph, rainfall_mm_h. TODO(C3): extend."""
    df = df.sort_values("timestamp").copy()
    df["rain_acc_6h"] = df["rainfall_mm_h"].rolling(6, min_periods=1).sum()
    df["rain_rate_change"] = df["rainfall_mm_h"].diff().fillna(0)
    df["turb_lag1"] = df["turbidity_ntu"].shift(1).bfill()
    df["turb_ma6"] = df["turbidity_ntu"].rolling(6, min_periods=1).mean()
    df["turb_change"] = df["turbidity_ntu"].diff().fillna(0)
    return df
