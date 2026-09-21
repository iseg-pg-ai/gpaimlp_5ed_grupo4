terraform { required_version = ">= 1.6"; required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } } }
provider "aws" { region = var.region }
data "aws_availability_zones" "available" { state = "available" }
resource "aws_vpc" "blu" { cidr_block = "10.40.0.0/16"; enable_dns_hostnames = true; tags = { Name = "blu-ai" } }
resource "aws_subnet" "private" { count = 2; vpc_id = aws_vpc.blu.id; cidr_block = cidrsubnet(aws_vpc.blu.cidr_block, 4, count.index); availability_zone = data.aws_availability_zones.available.names[count.index] }
resource "aws_s3_bucket" "raw" { bucket_prefix = "blu-ai-raw-" }
resource "aws_dynamodb_table" "entities" { name = "blu-ai-entities"; billing_mode = "PAY_PER_REQUEST"; hash_key = "id"; attribute { name = "id"; type = "S" } }
resource "aws_cloudwatch_log_group" "api" { name = "/ecs/blu-api"; retention_in_days = 30 }
resource "aws_iam_role" "task" { name_prefix = "blu-ai-task-"; assume_role_policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]}) }
resource "aws_ecs_cluster" "blu" { name = "blu-ai" }
# Add NAT gateways, ECS task definition/service, Aurora Serverless v2 and API Gateway integration per environment.
# Their credentials, image tags and subnet routing are intentionally variables, never committed defaults.
