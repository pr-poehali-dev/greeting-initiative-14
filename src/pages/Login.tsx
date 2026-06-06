import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/cf07907b-f87d-40a4-a63c-82694338b69b";

interface LoginProps {
  onLogin: (sessionId: string, email: string, whapiToken: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      localStorage.setItem("session_id", data.session_id);
      localStorage.setItem("user_email", data.email);
      onLogin(data.session_id, data.email, data.whapi_token || "");
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Icon name="MessageCircle" size={20} className="text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">WA Рассылки</div>
            <div className="text-xs text-muted-foreground">Панель управления</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-foreground">
              {mode === "login" ? "Вход в систему" : "Регистрация"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "login" ? "Введите email и пароль" : "Создайте новый аккаунт"}
            </p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? "Загрузка..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>Нет аккаунта?{" "}
                <button onClick={() => { setMode("register"); setError(""); }} className="text-primary hover:underline">
                  Зарегистрироваться
                </button>
              </>
            ) : (
              <>Уже есть аккаунт?{" "}
                <button onClick={() => { setMode("login"); setError(""); }} className="text-primary hover:underline">
                  Войти
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
