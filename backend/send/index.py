import os
import json
import urllib.request
import urllib.error
import time
import psycopg2

BASE_URL = "https://api.green-api.com"
WHAPI_BASE = "https://gate.whapi.cloud"
SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def get_user_instance(session_id: str, platform: str = "whatsapp") -> tuple:
    """Получает instance_id и token пользователя по session_id (legacy)."""
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
        print(f"[send] DB error: {e}")
    return "", ""


def get_all_accounts(session_id: str, platform: str) -> list:
    """Возвращает все ПОДКЛЮЧЁННЫЕ доп. аккаунты пользователя из wa_accounts."""
    if not session_id:
        return []
    try:
        db = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = db.cursor()
        cur.execute(f"""
            SELECT a.instance_id, a.token
            FROM {SCHEMA}.wa_accounts a
            JOIN {SCHEMA}.sessions s ON s.user_id = a.user_id
            WHERE s.id=%s AND s.expires_at > NOW() AND a.platform=%s AND a.status='connected'
        """, (session_id, platform))
        rows = cur.fetchall()
        db.close()
        return [(r[0], r[1]) for r in rows if r[0] and r[1]]
    except Exception as e:
        print(f"[send] DB error get_all_accounts: {e}")
        return []


def get_whapi_token(session_id: str) -> str:
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
        print(f"[send] DB error get_whapi_token: {e}")
    return ""


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


def send_file(instance_id: str, token: str, group_id: str, text: str, file_url: str) -> dict:
    """Отправляет фото с подписью в группу через Green API (sendFileByUrl)."""
    url = f"{BASE_URL}/waInstance{instance_id}/sendFileByUrl/{token}"
    file_name = file_url.rsplit("/", 1)[-1] or "photo.jpg"
    payload = json.dumps({
        "chatId": group_id,
        "urlFile": file_url,
        "fileName": file_name,
        "caption": text,
    }).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            print(f"[send] OK(file) group={group_id} id={data.get('idMessage', '?')}")
            return {"ok": True, "group_id": group_id}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[send] HTTP {e.code} group={group_id}: {body[:200]}")
        return {"ok": False, "group_id": group_id, "error": f"HTTP {e.code}"}
    except Exception as ex:
        print(f"[send] Exception group={group_id}: {ex}")
        return {"ok": False, "group_id": group_id, "error": str(ex)}


def send_message_whapi(token: str, group_id: str, text: str) -> dict:
    """Отправляет сообщение в группу через Whapi.cloud."""
    url = f"{WHAPI_BASE}/messages/text"
    payload = json.dumps({"to": group_id, "body": text}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            print(f"[send/whapi] OK group={group_id} id={data.get('id', '?')}")
            return {"ok": True, "group_id": group_id}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[send/whapi] HTTP {e.code} group={group_id}: {body[:200]}")
        return {"ok": False, "group_id": group_id, "error": f"HTTP {e.code}"}
    except Exception as ex:
        print(f"[send/whapi] Exception group={group_id}: {ex}")
        return {"ok": False, "group_id": group_id, "error": str(ex)}


def send_file_whapi(token: str, group_id: str, text: str, file_url: str) -> dict:
    """Отправляет фото с подписью в группу через Whapi.cloud."""
    url = f"{WHAPI_BASE}/messages/image"
    payload = json.dumps({"to": group_id, "media": file_url, "caption": text}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            print(f"[send/whapi] OK(file) group={group_id} id={data.get('id', '?')}")
            return {"ok": True, "group_id": group_id}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[send/whapi] HTTP {e.code} group={group_id}: {body[:200]}")
        return {"ok": False, "group_id": group_id, "error": f"HTTP {e.code}"}
    except Exception as ex:
        print(f"[send/whapi] Exception group={group_id}: {ex}")
        return {"ok": False, "group_id": group_id, "error": str(ex)}


def handler(event: dict, context) -> dict:
    """Отправка сообщения в группы WhatsApp через Green API или Whapi.cloud."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    session_id = (event.get("headers") or {}).get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    platform = params.get("platform", "whatsapp")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    text = (body.get("text") or "").strip()
    group_ids = body.get("group_ids", [])
    image_url = (body.get("image_url") or "").strip()
    # multi_account=true — отправить со всех аккаунтов
    multi = body.get("multi_account", False)

    if not text and not image_url:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Текст сообщения или фото обязательны"})}
    if not group_ids:
        return {"statusCode": 400, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Выберите хотя бы одну группу"})}

    # ── Whapi.cloud ────────────────────────────────────────────────────────
    if platform == "whapi":
        whapi_token = get_whapi_token(session_id)
        if not whapi_token:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "Токен Whapi не назначен. Обратитесь к администратору."})}
        results = []
        for i, group_id in enumerate(group_ids):
            if image_url:
                result = send_file_whapi(whapi_token, group_id, text, image_url)
            else:
                result = send_message_whapi(whapi_token, group_id, text)
            results.append(result)
            if i < len(group_ids) - 1:
                time.sleep(2.5)
        sent = sum(1 for r in results if r["ok"])
        failed = len(results) - sent
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"sent": sent, "failed": failed, "total": len(results), "results": results})}

    # ── Green API (multi-account) ──────────────────────────────────────────
    if multi:
        accounts = get_all_accounts(session_id, platform)
        main_instance, main_token = get_user_instance(session_id, platform)
        if main_instance and main_token and (main_instance, main_token) not in accounts:
            accounts = [(main_instance, main_token)] + accounts
        if not accounts:
            return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                    "body": json.dumps({"error": "Нет подключённых аккаунтов"})}

        all_results = []
        n = len(accounts)
        for acc_idx, (instance_id, token) in enumerate(accounts):
            acc_groups = [g for i, g in enumerate(group_ids) if i % n == acc_idx]
            for i, group_id in enumerate(acc_groups):
                if image_url:
                    result = send_file(instance_id, token, group_id, text, image_url)
                else:
                    result = send_message(instance_id, token, group_id, text)
                result["account_idx"] = acc_idx
                all_results.append(result)
                if i < len(acc_groups) - 1:
                    time.sleep(2.5)
            if acc_idx < n - 1:
                time.sleep(1.0)
        total_sent = sum(1 for r in all_results if r["ok"])
        total_failed = len(all_results) - total_sent
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"sent": total_sent, "failed": total_failed,
                                    "total": len(all_results), "accounts_used": len(accounts)})}

    # ── Green API (legacy, один аккаунт) ──────────────────────────────────
    instance_id, token = get_user_instance(session_id, platform)
    if not instance_id or not token:
        return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Инстанс не назначен. Обратитесь к администратору."})}

    results = []
    for i, group_id in enumerate(group_ids):
        if image_url:
            result = send_file(instance_id, token, group_id, text, image_url)
        else:
            result = send_message(instance_id, token, group_id, text)
        results.append(result)
        if i < len(group_ids) - 1:
            time.sleep(2.5)

    sent = sum(1 for r in results if r["ok"])
    failed = len(results) - sent
    return {"statusCode": 200, "headers": {**cors, "Content-Type": "application/json"},
            "body": json.dumps({"sent": sent, "failed": failed, "total": len(results), "results": results})}