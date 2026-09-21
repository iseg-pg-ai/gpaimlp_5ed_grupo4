from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    blu_env: str = "development"
    blu_jwt_secret: str = "development-secret-change-this-to-at-least-32-chars"
    blu_aws_region: str = "eu-west-1"
    blu_s3_bucket: str = "blu-ai-raw"
    blu_dynamodb_table: str = "blu-ai-entities"
    blu_database_url: str = "postgresql+psycopg://blu:blu@localhost:5432/blu"
    bedrock_model_id: str = "amazon.nova-lite-v1:0"
    crm_provider: str = "hubspot"
    crm_api_key: str = ""
    google_maps_api_key: str = ""
    google_places_api_key: str = ""
    openweather_api_key: str = ""
    geoapify_api_key: str = ""
    tripadvisor_api_key: str = ""
    uber_api_key: str = ""
    bolt_api_key: str = ""


settings = Settings()
