output "s3_bucket" { value = aws_s3_bucket.raw.id }
output "dynamodb_table" { value = aws_dynamodb_table.entities.name }
output "vpc_id" { value = aws_vpc.blu.id }
