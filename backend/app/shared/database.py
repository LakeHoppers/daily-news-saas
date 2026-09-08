import os

import certifi
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url


def build_engine():
    raw_url = os.environ.get("DATABASE_URL")
    if not raw_url:
        raise RuntimeError("DATABASE_URL is required")
    url = make_url(raw_url).set(drivername="postgresql+psycopg")
    # Require certificate verification; no URL or secret is logged.
    url = url.update_query_dict(
        {"sslmode": "verify-full", "sslrootcert": url.query.get("sslrootcert", certifi.where())}
    )
    return create_engine(
        url,
        pool_size=2,
        max_overflow=2,
        pool_timeout=10,
        pool_pre_ping=True,
        hide_parameters=True,
        isolation_level="REPEATABLE READ",
        connect_args={
            "connect_timeout": 10,
            "options": "-c default_transaction_read_only=on -c statement_timeout=10000",
        },
    )
