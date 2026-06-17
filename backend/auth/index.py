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
    """Авторизация пользователей: вход, выход, проверка сессии, управление пользователями."""
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

    admin_secret = os.environ.get("ADMIN_SECRET", "1966qwaszx") or "1966qwaszx"

    if action == "list_users":
        secret = body.get("secret", "")
        if secret != admin_secret:
            return json_response({"error": "Forbidden"}, 403)
        cur.execute(f"SELECT id, email, green_api_instance_id, green_api_token, max_api_instance_id, max_api_token, telegram_bot_token, whapi_token FROM {SCHEMA}.users ORDER BY id")
        rows = cur.fetchall()
        return json_response({"users": [{"id": r[0], "email": r[1], "instance_id": r[2] or "", "instance_token": r[3] or "", "max_instance_id": r[4] or "", "max_instance_token": r[5] or "", "telegram_bot_token": r[6] or "", "whapi_token": r[7] or ""} for r in rows]})

    if action == "create_user":
        secret = body.get("secret", "")
        if secret != admin_secret:
            return json_response({"error": "Forbidden"}, 403)
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        instance_id = body.get("instance_id", "").strip()
        instance_token = body.get("instance_token", "").strip()
        if not email or not password:
            return json_response({"error": "email и password обязательны"}, 400)
        pw_hash = hash_password(password)
        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (email, password_hash, green_api_instance_id, green_api_token) VALUES (%s, %s, %s, %s) RETURNING id",
                (email, pw_hash, instance_id, instance_token)
            )
            user_id = cur.fetchone()[0]
            db.commit()
            return json_response({"ok": True, "user_id": user_id, "email": email})
        except Exception as e:
            db.rollback()
            if "unique" in str(e).lower():
                return json_response({"error": "Логин уже существует"}, 400)
            return json_response({"error": str(e)}, 500)

    if action == "set_instance":
        secret = body.get("secret", "")
        if secret != admin_secret:
            return json_response({"error": "Forbidden"}, 403)
        user_id = body.get("user_id")
        instance_id = body.get("instance_id", "").strip()
        instance_token = body.get("instance_token", "").strip()
        max_instance_id = body.get("max_instance_id", "").strip()
        max_instance_token = body.get("max_instance_token", "").strip()
        telegram_bot_token = body.get("telegram_bot_token", "").strip()
        whapi_token = body.get("whapi_token", "").strip()
        if not user_id:
            return json_response({"error": "user_id обязателен"}, 400)
        cur.execute(f"""UPDATE {SCHEMA}.users SET green_api_instance_id=%s, green_api_token=%s,
            max_api_instance_id=%s, max_api_token=%s, telegram_bot_token=%s, whapi_token=%s WHERE id=%s""",
            (instance_id, instance_token, max_instance_id, max_instance_token, telegram_bot_token, whapi_token, user_id))
        db.commit()
        return json_response({"ok": True})

    if action == "reset_password":
        secret = body.get("secret", "")
        if secret != admin_secret:
            return json_response({"error": "Forbidden"}, 403)
        user_id = body.get("user_id")
        new_password = body.get("new_password", "")
        if not user_id or not new_password:
            return json_response({"error": "user_id и new_password обязательны"}, 400)
        pw_hash = hash_password(new_password)
        cur.execute(f"UPDATE {SCHEMA}.users SET password_hash=%s WHERE id=%s", (pw_hash, user_id))
        cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at=NOW() WHERE user_id=%s", (user_id,))
        db.commit()
        return json_response({"ok": True})

    if action == "delete_user":
        secret = body.get("secret", "")
        if secret != admin_secret:
            return json_response({"error": "Forbidden"}, 403)
        user_id = body.get("user_id")
        if not user_id:
            return json_response({"error": "user_id обязателен"}, 400)
        cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at=NOW() WHERE user_id=%s", (user_id,))
        cur.execute(f"UPDATE {SCHEMA}.users SET password_hash='DELETED', email=email || '__deleted_' || id WHERE id=%s", (user_id,))
        db.commit()
        return json_response({"ok": True})

    if action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        pw_hash = hash_password(password)
        cur.execute(f"SELECT id, email, green_api_instance_id, green_api_token FROM {SCHEMA}.users WHERE email=%s AND password_hash=%s", (email, pw_hash))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Неверный логин или пароль"}, 401)
        user_id, email, instance_id, instance_token = row
        sid = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (id, user_id) VALUES (%s, %s)", (sid, user_id))
        db.commit()
        return json_response({"session_id": sid, "user_id": user_id, "email": email, "has_instance": bool(instance_id and instance_token)})

    if action == "me":
        if not session_id:
            return json_response({"error": "Не авторизован"}, 401)
        cur.execute(f"""
            SELECT u.id, u.email, u.green_api_instance_id, u.green_api_token FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        if not row:
            return json_response({"error": "Сессия истекла"}, 401)
        return json_response({"user_id": row[0], "email": row[1], "has_instance": bool(row[2] and row[3])})

    if action == "logout":
        if session_id:
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at=NOW() WHERE id=%s", (session_id,))
            db.commit()
        return json_response({"ok": True})

    return json_response({"error": "Unknown action"}, 400)