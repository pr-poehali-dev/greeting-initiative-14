import os
import json
import urllib.request
import urllib.error
import time
import psycopg2  # noqa

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")
TG_BASE = "https://api.telegram.org/bot"

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def json_response(data: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps(data)}


def get_user(session_id: str) -> tuple:
    """Возвращает (telegram_bot_token,) по session_id."""
    if not session_id:
        return ("",)
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT u.telegram_bot_token FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        db.close()
        if row and row[0]:
            return (row[0].strip(),)
    except Exception as e:
        print(f"[telegram] DB error: {e}")
    return ("",)


def tg_get(token: str, method: str) -> dict:
    url = f"{TG_BASE}{token}/{method}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as ex:
        return {"ok": False, "description": str(ex)}


def tg_post(token: str, method: str, payload: dict) -> dict:
    url = f"{TG_BASE}{token}/{method}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[telegram] HTTP {e.code} {method}: {body[:200]}")
        return {"ok": False, "description": body}
    except Exception as ex:
        print(f"[telegram] Exception {method}: {ex}")
        return {"ok": False, "description": str(ex)}


def handler(event: dict, context) -> dict:
    """Управление Telegram-ботом: статус, список групп, рассылка."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    session_id = (event.get("headers") or {}).get("X-Session-Id", "")
    (bot_token,) = get_user(session_id)

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    if action == "status":
        if not bot_token:
            return json_response({"connected": False, "error": "no_token"})
        data = tg_get(bot_token, "getMe")
        if data.get("ok"):
            return json_response({"connected": True, "bot": data.get("result", {})})
        return json_response({"connected": False, "error": data.get("description", "")})

    if action == "groups":
        if not bot_token:
            return json_response({"error": "no_token", "groups": []})
        updates = tg_get(bot_token, "getUpdates?limit=100&allowed_updates=[\"message\",\"my_chat_member\"]")
        groups = {}
        if updates.get("ok"):
            for upd in updates.get("result", []):
                chat = (upd.get("message") or {}).get("chat") or (upd.get("my_chat_member") or {}).get("chat") or {}
                if chat.get("type") in ("group", "supergroup") and chat.get("id"):
                    cid = str(chat["id"])
                    if cid not in groups:
                        groups[cid] = {"id": cid, "name": chat.get("title", f"Группа {cid}"), "members": 0}
        result_groups = list(groups.values())
        print(f"[telegram] groups found: {len(result_groups)}")
        return json_response({"groups": result_groups})

    if action == "send":
        if not bot_token:
            return json_response({"error": "no_token"})
        text = (body.get("text") or "").strip()
        chat_ids = body.get("chat_ids", [])
        image_url = (body.get("image_url") or "").strip()
        if (not text and not image_url) or not chat_ids:
            return json_response({"error": "text/image_url и chat_ids обязательны"}, 400)
        sent = 0
        failed = 0
        for i, chat_id in enumerate(chat_ids):
            if image_url:
                payload = {"chat_id": int(chat_id), "photo": image_url}
                if text:
                    payload["caption"] = text
                res = tg_post(bot_token, "sendPhoto", payload)
            else:
                res = tg_post(bot_token, "sendMessage", {"chat_id": int(chat_id), "text": text})
            if res.get("ok"):
                sent += 1
                print(f"[telegram] OK chat={chat_id}")
            else:
                failed += 1
                print(f"[telegram] FAIL chat={chat_id}: {res.get('description', '')}")
            if i < len(chat_ids) - 1:
                time.sleep(0.05)
        return json_response({"sent": sent, "failed": failed, "total": len(chat_ids)})

    return json_response({"error": "Unknown action"}, 400)