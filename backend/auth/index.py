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
    """Авторизация пользователей: регистрация, вход, выход, профиль, обновление токена Whapi."""
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

    if action == "register":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        if not email or not password:
            return json_response({"error": "Email и пароль обязательны"}, 400)
        pw_hash = hash_password(password)
        try:
            cur.execute(f"INSERT INTO {SCHEMA}.users (email, password_hash) VALUES (%s, %s) RETURNING id", (email, pw_hash))
            user_id = cur.fetchone()[0]
            db.commit()
            sid = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (id, user_id) VALUES (%s, %s)", (sid, user_id))
            db.commit()
            return json_response({"session_id": sid, "user_id": user_id, "email": email})
        except Exception as e:
            db.rollback()
            if "unique" in str(e).lower():
                return json_response({"error": "Email уже зарегистрирован"}, 400)
            return json_response({"error": str(e)}, 500)

    if action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        pw_hash = hash_password(password)
        cur.execute(f"SELECT id, email, whapi_token FROM {SCHEMA}.users WHERE email=%s AND password_hash=%s", (email, pw_hash))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Неверный email или пароль"}, 401)
        user_id, email, whapi_token = row
        sid = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (id, user_id) VALUES (%s, %s)", (sid, user_id))
        db.commit()
        return json_response({"session_id": sid, "user_id": user_id, "email": email, "whapi_token": whapi_token or ""})

    if action == "me":
        if not session_id:
            return json_response({"error": "Не авторизован"}, 401)
        cur.execute(f"""
            SELECT u.id, u.email, u.whapi_token FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Сессия истекла"}, 401)
        return json_response({"user_id": row[0], "email": row[1], "whapi_token": row[2] or ""})

    if action == "update_token":
        if not session_id:
            return json_response({"error": "Не авторизован"}, 401)
        whapi_token = body.get("whapi_token", "").strip()
        cur.execute(f"""
            UPDATE {SCHEMA}.users SET whapi_token=%s
            WHERE id = (SELECT user_id FROM {SCHEMA}.sessions WHERE id=%s AND expires_at > NOW())
        """, (whapi_token, session_id))
        db.commit()
        return json_response({"ok": True})

    if action == "logout":
        if session_id:
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at=NOW() WHERE id=%s", (session_id,))
            db.commit()
        return json_response({"ok": True})

    return json_response({"error": "Unknown action"}, 400)
