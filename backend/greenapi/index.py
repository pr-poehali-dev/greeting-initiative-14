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


def get_user_id(session_id: str):
    """Возвращает user_id по session_id."""
    if not session_id:
        return None
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT user_id FROM {SCHEMA}.sessions
            WHERE id=%s AND expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        db.close()
        return row[0] if row else None
    except Exception as e:
        print(f"[greenapi] DB error get_user_id: {e}")
        return None


def get_user_instance(session_id: str, platform: str = "whatsapp") -> tuple:
    """Получает instance_id и token пользователя по session_id (из users, для обратной совместимости)."""
    if not session_id:
        return "", ""
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT u.green_api_instance_id, u.green_api_token, u.max_api_instance_id, u.max_api_token
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.id=%s AND s.expires_at > NOW()
        """, (session_id,))
        row = cur.fetchone()
        db.close()
        if row:
            if platform == "max" and row[2] and row[3]:
                return row[2].strip(), row[3].strip()
            if platform != "max" and row[0] and row[1]:
                return row[0].strip(), row[1].strip()
    except Exception as e:
        print(f"[greenapi] DB error: {e}")
    return "", ""


def get_accounts(user_id: int, platform: str) -> list:
    """Возвращает список аккаунтов пользователя из wa_accounts."""
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT id, name, instance_id, token, status, created_at
            FROM {SCHEMA}.wa_accounts
            WHERE user_id=%s AND platform=%s
            ORDER BY created_at ASC
        """, (user_id, platform))
        rows = cur.fetchall()
        db.close()
        return [
            {"id": r[0], "name": r[1], "instance_id": r[2], "token": r[3], "status": r[4]}
            for r in rows
        ]
    except Exception as e:
        print(f"[greenapi] DB error get_accounts: {e}")
        return []


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
    """Интеграция с Green API: QR, статус, список групп, управление несколькими аккаунтами."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "status")
    platform = params.get("platform", "whatsapp")

    # ── Управление аккаунтами (новые экшены) ──────────────────────────────

    if action == "list_accounts":
        user_id = get_user_id(session_id)
        if not user_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session", "accounts": []})}
        accounts = get_accounts(user_id, platform)
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"accounts": accounts})}

    if action == "add_account":
        user_id = get_user_id(session_id)
        if not user_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session"})}
        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                pass
        name = (body.get("name") or "").strip()
        instance_id = (body.get("instance_id") or "").strip()
        token = (body.get("token") or "").strip()
        if not instance_id or not token:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "instance_id и token обязательны"})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                INSERT INTO {SCHEMA}.wa_accounts (user_id, name, platform, instance_id, token, status)
                VALUES (%s, %s, %s, %s, %s, 'disconnected')
                RETURNING id
            """, (user_id, name or f"Аккаунт {instance_id[:8]}", platform, instance_id, token))
            new_id = cur.fetchone()[0]
            db.commit()
            db.close()
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True, "id": new_id})}
        except Exception as e:
            print(f"[greenapi] add_account error: {e}")
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e)})}

    if action == "remove_account":
        user_id = get_user_id(session_id)
        if not user_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session"})}
        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                pass
        account_id = body.get("account_id")
        if not account_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "account_id обязателен"})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                UPDATE {SCHEMA}.wa_accounts SET status='disconnected'
                WHERE id=%s AND user_id=%s
            """, (account_id, user_id))
            db.commit()
            db.close()
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True})}
        except Exception as e:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e)})}

    if action == "status_account":
        account_id = params.get("account_id")
        user_id = get_user_id(session_id)
        if not user_id or not account_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session"})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                SELECT instance_id, token FROM {SCHEMA}.wa_accounts
                WHERE id=%s AND user_id=%s
            """, (account_id, user_id))
            row = cur.fetchone()
            db.close()
            if not row:
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"error": "not_found"})}
            instance_id, token = row
        except Exception as e:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e)})}
        ok, data = api_get(instance_id, token, "getStateInstance")
        state = data.get("stateInstance", "unknown") if ok else "error"
        connected = state == "authorized"
        # Обновляем статус в БД
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                UPDATE {SCHEMA}.wa_accounts SET status=%s WHERE id=%s AND user_id=%s
            """, ("connected" if connected else "disconnected", account_id, user_id))
            db.commit()
            db.close()
        except Exception:
            pass
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"status": state, "connected": connected})}

    if action == "qr_account":
        account_id = params.get("account_id")
        user_id = get_user_id(session_id)
        if not user_id or not account_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session"})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                SELECT instance_id, token FROM {SCHEMA}.wa_accounts
                WHERE id=%s AND user_id=%s
            """, (account_id, user_id))
            row = cur.fetchone()
            db.close()
            if not row:
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"error": "not_found"})}
            instance_id, token = row
        except Exception as e:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e)})}
        ok, data = api_get(instance_id, token, "qr")
        if ok:
            qr_type = data.get("type", "")
            if qr_type == "qrCode":
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"qr_code": f"data:image/png;base64,{data['message']}", "already_connected": False})}
            if qr_type == "alreadyLogged":
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"qr_code": None, "already_connected": True})}
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"qr_code": None, "already_connected": False, "error": str(data)})}

    if action == "groups_account":
        account_id = params.get("account_id")
        user_id = get_user_id(session_id)
        if not user_id or not account_id:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"groups": [], "error": "no_session"})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"""
                SELECT instance_id, token FROM {SCHEMA}.wa_accounts
                WHERE id=%s AND user_id=%s
            """, (account_id, user_id))
            row = cur.fetchone()
            db.close()
            if not row:
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"groups": [], "error": "not_found"})}
            instance_id, token = row
        except Exception as e:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"groups": [], "error": str(e)})}
        ok, data = api_post(instance_id, token, "getChats", {})
        if not ok or not isinstance(data, list):
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"groups": [], "error": str(data)})}
        groups = [
            {"id": c.get("id") or c.get("chatId", ""), "name": c.get("name", "")}
            for c in data if (c.get("id", "").endswith("@g.us") or c.get("type") == "group")
        ]
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"groups": groups, "total": len(groups)})}

    # ── load_groups / save_groups — не требуют instance_id ──────────────

    if action == "load_groups":
        """Загружает сохранённые группы пользователя из БД, фильтруя по его instance_id."""
        user_id = get_user_id(session_id)
        if not user_id:
            return {"statusCode": 401, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session", "groups": []})}
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            # Получаем все instance_id пользователя (основной WA, MAX, мультиаккаунты)
            cur.execute(
                f"SELECT green_api_instance_id, max_api_instance_id FROM {SCHEMA}.users WHERE id=%s",
                (user_id,)
            )
            urow = cur.fetchone()
            user_instances = set()
            if urow:
                if urow[0]: user_instances.add(urow[0].strip())
                if urow[1]: user_instances.add(urow[1].strip())
            cur.execute(
                f"SELECT instance_id FROM {SCHEMA}.wa_accounts WHERE user_id=%s",
                (user_id,)
            )
            for r in cur.fetchall():
                if r[0]: user_instances.add(r[0].strip())
            # Загружаем только группы принадлежащие этим инстансам (или без инстанса — legacy)
            cur.execute(
                f"SELECT id, instance_id, name, members, active, tag, wa_id FROM {SCHEMA}.groups WHERE user_id=%s ORDER BY id ASC",
                (user_id,)
            )
            rows = cur.fetchall()
            db.close()
            groups_list = []
            for r in rows:
                inst = r[1] or ""
                # Включаем если инстанс пустой (старые данные) или принадлежит пользователю
                if not inst or inst in user_instances:
                    groups_list.append({"id": r[0], "instance_id": inst, "name": r[2], "members": r[3], "active": r[4], "tag": r[5], "waId": r[6]})
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"groups": groups_list})}
        except Exception as e:
            print(f"[greenapi] load_groups error: {e}")
            return {"statusCode": 500, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e), "groups": []})}

    if action == "save_groups":
        """Сохраняет список групп пользователя в БД (заменяет старые для данного instance_id и tag)."""
        user_id = get_user_id(session_id)
        if not user_id:
            return {"statusCode": 401, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "no_session"})}
        body_raw = event.get("body") or "{}"
        body = json.loads(body_raw) if isinstance(body_raw, str) else body_raw
        groups_data = body.get("groups", [])
        tag = body.get("tag", "WhatsApp")
        inst = body.get("instance_id", "")
        # Если instance_id не передан — берём из профиля пользователя
        if not inst:
            try:
                db2 = psycopg2.connect(os.environ["DATABASE_URL"])
                cur2 = db2.cursor()
                plat_for_inst = "max" if tag == "MAX" else "whatsapp"
                if plat_for_inst == "max":
                    cur2.execute(f"SELECT max_api_instance_id FROM {SCHEMA}.users WHERE id=%s", (user_id,))
                else:
                    cur2.execute(f"SELECT green_api_instance_id FROM {SCHEMA}.users WHERE id=%s", (user_id,))
                row2 = cur2.fetchone()
                db2.close()
                if row2 and row2[0]:
                    inst = row2[0].strip()
            except Exception as e2:
                print(f"[greenapi] save_groups get_inst error: {e2}")
        try:
            db = psycopg2.connect(os.environ["DATABASE_URL"])
            cur = db.cursor()
            cur.execute(f"DELETE FROM {SCHEMA}.groups WHERE user_id=%s AND instance_id=%s AND tag=%s", (user_id, inst, tag))
            for g in groups_data:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.groups (user_id, instance_id, name, members, active, tag, wa_id) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (user_id, inst, g.get("name",""), g.get("members", 0), g.get("active", True), tag, g.get("waId",""))
                )
            db.commit()
            db.close()
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True})}
        except Exception as e:
            print(f"[greenapi] save_groups error: {e}")
            return {"statusCode": 500, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": str(e)})}

    # ── Старые экшены (обратная совместимость) ────────────────────────────

    instance_id, token = get_user_instance(session_id, platform)

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
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"qr_code": f"data:image/png;base64,{data['message']}", "already_connected": False})}
            if qr_type == "alreadyLogged":
                return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                        "body": json.dumps({"qr_code": None, "already_connected": True})}
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"qr_code": None, "already_connected": False, "error": str(data)})}

    if action == "status":
        ok, data = api_get(instance_id, token, "getStateInstance")
        state = data.get("stateInstance", "unknown") if ok else "error"
        connected = state == "authorized"
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"status": state, "connected": connected})}

    if action == "logout":
        ok, data = api_get(instance_id, token, "logout")
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"ok": ok})}

    if action == "groups":
        ok, data = api_post(instance_id, token, "getChats", {})
        if not ok or not isinstance(data, list):
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"groups": [], "total": 0, "error": str(data)})}
        groups = [
            {"id": c.get("id") or c.get("chatId", ""), "name": c.get("name", "")}
            for c in data if (c.get("id", "").endswith("@g.us") or c.get("type") == "group")
        ]
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"groups": groups, "total": len(groups)})}

    return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Unknown action"})}