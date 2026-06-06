import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AUTH_URL = "https://functions.poehali.dev/cf07907b-f87d-40a4-a63c-82694338b69b";

function AppRoutes() {
  const [sessionId, setSessionId] = useState<string>(() => localStorage.getItem("session_id") || "");
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem("user_email") || "");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const sid = localStorage.getItem("session_id");
    if (!sid) { setChecking(false); return; }
    fetch(AUTH_URL + "?action=me", { headers: { "X-Session-Id": sid } })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          localStorage.removeItem("session_id");
          localStorage.removeItem("user_email");
          setSessionId("");
        } else {
          setSessionId(sid);
          setUserEmail(data.email);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  function handleLogin(sid: string, email: string) {
    setSessionId(sid);
    setUserEmail(email);
  }

  function handleLogout() {
    const sid = localStorage.getItem("session_id");
    if (sid) fetch(AUTH_URL + "?action=logout", { headers: { "X-Session-Id": sid } }).catch(() => {});
    localStorage.removeItem("session_id");
    localStorage.removeItem("user_email");
    setSessionId("");
    setUserEmail("");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!sessionId) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <Index
            sessionId={sessionId}
            userEmail={userEmail}
            onLogout={handleLogout}
          />
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppRoutes />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
