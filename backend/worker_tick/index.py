import os
import json
import time
import uuid
import urllib.request
import urllib.error
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p54486869_greeting_initiative_")
BASE_URL = "https://api.green-api.com"

# Функция вызывается внешним cron-сервисом (cron-job.org), у которого на бесплатном
# тарифе ЖЁСТКИЙ лимит HTTP-ответа 30 секунд (соединение обрывается клиентом, сколько бы
# ни было настроено в таймауте платформы). Таймаут самой функции в настройках платформы
# (Ядро → Функции → worker_tick) оставлен 120с как защитный запас на случай сбоев.
#
# КРИТИЧНО: проверка "осталось ли время" должна учитывать не только уже прошедшее время,
# но и ХУДШИЙ СЛУЧАЙ длительности ОДНОГО ещё не начатого item — иначе item, взятый прямо
# перед истечением бюджета, может сам растянуться (зависший/медленный ответ Green API +
# доп. проверка verify_via_last_outgoing при ambiguous-ошибке) и увести общее время
# далеко за 30-секундный предел cron-сервиса. Поэтому новый item берётся только если
# HARD_DEADLINE_SECONDS - прошедшее_время >= WORST_CASE_ITEM_SECONDS (см. ниже).
HARD_DEADLINE_SECONDS = float(os.environ.get("WORKER_HARD_DEADLINE_SECONDS", "25"))

# Таймауты сетевых вызовов к Green API — намеренно небольшие (обычный ответ занимает
# доли секунды - 1-2с), чтобы даже полностью зависший запрос не съедал весь бюджет.
SEND_MESSAGE_TIMEOUT_SECONDS = 6
SEND_FILE_TIMEOUT_SECONDS = 8
API_GET_TIMEOUT_SECONDS = 6  # используется и в verify_via_last_outgoing

# Худший случай одного item: самый долгий из вызовов отправки (текст/файл) + возможная
# доп. проверка verify_via_last_outgoing при ambiguous-ошибке + запас на работу с БД (~1с).
WORST_CASE_ITEM_SECONDS = max(SEND_MESSAGE_TIMEOUT_SECONDS, SEND_FILE_TIMEOUT_SECONDS) + API_GET_TIMEOUT_SECONDS + 1

# Дополнительный жёсткий предохранитель — не больше стольки элементов за один тик,
# даже если тайм-бюджет ещё не исчерпан (защита от неожиданно быстрых ответов Green API).
MAX_ITEMS_PER_TICK = int(os.environ.get("WORKER_MAX_ITEMS_PER_TICK", "15"))

# После скольки секунд считаем 'sending' зависшим (упал/оборвался предыдущий worker).
# С запасом ~3x над WORST_CASE_ITEM_SECONDS, чтобы не путать "ещё реально обрабатывается"
# с "точно зависло", но при этом восстанавливаться быстрее, чем раньше.
STUCK_SENDING_SECONDS = 45
# Лок инстанса считается протухшим через 150с — с запасом ~30с сверх жёсткого таймаута
# функции (120с), чтобы исключить гонку на границе: если платформа убьёт процесс
# ровно на 120-й секунде, лок не должен "протухнуть" в тот же момент для другого worker'а.
LOCK_STALE_SECONDS = 150
BACKOFF_SECONDS = {1: 10, 2: 30, 3: 90}  # пауза перед повторной попыткой после временной ошибки

cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Worker-Secret",
}


def json_response(data: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": {**cors, "Content-Type": "application/json"}, "body": json.dumps(data)}


# ── Вызовы Green API ────────────────────────────────────────────────────────

def api_get(instance_id: str, token: str, method: str, query: str = "") -> tuple:
    url = f"{BASE_URL}/waInstance{instance_id}/{method}/{token}{query}"
    req = urllib.request.Request(url, method="GET", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=API_GET_TIMEOUT_SECONDS) as resp:
        return True, json.loads(resp.read().decode())


def send_message(instance_id: str, token: str, group_id: str, text: str):
    url = f"{BASE_URL}/waInstance{instance_id}/sendMessage/{token}"
    payload = json.dumps({"chatId": group_id, "message": text}).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=SEND_MESSAGE_TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read().decode())


def send_file(instance_id: str, token: str, group_id: str, text: str, file_url: str):
    url = f"{BASE_URL}/waInstance{instance_id}/sendFileByUrl/{token}"
    file_name = file_url.rsplit("/", 1)[-1] or "photo.jpg"
    payload = json.dumps({"chatId": group_id, "urlFile": file_url, "fileName": file_name, "caption": text}).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=SEND_FILE_TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read().decode())


def classify_exception(exc) -> tuple:
    """Возвращает (error_type, http_status, error_text).
    temporary — Green API ответил явной временной ошибкой (5xx/429), можно повторить.
    permanent — Green API явно отверг запрос (4xx кроме 429), повторять бессмысленно.
    ambiguous — мы НЕ получили внятного ответа от сервера (обрыв сети/таймаут чтения),
                нельзя быть уверенным, ушло сообщение или нет — требуется проверка."""
    if isinstance(exc, urllib.error.HTTPError):
        status = exc.code
        try:
            body = exc.read().decode()[:300]
        except Exception:
            body = str(exc)
        if status == 429 or status >= 500:
            return "temporary", status, body
        return "permanent", status, body
    # URLError, timeout, обрыв соединения, некорректный JSON в ответе и т.п. —
    # мы не знаем, дошёл ли запрос до Green API и было ли сообщение отправлено.
    return "ambiguous", None, str(exc)


def verify_via_last_outgoing(instance_id: str, token: str, group_id: str, text_snippet: str):
    """Best-effort проверка через lastOutgoingMessages: искали ли мы недавно
    отправленное сообщение в этот чат. НЕ является 100% гарантией (метод сам может
    быть неполным/с задержкой) — при любой неопределённости возвращаем None."""
    try:
        ok, data = api_get(instance_id, token, "lastOutgoingMessages", "?minutes=30")
        if not ok or not isinstance(data, list):
            return None
        for msg in data:
            if msg.get("chatId") != group_id:
                continue
            msg_text = (msg.get("textMessage") or msg.get("caption") or "")
            if text_snippet and text_snippet[:40] not in msg_text:
                continue
            status = (msg.get("statusMessage") or msg.get("status") or "").lower()
            if status in ("sent", "delivered", "read", "queued"):
                return True
            if status in ("notsent", "failed", "error"):
                return False
            return True  # сообщение найдено в исходящих — значит Green API его приняло
        return None  # не нашли — не можем ни подтвердить, ни опровергнуть
    except Exception as e:
        print(f"[worker_tick] verify error (не критично): {e}")
        return None


# ── БД helpers ───────────────────────────────────────────────────────────────

def get_token_for_instance(cur, user_id: int, platform: str, instance_id: str) -> str:
    cur.execute(f"""
        SELECT token FROM {SCHEMA}.wa_accounts
        WHERE user_id=%s AND platform=%s AND instance_id=%s LIMIT 1
    """, (user_id, platform, instance_id))
    row = cur.fetchone()
    if row and row[0]:
        return row[0].strip()
    col = "max_api_token" if platform == "max" else "green_api_token"
    inst_col = "max_api_instance_id" if platform == "max" else "green_api_instance_id"
    cur.execute(f"SELECT {col} FROM {SCHEMA}.users WHERE id=%s AND {inst_col}=%s", (user_id, instance_id))
    row = cur.fetchone()
    return row[0].strip() if row and row[0] else ""


def update_job_aggregates(cur, job_id: int):
    cur.execute(f"""
        UPDATE {SCHEMA}.broadcast_jobs SET
            sent_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='sent'),
            failed_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='failed'),
            ambiguous_count = (SELECT COUNT(*) FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status='ambiguous'),
            status = CASE
                WHEN EXISTS (SELECT 1 FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status IN ('pending','sending')) THEN 'running'
                WHEN cancel_requested THEN 'cancelled'
                ELSE 'completed'
            END,
            finished_at = CASE
                WHEN NOT EXISTS (SELECT 1 FROM {SCHEMA}.broadcast_job_items WHERE job_id=%s AND status IN ('pending','sending'))
                THEN NOW() ELSE finished_at END,
            updated_at = NOW()
        WHERE id=%s
    """, (job_id, job_id, job_id, job_id, job_id, job_id))


def journal_attempt(cur, item_id: int, attempt_no: int, http_status, error_type, error_text):
    cur.execute(f"""
        INSERT INTO {SCHEMA}.broadcast_job_attempts (item_id, attempt_no, http_status, error_type, error_text)
        VALUES (%s, %s, %s, %s, %s)
    """, (item_id, attempt_no, http_status, error_type, error_text))


# Не больше стольки зависших items разбираем за один тик — каждый требует сетевого
# запроса к Green API (verify_via_last_outgoing), поэтому разбор ограничен и по времени
# (time_left), и по количеству, чтобы не съесть весь 30-секундный бюджет cron-сервиса
# ещё до того, как воркер начнёт слать новые сообщения.
MAX_REAP_PER_TICK = 5


def reap_stuck_items(cur, db, time_left):
    """Находит зависшие 'sending' (worker упал во время обработки), пытается подтвердить
    результат через Green API. Если подтвердить нельзя — переводит в ambiguous без ретрая.

    Защита от двух worker'ов, разбирающих один и тот же зависший item одновременно:
    строки сначала атомарно "захватываются" (FOR UPDATE SKIP LOCKED + немедленное
    продление locked_at), и только затем — вне короткой транзакции — идёт медленный
    сетевой запрос к Green API для проверки. Если этот worker сам упадёт во время
    проверки — item просто станет зависшим заново и будет разобран следующим тиком.

    Ограничена по времени (time_left) и количеству (MAX_REAP_PER_TICK), чтобы не съесть
    весь бюджет тика на восстановление и оставить время для отправки новых сообщений."""
    cur.execute(f"""
        WITH stuck_candidates AS (
            SELECT bji.id FROM {SCHEMA}.broadcast_job_items bji
            JOIN {SCHEMA}.broadcast_jobs bj ON bj.id = bji.job_id
            WHERE bji.status = 'sending' AND bji.locked_at < NOW() - INTERVAL '{STUCK_SENDING_SECONDS} seconds'
            ORDER BY bji.id
            LIMIT {MAX_REAP_PER_TICK}
            FOR UPDATE OF bji SKIP LOCKED
        )
        UPDATE {SCHEMA}.broadcast_job_items
        SET locked_at = NOW()
        FROM stuck_candidates
        WHERE broadcast_job_items.id = stuck_candidates.id
        RETURNING broadcast_job_items.id, broadcast_job_items.job_id, broadcast_job_items.group_id,
                  broadcast_job_items.instance_id, broadcast_job_items.attempts, broadcast_job_items.max_attempts
    """)
    claimed_stuck = cur.fetchall()
    db.commit()

    stuck = []
    for item_id, job_id, group_id, instance_id, attempts, max_attempts in claimed_stuck:
        cur.execute(f"SELECT user_id, platform, text FROM {SCHEMA}.broadcast_jobs WHERE id=%s", (job_id,))
        jrow = cur.fetchone()
        if jrow:
            stuck.append((item_id, job_id, group_id, instance_id, attempts, max_attempts, jrow[0], jrow[1], jrow[2]))

    for item_id, job_id, group_id, instance_id, attempts, max_attempts, user_id, platform, text in stuck:
        if time_left() < API_GET_TIMEOUT_SECONDS + 1:
            break  # не начинаем новую сетевую проверку без запаса времени на неё
        token = get_token_for_instance(cur, user_id, platform, instance_id)
        confirmed = verify_via_last_outgoing(instance_id, token, group_id, text or "") if token else None
        if confirmed is True:
            cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='sent', sent_at=NOW(), finished_at=NOW(),
                             last_error=NULL, last_error_type=NULL WHERE id=%s""", (item_id,))
            journal_attempt(cur, item_id, attempts, None, "ok", "Подтверждено при восстановлении после сбоя worker")
        elif confirmed is False:
            if attempts < max_attempts:
                delay = BACKOFF_SECONDS.get(attempts, 90)
                cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='pending',
                                 next_attempt_at=NOW() + INTERVAL '{delay} seconds',
                                 last_error='Не отправлено (подтверждено после сбоя worker)', last_error_type='temporary'
                                 WHERE id=%s""", (item_id,))
            else:
                cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='failed', finished_at=NOW(),
                                 last_error='Не отправлено (подтверждено после сбоя worker)', last_error_type='permanent'
                                 WHERE id=%s""", (item_id,))
            journal_attempt(cur, item_id, attempts, None, "temporary", "Не найдено в исходящих после сбоя worker")
        else:
            cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='ambiguous', finished_at=NOW(),
                             last_error='Worker прервался во время отправки, результат не удалось подтвердить',
                             last_error_type='ambiguous' WHERE id=%s""", (item_id,))
            journal_attempt(cur, item_id, attempts, None, "ambiguous", "Не удалось подтвердить после сбоя worker")
        db.commit()
        update_job_aggregates(cur, job_id)
        db.commit()


def skip_cancelled_pending(cur, db):
    cur.execute(f"""
        UPDATE {SCHEMA}.broadcast_job_items bji
        SET status='skipped', finished_at=NOW()
        FROM {SCHEMA}.broadcast_jobs bj
        WHERE bji.job_id = bj.id AND bj.cancel_requested = true AND bji.status = 'pending'
    """)
    db.commit()


def acquire_instance_lock(cur, db, platform: str, instance_id: str) -> bool:
    cur.execute(f"""
        INSERT INTO {SCHEMA}.instance_locks (platform, instance_id, locked_at, heartbeat_at)
        VALUES (%s, %s, NOW(), NOW())
        ON CONFLICT (platform, instance_id) DO UPDATE SET locked_at = NOW(), heartbeat_at = NOW()
        WHERE {SCHEMA}.instance_locks.heartbeat_at IS NULL
           OR {SCHEMA}.instance_locks.heartbeat_at < NOW() - INTERVAL '{LOCK_STALE_SECONDS} seconds'
        RETURNING instance_id
    """, (platform, instance_id))
    row = cur.fetchone()
    db.commit()
    return row is not None


def release_instance_lock(cur, db, platform: str, instance_id: str):
    cur.execute(f"""
        UPDATE {SCHEMA}.instance_locks SET heartbeat_at = NULL WHERE platform=%s AND instance_id=%s
    """, (platform, instance_id))
    db.commit()


def claim_next_item(cur, db, platform: str, instance_id: str, run_id: str):
    cur.execute(f"""
        WITH next_item AS (
            SELECT bji.id FROM {SCHEMA}.broadcast_job_items bji
            JOIN {SCHEMA}.broadcast_jobs bj ON bj.id = bji.job_id
            WHERE bji.instance_id = %s AND bj.platform = %s AND bji.status = 'pending'
              AND (bji.next_attempt_at IS NULL OR bji.next_attempt_at <= NOW())
              AND bj.cancel_requested = false AND bj.status IN ('queued', 'running')
            ORDER BY bji.order_index ASC
            LIMIT 1
            FOR UPDATE OF bji SKIP LOCKED
        )
        UPDATE {SCHEMA}.broadcast_job_items
        SET status='sending', locked_at=NOW(), worker_run_id=%s, attempts = attempts + 1
        FROM next_item
        WHERE broadcast_job_items.id = next_item.id
        RETURNING broadcast_job_items.id, broadcast_job_items.job_id, broadcast_job_items.group_id,
                  broadcast_job_items.attempts, broadcast_job_items.max_attempts
    """, (instance_id, platform, run_id))
    row = cur.fetchone()
    db.commit()
    return row


def handler(event: dict, context) -> dict:
    """Фоновый обработчик очереди рассылок: забирает готовые к отправке группы из
    broadcast_job_items, шлёт сообщения через Green API, учитывает retry/ambiguous.
    Вызывается либо внешним cron-пингом, либо самим backend (broadcast) для ускорения старта.
    Защищён секретным заголовком X-Worker-Secret."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    headers = event.get("headers") or {}
    worker_secret = os.environ.get("WORKER_SECRET", "")
    if not worker_secret or headers.get("X-Worker-Secret", "") != worker_secret:
        return json_response({"error": "Forbidden"}, 403)

    start = time.time()
    run_id = getattr(context, "request_id", None) or uuid.uuid4().hex

    def time_left() -> float:
        return HARD_DEADLINE_SECONDS - (time.time() - start)

    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor()

    reap_stuck_items(cur, db, time_left)
    skip_cancelled_pending(cur, db)
    cur.execute(f"UPDATE {SCHEMA}.broadcast_jobs SET status='running', started_at=NOW(), updated_at=NOW() WHERE status='queued'")
    db.commit()

    cur.execute(f"""
        SELECT DISTINCT bji.instance_id, bj.platform
        FROM {SCHEMA}.broadcast_job_items bji
        JOIN {SCHEMA}.broadcast_jobs bj ON bj.id = bji.job_id
        WHERE bji.status = 'pending' AND bj.cancel_requested = false AND bj.status IN ('queued', 'running')
          AND (bji.next_attempt_at IS NULL OR bji.next_attempt_at <= NOW())
        LIMIT 15
    """)
    instance_platform_pairs = cur.fetchall()

    processed = 0
    touched_jobs = set()

    for instance_id, platform in instance_platform_pairs:
        # Новую пару instance/platform начинаем обрабатывать, только если оставшегося
        # времени точно хватит на худший случай хотя бы одного item.
        if time_left() < WORST_CASE_ITEM_SECONDS or processed >= MAX_ITEMS_PER_TICK:
            break
        if not acquire_instance_lock(cur, db, platform, instance_id):
            continue  # занят другим worker'ом прямо сейчас
        try:
            while time_left() >= WORST_CASE_ITEM_SECONDS and processed < MAX_ITEMS_PER_TICK:
                claimed = claim_next_item(cur, db, platform, instance_id, run_id)
                if not claimed:
                    break
                item_id, job_id, group_id, attempts, max_attempts = claimed
                touched_jobs.add(job_id)

                cur.execute(f"SELECT user_id, text, image_url, interval_seconds FROM {SCHEMA}.broadcast_jobs WHERE id=%s", (job_id,))
                jrow = cur.fetchone()
                user_id, text, image_url, interval_seconds = jrow

                token = get_token_for_instance(cur, user_id, platform, instance_id)
                if not token:
                    cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='failed', finished_at=NOW(),
                                     last_error='Токен инстанса не найден', last_error_type='permanent' WHERE id=%s""", (item_id,))
                    journal_attempt(cur, item_id, attempts, None, "permanent", "Токен инстанса не найден")
                    db.commit()
                    update_job_aggregates(cur, job_id)
                    db.commit()
                    processed += 1
                    continue

                try:
                    if image_url:
                        send_file(instance_id, token, group_id, text or "", image_url)
                    else:
                        send_message(instance_id, token, group_id, text or "")
                    cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='sent', sent_at=NOW(), finished_at=NOW(),
                                     last_error=NULL, last_error_type=NULL WHERE id=%s""", (item_id,))
                    journal_attempt(cur, item_id, attempts, 200, "ok", None)
                except Exception as exc:
                    error_type, http_status, error_text = classify_exception(exc)
                    if error_type == "ambiguous":
                        confirmed = verify_via_last_outgoing(instance_id, token, group_id, text or "")
                        if confirmed is True:
                            cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='sent', sent_at=NOW(), finished_at=NOW(),
                                             last_error=NULL, last_error_type=NULL WHERE id=%s""", (item_id,))
                            journal_attempt(cur, item_id, attempts, http_status, "ok", "Подтверждено проверкой после сетевой ошибки")
                        elif confirmed is False and attempts < max_attempts:
                            delay = BACKOFF_SECONDS.get(attempts, 90)
                            cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='pending',
                                             next_attempt_at=NOW() + INTERVAL '{delay} seconds',
                                             last_error=%s, last_error_type='temporary' WHERE id=%s""", (error_text, item_id))
                            journal_attempt(cur, item_id, attempts, http_status, "temporary", error_text)
                        else:
                            cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='ambiguous', finished_at=NOW(),
                                             last_error=%s, last_error_type='ambiguous' WHERE id=%s""", (error_text, item_id))
                            journal_attempt(cur, item_id, attempts, http_status, "ambiguous", error_text)
                    elif error_type == "temporary" and attempts < max_attempts:
                        delay = BACKOFF_SECONDS.get(attempts, 90)
                        cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='pending',
                                         next_attempt_at=NOW() + INTERVAL '{delay} seconds',
                                         last_error=%s, last_error_type='temporary' WHERE id=%s""", (error_text, item_id))
                        journal_attempt(cur, item_id, attempts, http_status, "temporary", error_text)
                    else:
                        cur.execute(f"""UPDATE {SCHEMA}.broadcast_job_items SET status='failed', finished_at=NOW(),
                                         last_error=%s, last_error_type=%s WHERE id=%s""", (error_text, error_type, item_id))
                        journal_attempt(cur, item_id, attempts, http_status, error_type, error_text)

                db.commit()
                update_job_aggregates(cur, job_id)
                db.commit()
                processed += 1

                pause = float(interval_seconds or 2.5)
                # Прежде чем ждать паузу между сообщениями и брать следующий item,
                # убеждаемся, что после паузы всё ещё останется время на его худший случай.
                if time_left() <= pause + WORST_CASE_ITEM_SECONDS:
                    break
                time.sleep(pause)
        finally:
            release_instance_lock(cur, db, platform, instance_id)

    for job_id in touched_jobs:
        update_job_aggregates(cur, job_id)
    db.commit()
    db.close()

    return json_response({"ok": True, "processed": processed, "elapsed": round(time.time() - start, 2)})