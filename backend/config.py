"""Load configuration from environment (.env)."""
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "kazgevim_1C")

# The data-contract table this app reads (built by build-ctkm-margin-base.py in 1c-data-sync).
BASE_TABLE = os.getenv("BASE_TABLE", "tb_ctkm_margin_base")
