import os
import json
import urllib.request
import urllib.error
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")

# Внутренний URL функции worker_tick (не секрет — используется только backend→backend,
# наружу в браузер никогда не попадает; сам доступ к worker_tick защищён WORKER_SECRET).
WORKER_TICK_URL = "https://functions.poehali.dev/c633ec8d-0b52-4820-9417-7abb76d5b2ba"

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def json_response(data: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps(data)}


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_id(cur, session_id: str):
    if not session_id:
        return None
    cur.execute(f"SELECT user_id FROM {SCHEMA}.sessions WHERE id=%s AND expires_at > NOW()", (session_id,))
    row = cur.fetchone()
    return row[0] if row else None


def resolve_accounts(cur, user_id: int, platform: str, multi: bool, account_ids, use_main_account: bool) -> list:
    """Возвращает список (instance_id, token) для рассылки — аналогично логике backend/send."""
    accounts = []
    if multi:
        if account_ids is not None:
            if account_ids:
                ids = tuple(int(i) for i in account_ids)
                cur.execute(f"""
                    SELECT instance_id, token FROM {SCHEMA}.wa_accounts
                    WHERE user_id=%s AND platform=%s AND status='connected' AND id IN %s
                """, (user_id, platform, ids))
                accounts = [(r[0], r[1]) for r in cur.fetchall() if r[0] and r[1]]
        else:
            cur.execute(f"""
                SELECT instance_id, token FROM {SCHEMA}.wa_accounts
                WHERE user_id=%s AND platform=%s AND status='connected'
            """, (user_id, platform))
            accounts = [(r[0], r[1]) for r in cur.fetchall() if r[0] and r[1]]
        if use_main_account:
            if platform == "max":
                cur.execute(f"SELECT max_api_instance_id, max_api_token FROM {SCHEMA}.users WHERE id=%s", (user_id,))
            else:
                cur.execute(f"SELECT green_api_instance_id, green_api_token FROM {SCHEMA}.users WHERE id=%s", (user_id,))
            row = cur.fetchone()
            if row and row[0] and row[1]:
                pair = (row[0].strip(), row[1].strip())
                if pair not in accounts:
                    accounts = [pair] + accounts
    else:
        if platform == "max":
            cur.execute(f"SELECT max_api_instance_id, max_api_token FROM {SCHEMA}.users WHERE id=%s", (user_id,))
        else:
            cur.execute(f"SELECT green_api_instance_id, green_api_token FROM {SCHEMA}.users WHERE id=%s", (user_id,))
        row = cur.fetchone()
        if row and row[0] and row[1]:
            accounts = [(row[0].strip(), row[1].strip())]
    return accounts


def nudge_worker():
    """Backend→backend: просим worker_tick немедленно обработать очередь, чтобы не ждать внешний таймер.
    Секрет WORKER_SECRET остаётся только здесь, на сервере, и никогда не отдаётся в браузер.

    КРИТИЧНО: worker_tick — долгий обработчик (может честно работать до ~25с, обрабатывая
    очередь), а у этой функции (broadcast) собственный таймаут всего 5с. Поэтому здесь нельзя
    ждать полного ответа worker_tick — используется маленький таймаут (2с), которого хватает
    только на установление соединения и отправку запроса. Если worker_tick не успеет ответить
    за это время — не страшно: задание уже сохранено в БД и будет надёжно подобрано в течение
    минуты обычным тиком по cron. Этот вызов — только ускорение старта, а не гарантия."""
    if not WORKER_TICK_URL:
        return
    try:
        req = urllib.request.Request(
            WORKER_TICK_URL, data=b"{}", method="POST",
            headers={"Content-Type": "application/json", "X-Worker-Secret": os.environ.get("WORKER_SECRET", "")}
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception as e:
        print(f"[broadcast] nudge_worker error (не критично, обработается по cron): {e}")


def handler(event: dict, context) -> dict:
    """Управление фоновыми заданиями рассылки: создание, статус, отмена, разбор неопределённых отправок."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    headers = event.get("headers") or {}
    session_id = headers.get("X-Session-Id", "")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    db = get_db()
    cur = db.cursor()
    user_id = get_user_id(cur, session_id)
    if not user_id:
        db.close()
        return json_response({"error": "no_session"}, 401)

    if action == "create_job":
        platform = (body.get("platform") or "whatsapp").strip()
        text = (body.get("text") or "").strip()
        image_url = (body.get("image_url") or "").strip()
        recipients = body.get("groups") or []  # [{group_id, group_name}]
        multi = bool(body.get("multi_account", False))
        account_ids = body.get("account_ids") if "account_ids" in body else None
        use_main_account = body.get("use_main_account", True)
        interval_seconds = body.get("interval_seconds", 2.5)

        if not text and not image_url:
            db.close()
            return json_response({"error": "Текст сообщения или фото обязательны"}, 400)
        if not recipients:
            db.close()
            return json_response({"error": "Выберите хотя бы одну группу"}, 400)

        accounts = resolve_accounts(cur, user_id, platform, multi, account_ids, use_main_account)
        if not accounts:
            db.close()
            return json_response({"error": "Нет подключённых аккаунтов для отправки"}, 400)

        try:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.broadcast_jobs
                    (user_id, platform, text, image_url, status, total_count, interval_seconds)
                VALUES (%s, %s, %s, %s, 'queued', %s, %s)
                RETURNING id
            """, (user_id, platform, text, image_url, len(recipients), interval_seconds))
            job_id = cur.fetchone()[0]

            n = len(accounts)
            for i, g in enumerate(recipients):
                instance_id = accounts[i % n][0]
                gid = (g.get("group_id") or g.get("waId") or "").strip()
                gname = (g.get("group_name") or g.get("name") or "").strip()
                if not gid:
                    continue
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.broadcast_job_items
                        (job_id, group_id, group_name, instance_id, order_index)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (job_id, group_id) DO NOTHING
                """, (job_id, gid, gname, instance_id, i))
            db.commit()
        except Exception as e:
            db.rollback()
            db.close()
            return json_response({"error": str(e)}, 500)
        db.close()
        nudge_worker()
        return json_response({"ok": True, "job_id": job_id})

    if action == "nudge":
        db.close()
        nudge_worker()
        return json_response({"ok": True})

    if action == "list_jobs":
        cur.execute(f"""
            SELECT id, platform, status, total_count, sent_count, failed_count, ambiguous_count,
                   created_at, started_at, finished_at, error
            FROM {SCHEMA}.broadcast_jobs
            WHERE user_id=%s
            ORDER BY created_at DESC
            LIMIT 20
        """, (user_id,))
        rows = cur.fetchall()
        db.close()
        jobs = [{
            "id": r[0], "platform": r[1], "status": r[2], "total_count": r[3],
            "sent_count": r[4], "failed_count": r[5], "ambiguous_count": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
            "started_at": r[8].isoformat() if r[8] else None,
            "finished_at": r[9].isoformat() if r[9] else None,
            "error": r[10],
        } for r in rows]
        return json_response({"jobs": jobs})

    if action == "job_status":
        job_id = params.get("job_id")
        if not job_id:
            db.close()
            return json_response({"error": "job_id обязателен"}, 400)
        cur.execute(f"""
            SELECT id, platform, status, total_count, sent_count, failed_count, ambiguous_count,
                   cancel_requested, error, created_at, started_at, finished_at
            FROM {SCHEMA}.broadcast_jobs WHERE id=%s AND user_id=%s
        """, (job_id, user_id))
        row = cur.fetchone()
        if not row:
            db.close()
            return json_response({"error": "Задание не найдено"}, 404)
        cur.execute(f"""
            SELECT id, group_id, group_name, status, attempts, last_error, last_error_type
            FROM {SCHEMA}.broadcast_job_items
            WHERE job_id=%s AND status IN ('ambiguous', 'failed')
            ORDER BY order_index ASC
        """, (job_id,))
        problem_items = [{
            "id": r[0], "group_id": r[1], "group_name": r[2], "status": r[3],
            "attempts": r[4], "last_error": r[5], "last_error_type": r[6],
        } for r in cur.fetchall()]
        db.close()
        return json_response({
            "job": {
                "id": row[0], "platform": row[1], "status": row[2], "total_count": row[3],
                "sent_count": row[4], "failed_count": row[5], "ambiguous_count": row[6],
                "cancel_requested": row[7], "error": row[8],
                "created_at": row[9].isoformat() if row[9] else None,
                "started_at": row[10].isoformat() if row[10] else None,
                "finished_at": row[11].isoformat() if row[11] else None,
            },
            "problem_items": problem_items,
        })

    if action == "cancel_job":
        job_id = body.get("job_id")
        if not job_id:
            db.close()
            return json_response({"error": "job_id обязателен"}, 400)
        cur.execute(f"""
            UPDATE {SCHEMA}.broadcast_jobs SET cancel_requested=true, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (job_id, user_id))
        db.commit()
        db.close()
        return json_response({"ok": True})

    if action == "resolve_ambiguous":
        item_id = body.get("item_id")
        decision = body.get("decision")  # retry | mark_sent | mark_failed
        if not item_id or decision not in ("retry", "mark_sent", "mark_failed"):
            db.close()
            return json_response({"error": "item_id и корректный decision обязательны"}, 400)
        cur.execute(f"""
            SELECT bji.id, bji.job_id FROM {SCHEMA}.broadcast_job_items bji
            JOIN {SCHEMA}.broadcast_jobs bj ON bj.id = bji.job_id
            WHERE bji.id=%s AND bj.user_id=%s
        """, (item_id, user_id))
        row = cur.fetchone()
        if not row:
            db.close()
            return json_response({"error": "Элемент не найден"}, 404)
        job_id = row[1]
        if decision == "retry":
            cur.execute(f"""
                UPDATE {SCHEMA}.broadcast_job_items
                SET status='pending', next_attempt_at=NOW(), max_attempts=max_attempts+1, finished_at=NULL
                WHERE id=%s
            """, (item_id,))
        elif decision == "mark_sent":
            cur.execute(f"""
                UPDATE {SCHEMA}.broadcast_job_items SET status='sent', sent_at=NOW(), finished_at=NOW()
                WHERE id=%s
            """, (item_id,))
        else:
            cur.execute(f"""
                UPDATE {SCHEMA}.broadcast_job_items SET status='failed', finished_at=NOW()
                WHERE id=%s
            """, (item_id,))
        cur.execute(f"""
            UPDATE {SCHEMA}.broadcast_jobs SET
                sent_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='sent'),
                failed_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='failed'),
                ambiguous_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='ambiguous'),
                status = CASE WHEN status IN ('completed','cancelled') AND EXISTS (
                    SELECT 1 FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status IN ('pending','sending')
                ) THEN 'running' ELSE status END,
                updated_at = NOW()
            WHERE id=%s
        """, (job_id, job_id, job_id, job_id, job_id))
        db.commit()
        db.close()
        if decision == "retry":
            nudge_worker()
        return json_response({"ok": True})

    if action == "job_items":
        job_id = params.get("job_id")
        if not job_id:
            db.close()
            return json_response({"error": "job_id обязателен"}, 400)
        cur.execute(f"SELECT id FROM {SCHEMA}.broadcast_jobs WHERE id=%s AND user_id=%s", (job_id, user_id))
        if not cur.fetchone():
            db.close()
            return json_response({"error": "Задание не найдено"}, 404)
        cur.execute(f"""
            SELECT id, group_id, group_name, status, attempts, last_error, last_error_type, sent_at
            FROM {SCHEMA}.broadcast_job_items
            WHERE job_id=%s
            ORDER BY order_index ASC
        """, (job_id,))
        items = [{
            "id": r[0], "group_id": r[1], "group_name": r[2], "status": r[3],
            "attempts": r[4], "last_error": r[5], "last_error_type": r[6],
            "sent_at": r[7].isoformat() if r[7] else None,
        } for r in cur.fetchall()]
        db.close()
        return json_response({"items": items})

    db.close()
    return json_response({"error": "Unknown action"}, 400)