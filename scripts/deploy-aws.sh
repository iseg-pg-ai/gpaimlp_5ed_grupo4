#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

: "${TARGET_AWS_ACCOUNT_ID:?Set TARGET_AWS_ACCOUNT_ID to the 12-digit AWS account}"
TARGET_AWS_REGION="${TARGET_AWS_REGION:-eu-west-1}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-pilot}"
export TARGET_AWS_REGION DEPLOY_ENVIRONMENT

[[ "$TARGET_AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]] || { echo "TARGET_AWS_ACCOUNT_ID must contain 12 digits" >&2; exit 2; }
command -v node >/dev/null || { echo "Node.js is required" >&2; exit 2; }
command -v npm >/dev/null || { echo "npm is required" >&2; exit 2; }
command -v aws >/dev/null || { echo "AWS CLI is required" >&2; exit 2; }

caller_account="$(aws sts get-caller-identity --query Account --output text)"
[[ "$caller_account" == "$TARGET_AWS_ACCOUNT_ID" ]] || { echo "AWS identity is account $caller_account, expected $TARGET_AWS_ACCOUNT_ID" >&2; exit 3; }

echo "Installing locked infrastructure dependencies..."
npm --prefix infra ci --ignore-scripts --no-audit --no-fund
echo "Running focused infrastructure tests..."
npm --prefix infra test
cd "$root_dir/infra"
echo "Bootstrapping CDK resources when needed..."
npm exec -- cdk bootstrap "aws://${TARGET_AWS_ACCOUNT_ID}/${TARGET_AWS_REGION}"
echo "Synthesizing all split stacks..."
npm run synth:cloud
echo "Deploying data, frontend, and backoffice stacks..."
npm exec -- cdk deploy --all --app "node aws-split-app.mjs" --require-approval broadening --outputs-file cdk-outputs.json

echo "Deployment outputs: $root_dir/infra/cdk-outputs.json"
if [[ "${RUN_SYNTHETIC_CHECK:-false}" == "true" ]]; then
  : "${CONVERSATION_EVENTS_ENDPOINT:?Set CONVERSATION_EVENTS_ENDPOINT from cdk-outputs.json}"
  npm run synthetic:cloud
fi
