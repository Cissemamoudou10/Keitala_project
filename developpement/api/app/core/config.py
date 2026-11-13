from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_CLE_DE_DEVELOPPEMENT = "changez_cette_cle_secrete_en_production_tres_longue_et_aleatoire"


class Settings(BaseSettings):
    ENV: str = "dev"
    DEBUG: bool = True

    SECRET_KEY: str = _CLE_DE_DEVELOPPEMENT
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DATABASE_URL: str = (
        "postgresql+asyncpg://keitala_user:keitala_dev_password@localhost:5433/keitala_db"
    )
    TEST_DATABASE_URL: str = (
        "postgresql+asyncpg://keitala_user:keitala_dev_password@localhost:5433/keitala_test_db"
    )

    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def _cle_secrete_hors_dev(self) -> "Settings":
        if self.ENV != "dev" and self.SECRET_KEY == _CLE_DE_DEVELOPPEMENT:
            raise ValueError("SECRET_KEY doit être définie hors développement.")
        return self


settings = Settings()
