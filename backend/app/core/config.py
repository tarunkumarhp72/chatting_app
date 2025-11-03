from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field(..., description="Database connection string")
    SECRET_KEY: str = Field(default="your-secret-key-change-this-in-production", description="JWT secret key")
    ALGORITHM: str = Field(default="HS256", description="Algorithm for JWT (e.g., HS256)")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, description="How long (in minutes) an access token is valid (for chat apps: 60 recommended)")
    REFRESH_TOKEN_EXPIRE_MINUTES: int = Field(default=43200, description="How long (in minutes) a refresh token is valid (default 30 days)")

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()