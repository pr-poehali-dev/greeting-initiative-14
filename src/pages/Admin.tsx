import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/cf07907b-f87d-40a4-a63c-82694338b69b";

function PasswordInput({ placeholder, value, onChange, onKeyDown }: {
  placeholder: string; value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} className="pr-10" />
      <button type="button" onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        <Icon name={show ? "EyeOff" : "Eye"} size={16} />
      </button>
    </div>
  );
}

interface User {
  id: number; email: string;
  instance_id: string; instance_token: string;
  max_instance_id: string; max_instance_token: string;
  telegram_bot_token: string;
}

export default function Admin() {
  const [adminSecret, setAdminSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [secretError, setSecretError] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [newInstanceId, setNewInstanceId] = useState("");
  const [newInstanceToken, setNewInstanceToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [resetingId, setResetingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [newPasswords, setNewPasswords] = useState<Record<number, string>>({});
  const [editInstances, setEditInstances] = useState<Record<number, {
    id: string; token: string;
    max_id: string; max_token: string;
    tg_token: string;
  }>>({});

  async function checkSecret() {
    if (!adminSecret.trim()) { setSecretError("Введите секретный ключ"); return; }
    setLoadingUsers(true); setSecretError("");
    const res = await fetch(`${AUTH_URL}?action=list_users`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: adminSecret }),
    });
    const data = await res.json();
    if (data.error) { setSecretError("Неверный ключ"); setLoadingUsers(false); return; }
    setUsers(data.users || []);
    const inst: Record<number, { id: string; token: string; max_id: string; max_token: string; tg_token: string }> = {};
    (data.users || []).forEach((u: User) => {
      inst[u.id] = { id: u.instance_id || "", token: u.instance_token || "", max_id: u.max_instance_id || "", max_token: u.max_instance_token || "", tg_token: u.telegram_bot_token || "" };
    });
    setEditInstances(inst);
    setAuthed(true); setLoadingUsers(false);
  }

  async function saveInstance(userId: number, email: string) {
    setSavingId(userId);
    const { id, token, max_id, max_token, tg_token } = editInstances[userId] || { id: "", token: "", max_id: "", max_token: "", tg_token: "" };
    const res = await fetch(`${AUTH_URL}?action=set_instance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, instance_id: id, instance_token: token, max_instance_id: max_id, max_instance_token: max_token, telegram_bot_token: tg_token, secret: adminSecret }),
    });
    const data = await res.json();
    if (data.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, instance_id: id, instance_token: token } : u));
      setResult({ ok: true, message: `Инстанс пользователя «${email}» сохранён` });
    }
    setSavingId(null);
  }

  async function resetPassword(userId: number, email: string) {
    const newPass = newPasswords[userId]?.trim();
    if (!newPass) return;
    if (!confirm(`Сбросить пароль пользователя «${email}»?`)) return;
    setResetingId(userId);
    const res = await fetch(`${AUTH_URL}?action=reset_password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, new_password: newPass, secret: adminSecret }),
    });
    const data = await res.json();
    if (data.ok) { setNewPasswords((prev) => ({ ...prev, [userId]: "" })); setResult({ ok: true, message: `Пароль «${email}» изменён` }); }
    setResetingId(null);
  }

  async function deleteUser(userId: number, email: string) {
    if (!confirm(`Удалить пользователя «${email}»?`)) return;
    setDeletingId(userId);
    const res = await fetch(`${AUTH_URL}?action=delete_user`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, secret: adminSecret }),
    });
    const data = await res.json();
    if (data.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
    setDeletingId(null);
  }

  async function createUser() {
    if (!login.trim() || !password.trim()) { setResult({ ok: false, message: "Заполните логин и пароль" }); return; }
    setLoading(true); setResult(null);
    const res = await fetch(`${AUTH_URL}?action=create_user`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: login.trim(), password, instance_id: newInstanceId.trim(), instance_token: newInstanceToken.trim(), secret: adminSecret }),
    });
    const data = await res.json();
    if (data.error) {
      setResult({ ok: false, message: data.error });
    } else {
      setResult({ ok: true, message: `Пользователь «${login}» создан` });
      const nu = { id: data.user_id, email: data.email, instance_id: newInstanceId.trim(), instance_token: newInstanceToken.trim() };
      setUsers((prev) => [...prev, nu]);
      setEditInstances((prev) => ({ ...prev, [data.user_id]: { id: newInstanceId.trim(), token: newInstanceToken.trim() } }));
      setLogin(""); setPassword(""); setNewInstanceId(""); setNewInstanceToken("");
    }
    setLoading(false);
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Icon name="ShieldCheck" size={20} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">Администратор</div>
              <div className="text-xs text-muted-foreground">Управление пользователями</div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">Введите секретный ключ администратора</p>
            <PasswordInput placeholder="Секретный ключ" value={adminSecret} onChange={setAdminSecret}
              onKeyDown={(e) => e.key === "Enter" && checkSecret()} />
            {secretError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{secretError}</div>}
            <Button className="w-full" onClick={checkSecret} disabled={loadingUsers}>
              {loadingUsers ? "Проверка..." : "Войти"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Icon name="ShieldCheck" size={18} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-foreground">Управление пользователями</div>
            <div className="text-xs text-muted-foreground">Создание аккаунтов и назначение Green API инстансов</div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-1">
          <div className="font-semibold">Где взять ID и токен инстанса?</div>
          <div>Зайди на <span className="font-mono">green-api.com</span> → Мои инстансы → выбери инстанс → скопируй <b>IdInstance</b> и <b>ApiTokenInstance</b></div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="text-sm font-semibold text-foreground">Новый пользователь</div>
          <div className="space-y-3">
            <Input placeholder="Логин" value={login} onChange={(e) => setLogin(e.target.value)} />
            <div className="flex gap-2">
              <div className="flex-1">
                <PasswordInput placeholder="Пароль" value={password} onChange={setPassword} onKeyDown={(e) => e.key === "Enter" && createUser()} />
              </div>
              <Button type="button" variant="outline" className="shrink-0 gap-1.5 text-xs" onClick={() => {
                const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
                setPassword(Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join(""));
              }}>
                <Icon name="Shuffle" size={13} />
                Сгенерировать
              </Button>
            </div>
            <Input placeholder="ID инстанса (напр. 1234567890)" value={newInstanceId}
              onChange={(e) => setNewInstanceId(e.target.value)} className="font-mono text-xs" />
            <Input placeholder="Токен инстанса (можно добавить позже)" value={newInstanceToken}
              onChange={(e) => setNewInstanceToken(e.target.value)} className="font-mono text-xs" />
          </div>
          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 border ${result.ok ? "text-primary bg-primary/10 border-primary/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
              {result.message}
            </div>
          )}
          <Button className="w-full gap-2" onClick={createUser} disabled={loading}>
            <Icon name="UserPlus" size={14} />
            {loading ? "Создаю..." : "Создать пользователя"}
          </Button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <div className="text-sm font-semibold text-foreground">Все пользователи ({users.length})</div>
          {users.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Нет пользователей</div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg bg-secondary/40 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Icon name="User" size={13} className="text-primary" />
                    </div>
                    <div className="text-sm text-foreground flex-1 font-medium">{u.email}</div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${u.instance_id && u.instance_token ? "bg-primary" : "bg-amber-500"}`}
                      title={u.instance_id ? "Инстанс назначен" : "Инстанс не назначен"} />
                    <button onClick={() => deleteUser(u.id, u.email)} disabled={deletingId === u.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40">
                      <Icon name="Trash2" size={13} />
                    </button>
                  </div>

                  <div className="px-3 pb-2 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">WhatsApp — Green API</div>
                    <Input placeholder="ID инстанса WhatsApp"
                      value={editInstances[u.id]?.id || ""}
                      onChange={(e) => setEditInstances((prev) => ({ ...prev, [u.id]: { ...prev[u.id], id: e.target.value } }))}
                      className="font-mono text-xs h-8" />
                    <Input placeholder="Токен инстанса WhatsApp"
                      value={editInstances[u.id]?.token || ""}
                      onChange={(e) => setEditInstances((prev) => ({ ...prev, [u.id]: { ...prev[u.id], token: e.target.value } }))}
                      className="font-mono text-xs h-8" />

                    <div className="text-xs font-medium text-muted-foreground pt-1">MAX — Green API</div>
                    <Input placeholder="ID инстанса MAX"
                      value={editInstances[u.id]?.max_id || ""}
                      onChange={(e) => setEditInstances((prev) => ({ ...prev, [u.id]: { ...prev[u.id], max_id: e.target.value } }))}
                      className="font-mono text-xs h-8" />
                    <Input placeholder="Токен инстанса MAX"
                      value={editInstances[u.id]?.max_token || ""}
                      onChange={(e) => setEditInstances((prev) => ({ ...prev, [u.id]: { ...prev[u.id], max_token: e.target.value } }))}
                      className="font-mono text-xs h-8" />

                    <div className="text-xs font-medium text-muted-foreground pt-1">Telegram Bot</div>
                    <div className="flex items-center gap-2">
                      <Input placeholder="Токен бота (от @BotFather)"
                        value={editInstances[u.id]?.tg_token || ""}
                        onChange={(e) => setEditInstances((prev) => ({ ...prev, [u.id]: { ...prev[u.id], tg_token: e.target.value } }))}
                        className="font-mono text-xs h-8" />
                      <button onClick={() => saveInstance(u.id, u.email)} disabled={savingId === u.id}
                        className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-40">
                        <Icon name={savingId === u.id ? "Loader" : "Save"} size={13} className={savingId === u.id ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </div>

                  <div className="px-3 pb-2.5">
                    <div className="text-xs text-muted-foreground mb-1">Новый пароль</div>
                    <div className="flex items-center gap-2">
                      <PasswordInput placeholder="Новый пароль"
                        value={newPasswords[u.id] || ""}
                        onChange={(v) => setNewPasswords((prev) => ({ ...prev, [u.id]: v }))}
                        onKeyDown={(e) => e.key === "Enter" && resetPassword(u.id, u.email)} />
                      <button onClick={() => resetPassword(u.id, u.email)}
                        disabled={!newPasswords[u.id]?.trim() || resetingId === u.id}
                        className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-40">
                        <Icon name="KeyRound" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}