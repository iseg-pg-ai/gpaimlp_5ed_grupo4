import boto3
from dotenv import load_dotenv

load_dotenv()

bedrock = boto3.client("bedrock-runtime", region_name="eu-north-1")


def call_llm():
    model_id = "deepseek.v3-v1:0"
    input_message = input("\nUser Input> ")
    messages = [{"role": "user", "content": [{"text": f"{input_message}"}]}]
    response = bedrock.converse(modelId=model_id, messages=messages)
    print("\nAI> ", response["output"]["message"]["content"][0]["text"])


if __name__ == "__main__":
    call_llm()
