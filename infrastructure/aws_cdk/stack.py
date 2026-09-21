from aws_cdk import Stack, aws_dynamodb as dynamodb, aws_s3 as s3
from constructs import Construct


class BluAiStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)
        self.raw = s3.Bucket(
            self, "RawBucket", encryption=s3.BucketEncryption.S3_MANAGED, enforce_ssl=True
        )
        self.entities = dynamodb.Table(
            self,
            "Entities",
            partition_key=dynamodb.Attribute(name="id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )
