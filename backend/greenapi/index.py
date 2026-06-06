import os
import json
import urllib.request
import urllib.error
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")
BASE_URL = "https://api.green-api.com"

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def get_user_instance(session_id: str) -> tuple:
    """Получает instance_id и token пользователя по session_id."""
    if not session_id:
        return "", ""
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT u.green_api_instance_id, u.green_api_token
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        db.close()
        if row and row[0] and row[1]:
            return row[0].strip(), row[1].strip()
    except Exception as e:
        print(f"[greenapi] DB error: {e}")
    return "", ""


def api_get(instance_id: str, token: str, method: str) -> tuple:
    """GET запрос к Green API с повторной попыткой."""
    url = f"{BASE_URL}/waInstance{instance_id}/{method}/{token}"
    for attempt in range(2):
        req = urllib.request.Request(url, method="GET", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return True, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"[greenapi] HTTP {e.code} {method}: {body[:200]}")
            return False, {"http_status": e.code, "body": body}
        except Exception as ex:
            print(f"[greenapi] attempt {attempt+1} {method}: {ex}")
            if attempt == 1:
                return False, {"exception": str(ex)}
    return False, {"exception": "failed after retries"}


def api_post(instance_id: str, token: str, method: str, data: dict) -> tuple:
    """POST запрос к Green API."""
    url = f"{BASE_URL}/waInstance{instance_id}/{method}/{token}"
    payload = json.dumps(data).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return True, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[greenapi] HTTP {e.code} {method}: {body[:200]}")
        return False, {"http_status": e.code, "body": body}
    except Exception as ex:
        print(f"[greenapi] Exception {method}: {ex}")
        return False, {"exception": str(ex)}


def handler(event: dict, context) -> dict:
    """Интеграция с Green API: QR, статус, список групп."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "status")

    instance_id, token = get_user_instance(session_id)

    if not instance_id or not token:
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"error": "no_instance", "message": "Инстанс не назначен. Обратитесь к администратору."}),
        }

    if action == "qr":
        ok, data = api_get(instance_id, token, "qr")
        print(f"[greenapi] qr ok={ok} data={json.dumps(data)[:300]}")
        if ok:
            qr_type = data.get("type", "")
            if qr_type == "qrCode":
                return {
                    "statusCode": 200,
                    "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"qr_code": f"data:image/png;base64,{data['message']}", "already_connected": False}),
                }
            if qr_type == "alreadyLogged":
                return {
                    "statusCode": 200,
                    "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"qr_code": None, "already_connected": True}),
                }
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"qr_code": None, "already_connected": False, "error": str(data)}),
        }

    if action == "status":
        ok, data = api_get(instance_id, token, "getStateInstance")
        print(f"[greenapi] status ok={ok} data={json.dumps(data)[:300]}")
        state = data.get("stateInstance", "unknown") if ok else "error"
        connected = state == "authorized"
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"status": state, "connected": connected}),
        }

    if action == "logout":
        ok, data = api_get(instance_id, token, "logout")
        print(f"[greenapi] logout ok={ok} data={json.dumps(data)[:200]}")
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"ok": ok}),
        }

    if action == "groups":
        ok, data = api_post(instance_id, token, "getChats", {})
        print(f"[greenapi] getChats ok={ok} count={len(data) if isinstance(data, list) else 'err'}")
        if not ok or not isinstance(data, list):
            return {
                "statusCode": 200,
                "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"groups": [], "total": 0, "error": str(data)}),
            }
        groups = [
            {"id": c.get("id", ""), "name": c.get("name", "")}
            for c in data
            if c.get("id", "").endswith("@g.us")
        ]
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"groups": groups, "total": len(groups)}),
        }

    return {
        "statusCode": 400,
        "headers": {**cors, "Content-Type": "application/json"},
        "body": json.dumps({"error": "Unknown action"}),
    }