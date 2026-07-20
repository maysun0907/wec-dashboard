from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    environment: str = "development"
    db_pool_size: int = Field(default=10, ge=1)
    db_max_overflow: int = Field(default=5, ge=0)
    db_pool_timeout_seconds: float = Field(default=5.0, gt=0)
    api_max_concurrency: int = Field(default=12, ge=1)
    api_admission_timeout_seconds: float = Field(default=1.5, gt=0)
    api_retry_after_seconds: int = Field(default=2, ge=1)

    @model_validator(mode="after")
    def validate_connection_budget(self) -> "Settings":
        pool_capacity = self.db_pool_size + self.db_max_overflow
        if self.api_max_concurrency >= pool_capacity:
            raise ValueError(
                "API_MAX_CONCURRENCY must be less than DB_POOL_SIZE + "
                "DB_MAX_OVERFLOW"
            )
        return self


settings = Settings()
