import os
import json
import base64
import uuid
import boto3

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def handler(event: dict, context) -> dict:
    """Загружает изображение (base64) в S3 и возвращает публичную CDN-ссылку."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    file_data = body.get("file_data", "")
    file_name = body.get("file_name", "image.jpg")
    content_type = body.get("content_type", "image/jpeg")

    if not file_data:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": "file_data обязателен"})}

    if "," in file_data:
        file_data = file_data.split(",", 1)[1]

    try:
        raw = base64.b64decode(file_data)
    except Exception as e:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": f"Некорректный base64: {e}"})}

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "jpg"
    key = f"broadcast/{uuid.uuid4().hex}.{ext}"

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url="https://bucket.poehali.dev",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        )
        s3.put_object(Bucket="files", Key=key, Body=raw, ContentType=content_type)
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"url": cdn_url})}
    except Exception as e:
        print(f"[upload] S3 error: {e}")
        return {"statusCode": 500, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": str(e)})}
