from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT_DIR / "outputs"
IMAGE_DIR = OUTPUT_DIR / "images"
DB_PATH = OUTPUT_DIR / "waferguard.db"

MODEL_VERSION = "wg-local-v1.0.0"
DRIFT_THRESHOLD = 0.30
LOW_CONFIDENCE_THRESHOLD = 0.70


def ensure_runtime_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
