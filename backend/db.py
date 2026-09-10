"""MySQL connection helper (read-only usage for now)."""
import pymysql
from pymysql.cursors import DictCursor

from . import config


def get_connection():
    """Open a new pymysql connection using env config. Caller closes it (or use a with-block)."""
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor,
        read_timeout=60,
    )
