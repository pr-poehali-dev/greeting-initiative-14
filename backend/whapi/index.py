import os
import json
import urllib.request
import urllib.error
import base64

WHAPI_BASE = "https://gate.whapi.cloud"


def _get(path: str, accept: str = "application/json") -> tuple:
    """Возвращает (ok: bool, data: dict | bytes)"""
    token = os.environ.get("WHAPI_TOKEN", "")
    url = f"{WHAPI_BASE}{path}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": accept,
            "User-Agent": "Mozilla/5.0 (compatible; WhapiClient/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            if accept == "application/json":
                return True, json.loads(raw.decode())
            else:
                return True, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[whapi] HTTP {e.code} on {path}: {body[:200]}")
        return False, {"http_status": e.code, "reason": e.reason, "body": body}
    except Exception as ex:
        print(f"[whapi] Exception on {path}: {ex}")
        return False, {"exception": str(ex)}


def handler(event: dict, context) -> dict:
    """Интеграция с Whapi.cloud: QR-код авторизации, статус и список групп WhatsApp."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "status")

    if action == "qr":
        # Сначала статус — вдруг уже авторизован
        ok, health = _get("/checkHealth")
        print(f"[whapi] /checkHealth ok={ok} data={json.dumps(health)[:300]}")
        if ok:
            ch_status = str(health.get("accountStatus") or health.get("deviceStatus") or "").lower()
            if ch_status in ("authenticated", "active", "connected", "ok", "ready"):
                return {
                    "statusCode": 200,
                    "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"qr_code": None, "already_connected": True, "status": ch_status}),
                }

        # Запрашиваем QR как PNG-изображение
        ok_img, img_data = _get("/users/login", accept="image/png")
        print(f"[whapi] /users/login (image/png) ok={ok_img} type={type(img_data).__name__} len={len(img_data) if isinstance(img_data, bytes) else 'n/a'}")
        if ok_img and isinstance(img_data, bytes) and len(img_data) > 100:
            qr_b64 = base64.b64encode(img_data).decode()
            return {
                "statusCode": 200,
                "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({
                    "qr_code": f"data:image/png;base64,{qr_b64}",
                    "already_connected": False,
                }),
            }

        # Запрашиваем QR как base64 JSON
        ok_json, qr_data = _get("/users/login", accept="application/json")
        print(f"[whapi] /users/login (json) ok={ok_json} data={json.dumps(qr_data)[:300]}")

        # 409 = канал уже авторизован
        if not ok_json and isinstance(qr_data, dict) and qr_data.get("http_status") == 409:
            return {
                "statusCode": 200,
                "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"qr_code": None, "already_connected": True, "status": "authenticated"}),
            }

        if ok_json and isinstance(qr_data, dict):
            qr = qr_data.get("qr_code") or qr_data.get("qrCode") or qr_data.get("qr") or qr_data.get("image")
            if qr:
                if not qr.startswith("data:"):
                    qr = f"data:image/png;base64,{qr}"
                return {
                    "statusCode": 200,
                    "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"qr_code": qr, "already_connected": False}),
                }

        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({
                "qr_code": None,
                "already_connected": False,
                "error": "Не удалось получить QR. Проверьте, что канал Whapi создан и токен верный.",
                "debug_qr": qr_data if not ok_img else None,
            }),
        }

    if action == "status":
        ok, data = _get("/checkHealth")
        print(f"[whapi] /checkHealth ok={ok} data={json.dumps(data)[:300]}")
        ch_status = str(data.get("accountStatus") or data.get("deviceStatus") or "unknown").lower() if ok else "error"
        connected = ch_status in ("authenticated", "active", "connected", "ok", "ready")
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"status": ch_status, "connected": connected, "raw": data}),
        }

    if action == "groups":
        # Пробуем несколько вариантов URL
        ok, data = False, {}
        for path in ["/groups?count=100", "/groups?limit=100", "/groups"]:
            ok, data = _get(path)
            print(f"[whapi] {path} ok={ok} data={json.dumps(data)[:200]}")
            if ok:
                break
        if not ok:
            return {
                "statusCode": 200,
                "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"groups": [], "total": 0, "error": data}),
            }
        groups = data.get("groups", data.get("chats", []))
        result = [
            {
                "id": g.get("id", ""),
                "name": g.get("name", g.get("subject", "")),
                "members": g.get("participants_count", g.get("size", 0)),
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