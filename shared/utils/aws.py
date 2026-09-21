"""Small, replaceable AWS data adapters. Require AWS credentials only when used."""

import json
import boto3
from sqlalchemy import create_engine, text
from shared.config import settings


class S3Repository:
    def put_json(self, key: str, value: dict) -> None:
        boto3.client("s3", region_name=settings.blu_aws_region).put_object(
            Bucket=settings.blu_s3_bucket,
            Key=key,
            Body=json.dumps(value),
            ContentType="application/json",
        )


class DynamoRepository:
    def put(self, value: dict) -> None:
        boto3.resource("dynamodb", region_name=settings.blu_aws_region).Table(
            settings.blu_dynamodb_table
        ).put_item(Item=value)


class AuroraRepository:
    def healthcheck(self) -> bool:
        with create_engine(settings.blu_database_url).connect() as connection:
            return connection.execute(text("SELECT 1")).scalar() == 1
