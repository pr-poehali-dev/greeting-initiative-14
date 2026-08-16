import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/cf07907b-f87d-40a4-a63c-82694338b69b";

interface LoginProps {
  onLogin: (sessionId: string, email: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }
    if (mode === "register") {
      if (password.length < 6) {
        setError("Пароль должен быть не короче 6 символов");
        return;
      }
      if (password !== password2) {
        setError("Пароли не совпадают");
        return;
      }
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
      onLogin(data.session_id, data.email);
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setPassword("");
    setPassword2("");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Icon name="MessageCircle" size={20} className="text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Рассылка Про</div>
            <div className="text-xs text-muted-foreground">Панель управления</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-base font-semibold text-foreground">
              {mode === "login" ? "Вход в систему" : "Регистрация"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "login" ? "Введите логин и пароль" : "Создайте аккаунт по email и паролю"}
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
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
              </button>
            </div>
            {mode === "register" && (
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Повторите пароль"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            )}
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
              <>
                Нет аккаунта?{" "}
                <button onClick={() => switchMode("register")} className="text-primary hover:underline font-medium">
                  Зарегистрироваться
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{" "}
                <button onClick={() => switchMode("login")} className="text-primary hover:underline font-medium">
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