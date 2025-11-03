from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Configure engine with UTF-8 encoding for emoji support
# PostgreSQL connections need explicit UTF-8 encoding
db_url_lower = settings.DATABASE_URL.lower()
is_postgres = "postgresql" in db_url_lower or "postgres" in db_url_lower

connect_args = {}
if is_postgres:
    # Set client encoding to UTF-8 for PostgreSQL connections
    connect_args["client_encoding"] = "UTF8"

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
    # Ensure SQLAlchemy uses UTF-8 for all string operations
    echo=False  # Set to True for SQL query debugging
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base=declarative_base()

def get_db():
    db=SessionLocal()
    try:
        yield db
        
    finally:
        db.close()