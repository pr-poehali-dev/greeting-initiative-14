import os
import json
import hashlib
import secrets
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}

def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def json_response(data: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps(data)}

def handler(event: dict, context) -> dict:
    """Авторизация пользователей: вход, выход, проверка сессии."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    params = event.get("queryStringParameters") or {}
    action = params.get("action") or body.get("action", "")
    session_id = (event.get("headers") or {}).get("X-Session-Id", "")

    db = get_db()
    cur = db.cursor()

    if action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        pw_hash = hash_password(password)
        cur.execute(f"SELECT id, email FROM {SCHEMA}.users WHERE email=%s AND password_hash=%s", (email, pw_hash))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Неверный логин или пароль"}, 401)
        user_id, email = row
        sid = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (id, user_id) VALUES (%s, %s)", (sid, user_id))
        db.commit()
        return json_response({"session_id": sid, "user_id": user_id, "email": email})

    if action == "me":
        if not session_id:
            return json_response({"error": "Не авторизован"}, 401)
        cur.execute(f"""
            SELECT u.id, u.email FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Сессия истекла"}, 401)
        return json_response({"user_id": row[0], "email": row[1]})

    if action == "logout":
        if session_id:
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at=NOW() WHERE id=%s", (session_id,))
            db.commit()
        return json_response({"ok": True})

    return json_response({"error": "Unknown action"}, 400)
