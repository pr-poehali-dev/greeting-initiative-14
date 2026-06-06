import os
import json
import urllib.request
import urllib.error
import base64
import psycopg2

WHAPI_BASE = "https://gate.whapi.cloud"
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")


def get_user_token(session_id: str) -> str:
    """Получает whapi_token пользователя по session_id."""
    if not session_id:
        return ""
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT u.whapi_token FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        db.close()
        if row and row[0]:
            return row[0].strip()
    except Exception as e:
        print(f"[whapi] DB error: {e}")
    return ""


def _req(path: str, token: str, method: str = "GET", accept: str = "application/json") -> tuple:
    """HTTP-запрос к Whapi."""
    url = f"{WHAPI_BASE}{path}"
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": accept,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; WhapiClient/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            if accept == "application/json":
                return True, json.loads(raw.decode())
            return True, raw
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        print(f"[whapi] HTTP {e.code} on {path}: {body_txt[:200]}")
        return False, {"http_status": e.code, "reason": e.reason, "body": body_txt}
    except Exception as ex:
        print(f"[whapi] Exception on {path}: {ex}")
        return False, {"exception": str(ex)}


def handler(event: dict, context) -> dict:
    """Интеграция с Whapi.cloud. Токен берётся из профиля пользователя по сессии."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "status")

    token = get_user_token(session_id)
    if not token:
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"error": "no_token", "message": "Токен Whapi не назначен. Обратитесь к администратору."}),
        }

    if action == "qr":
        ok, health = _req("/checkHealth", token)
        print(f"[whapi] /checkHealth ok={ok} data={json.dumps(health)[:300]}")
        if ok:
            ch_status = str(health.get("accountStatus") or health.get("deviceStatus") or "").lower()
            if ch_status in ("authenticated", "active", "connected", "ok", "ready"):
                return {
                    "statusCode": 200,
                    "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"qr_code": None, "already_connected": True, "status": ch_status}),
                }

        ok_img, img_data = _req("/users/login", token, accept="image/png")
        if ok_img and isinstance(img_data, bytes) and len(img_data) > 100:
            qr_b64 = base64.b64encode(img_data).decode()
            return {
                "statusCode": 200,
                "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"qr_code": f"data:image/png;base64,{qr_b64}", "already_connected": False}),
            }

        ok_json, qr_data = _req("/users/login", token, accept="application/json")
        print(f"[whapi] /users/login (json) ok={ok_json} data={json.dumps(qr_data)[:300]}")

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
            "body": json.dumps({"qr_code": None, "already_connected": False, "error": "Не удалось получить QR. Проверьте токен Whapi."}),
        }

    if action == "status":
        ok, data = _req("/checkHealth", token)
        ch_status = str(data.get("accountStatus") or data.get("deviceStatus") or "unknown").lower() if ok else "error"
        connected = ch_status in ("authenticated", "active", "connected", "ok", "ready")
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"status": ch_status, "connected": connected, "raw": data}),
        }

    if action == "groups":
        ok, data = False, {}
        for path in ["/groups?count=100", "/groups?limit=100", "/groups"]:
            ok, data = _req(path, token)
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
        "body": json.dumps({"error": "Unknown action"}),
    }
