import os
import json
import urllib.request
import urllib.error

WHAPI_BASE = "https://gate.whapi.cloud"


def _whapi_request(method: str, path: str, body: dict = None) -> dict:
    token = os.environ.get("WHAPI_TOKEN", "")
    url = f"{WHAPI_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; WhapiClient/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.reason, "status": e.code, "body": e.read().decode()}


def handler(event: dict, context) -> dict:
    """Интеграция с Whapi.cloud: QR-код авторизации, статус и список групп WhatsApp."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "status")

    if action == "qr":
        data = _whapi_request("GET", "/screen")
        qr_code = data.get("qr_code") or data.get("qrCode") or data.get("qr")
        mime = data.get("mime_type", "image/png")
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({
                "qr_code": qr_code,
                "mime_type": mime,
                "raw": data,
            }),
        }

    if action == "status":
        data = _whapi_request("GET", "/health")
        status = data.get("status", data.get("accountStatus", "unknown"))
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"status": status, "raw": data}),
        }

    if action == "groups":
        data = _whapi_request("GET", "/groups?count=100")
        groups = data.get("groups", data.get("chats", []))
        result = [
            {
                "id": g.get("id", ""),
                "name": g.get("name", g.get("subject", "")),
                "members": g.get("participants_count", g.get("size", 0)),
                "creation": g.get("creation", 0),
            }
            for g in groups
            if g.get("id", "").endswith("@g.us")
        ]
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"groups": result, "total": len(result)}),
        }

    return {
        "statusCode": 400,
        "headers": {**cors, "Content-Type": "application/json"},
        "body": json.dumps({"error": "Unknown action. Use: qr | status | groups"}),
    }