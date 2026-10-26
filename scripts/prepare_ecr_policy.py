"""Gera permissões ECR mínimas para revisão, sem criar ou alterar IAM."""
import argparse
import json
from pathlib import Path

from scripts.publish_image_release import target_uri


def permission_policy(repository_uri, account, region):
    _, repository = target_uri(repository_uri, account, region)
    return {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"], "Resource": "*"},
        {"Effect": "Allow", "Action": [
            "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
            "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage",
            "ecr:DescribeRepositories"],
         "Resource": f"arn:aws:ecr:{region}:{account}:repository/{repository}"},
    ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository-uri", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--region", default="eu-west-1")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    value = permission_policy(args.repository_uri, args.account, args.region)
    args.output.write_text(json.dumps(value, indent=2) + "\n")


if __name__ == "__main__":
    main()
