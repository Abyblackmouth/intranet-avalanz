from pydantic_settings import BaseSettings

class Config(BaseSettings):
    # DocuSign (Control de accesos) -- misma cuenta que Legal
    DOCUSIGN_INTEGRATION_KEY: str = ""
    DOCUSIGN_USER_ID: str = ""
    DOCUSIGN_ACCOUNT_ID: str = ""
    DOCUSIGN_BASE_URI: str = "https://demo.docusign.net"
    DOCUSIGN_AUTH_SERVER: str = "account-d.docusign.com"
    DOCUSIGN_PRIVATE_KEY_PATH: str = "/app/docusign_private.pem"

    SERVICE_NAME: str = "it-service-desk-service"
    SERVICE_VERSION: str = "1.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_it_service_desk"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    RABBITMQ_URL: str = "amqp://avalanz:Avalanz2026!@rabbitmq:5672/"
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

config = Config()
