import os
import json
import urllib.request
import urllib.error
import time
import psycopg2

BASE_URL = "https://api.green-api.com"
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        print(f"[send] DB error: {e}")
    return "", ""


def send_message(instance_id: str, token: str, group_id: str, text: str) -> dict:
    """Отправляет сообщение в группу через Green API."""
    url = f"{BASE_URL}/waInstance{instance_id}/sendMessage/{token}"
    payload = json.dumps({"chatId": group_id, "message": text}).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            print(f"[send] OK group={group_id} id={data.get('idMessage', '?')}")
            return {"ok": True, "group_id": group_id}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[send] HTTP {e.code} group={group_id}: {body[:200]}")
        return {"ok": False, "group_id": group_id, "error": f"HTTP {e.code}"}
    except Exception as ex:
        print(f"[send] Exception group={group_id}: {ex}")
        return {"ok": False, "group_id": group_id, "error": str(ex)}


def handler(event: dict, context) -> dict:
    """Отправка сообщения в группы WhatsApp через Green API."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    session_id = (event.get("headers") or {}).get("X-Session-Id", "")
    instance_id, token = get_user_instance(session_id)

    if not instance_id or not token:
        return {
            "statusCode": 200,
            "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Инстанс не назначен. Обратитесь к администратору."}),
        }

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    text = (body.get("text") or "").strip()
    group_ids = body.get("group_ids", [])

    if not text:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps({"error": "Текст сообщения обязателен"})}
    if not group_ids:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps({"error": "Выберите хотя бы одну группу"})}

    results = []
    for i, group_id in enumerate(group_ids):
        result = send_message(instance_id, token, group_id, text)
        results.append(result)
        if i < len(group_ids) - 1:
            time.sleep(2.5)

    sent = sum(1 for r in results if r["ok"])
    failed = len(results) - sent

    return {
        "statusCode": 200,
        "headers": {**cors, "Content-Type": "application/json"},
        "body": json.dumps({"sent": sent, "failed": failed, "total": len(results), "results": results}),
    }