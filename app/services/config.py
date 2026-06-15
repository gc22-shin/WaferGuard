from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
OUTPUT_DIR = ROOT_DIR / "outputs"
IMAGE_DIR = OUTPUT_DIR / "images"
DB_PATH = OUTPUT_DIR / "waferguard.db"

MODEL_VERSION = "wafer-defectnet-v2.3.1"
DRIFT_THRESHOLD = 0.30
LOW_CONFIDENCE_THRESHOLD = 0.70
# Simulated retraining takes this long to finish: a triggered job is recorded as
# "running" immediately and only flips to "completed" (registering the Staging
# candidate) after the delay, so the lifecycle is observable instead of instant.
RETRAIN_DURATION_SECONDS = 20


def ensure_runtime_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
