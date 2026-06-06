import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const WHAPI_URL = "https://functions.poehali.dev/f6a3c6b6-03f7-4150-b586-7cf660c83ced";

type Tab = "dashboard" | "groups" | "contacts" | "broadcast" | "connect";
type WaStatus = "disconnected" | "loading" | "qr" | "connected";

interface WaGroup {
  id: string;
  name: string;
  members: number;
}

interface Group {
  id: number;
  name: string;
  members: number;
  active: boolean;
  tag: string;
  waId?: string;
}

const mockContacts = [
  { id: 1, name: "Алексей Петров", phone: "+7 916 123-45-67", group: "VIP покупатели", status: "active" },
  { id: 2, name: "Марина Соколова", phone: "+7 903 987-65-43", group: "Клиенты — Москва", status: "active" },
  { id: 3, name: "Дмитрий Волков", phone: "+7 921 555-11-22", group: "Партнёры 2024", status: "inactive" },
  { id: 4, name: "Елена Новикова", phone: "+7 905 444-77-88", group: "Оптовики СПб", status: "active" },
  { id: 5, name: "Иван Морозов", phone: "+7 926 333-99-00", group: "VIP покупатели", status: "active" },
];

const mockHistory = [
  { id: 1, title: "Акция на ноябрь", groups: 3, sent: 87, read: 54, date: "05.06.2026", status: "done" },
  { id: 2, title: "Обновление прайса", groups: 2, sent: 21, read: 17, date: "03.06.2026", status: "done" },
  { id: 3, title: "Приглашение на выставку", groups: 5, sent: 127, read: 0, date: "06.06.2026", status: "pending" },
];

const tagColors: Record<string, string> = {
  VIP: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Клиенты: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Партнёры: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  WhatsApp: "bg-primary/15 text-primary border-primary/30",
};

const Index = () => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [botActive, setBotActive] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [broadcastText, setBroadcastText] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTag, setNewGroupTag] = useState("Клиенты");

  // WhatsApp connection state
  const [waStatus, setWaStatus] = useState<WaStatus>("disconnected");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [importedGroups, setImportedGroups] = useState<WaGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedWaGroups, setSelectedWaGroups] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const navItems: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Дашборд", icon: "LayoutDashboard" },
    { id: "connect", label: "Подключение", icon: "Smartphone" },
    { id: "groups", label: "Группы", icon: "Users" },
    { id: "contacts", label: "Контакты", icon: "ContactRound" },
    { id: "broadcast", label: "Рассылка", icon: "Send" },
  ];

  const totalMembers = groups.filter((g) => g.active).reduce((s, g) => s + g.members, 0);

  // Polling for QR / connection status
  useEffect(() => {
    if (waStatus === "qr") {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${WHAPI_URL}?action=status`);
          const data = await res.json();
          const st = (data.raw?.status || data.status || "").toLowerCase();
          if (st === "authenticated" || st === "active" || st === "connected") {
            clearInterval(pollRef.current!);
            setWaStatus("connected");
            setBotActive(true);
            setQrImage(null);
            fetchWaGroups();
          }
        } catch (_e) { /* ignore poll error */ }
      }, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [waStatus]);

  async function requestQr() {
    setWaStatus("loading");
    setQrError(null);
    setQrImage(null);
    try {
      const res = await fetch(`${WHAPI_URL}?action=qr`);
      const data = await res.json();
      const qr = data.qr_code;
      if (qr) {
        setQrImage(qr.startsWith("data:") ? qr : `data:${data.mime_type || "image/png"};base64,${qr}`);
        setWaStatus("qr");
      } else {
        // May already be connected
        const st = (data.raw?.status || "").toLowerCase();
        if (st === "authenticated" || st === "active" || st === "connected") {
          setWaStatus("connected");
          setBotActive(true);
          fetchWaGroups();
        } else {
          setQrError("QR-код недоступен. Проверьте токен Whapi в настройках.");
          setWaStatus("disconnected");
        }
      }
    } catch {
      setQrError("Ошибка соединения с сервером. Попробуйте ещё раз.");
      setWaStatus("disconnected");
    }
  }

  async function fetchWaGroups() {
    setLoadingGroups(true);
    try {
      const res = await fetch(`${WHAPI_URL}?action=groups`);
      const data = await res.json();
      setImportedGroups(data.groups || []);
    } catch {
      setImportedGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }

  function importSelectedGroups() {
    const toAdd = importedGroups
      .filter((g) => selectedWaGroups.includes(g.id))
      .map((g) => ({
        id: Date.now() + Math.random(),
        name: g.name,
        members: g.members,
        active: true,
        tag: "WhatsApp",
        waId: g.id,
      }));
    setGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.waId).filter(Boolean));
      const fresh = toAdd.filter((g) => !existingIds.has(g.waId));
      return [...prev, ...fresh];
    });
    setSelectedWaGroups([]);
    setTab("groups");
  }

  function toggleWaGroup(id: string) {
    setSelectedWaGroups((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleGroupSelection(id: number) {
    setSelectedGroups((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  }

  function addGroup() {
    if (!newGroupName.trim()) return;
    setGroups((prev) => [...prev, { id: Date.now(), name: newGroupName.trim(), members: 0, active: true, tag: newGroupTag }]);
    setNewGroupName("");
    setShowAddGroup(false);
  }

  function deleteGroup(id: number) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "'Golos Text', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-60 min-h-screen flex flex-col border-r border-border" style={{ background: "hsl(220,18%,8%)" }}>
        <div className="px-6 py-5 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Icon name="MessageCircle" size={18} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">WA Рассылки</div>
            <div className="text-xs text-muted-foreground">Панель управления</div>
          </div>
        </div>

        <div className="mx-4 mt-4 rounded-lg border border-border px-4 py-3 flex items-center justify-between bg-card">
          <div>
            <div className="text-xs font-semibold text-foreground">Бот</div>
            <div className={`text-xs mt-0.5 ${botActive ? "text-primary" : "text-muted-foreground"}`}>
              {botActive ? "● Активен" : "● Выключен"}
            </div>
          </div>
          <Switch checked={botActive} onCheckedChange={setBotActive} />
        </div>

        <nav className="flex-1 px-3 mt-4 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150
                ${tab === item.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
              {item.id === "connect" && waStatus === "connected" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="text-xs text-muted-foreground">Версия 1.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen overflow-auto">
        <header className="h-14 border-b border-border flex items-center px-8 gap-4 bg-card/60 sticky top-0 z-10">
          <h1 className="text-base font-bold text-foreground">
            {navItems.find((n) => n.id === tab)?.label}
          </h1>
          <div className="ml-auto">
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border font-medium
              ${waStatus === "connected" ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${waStatus === "connected" ? "bg-primary" : "bg-muted-foreground"}`} />
              {waStatus === "connected" ? "WhatsApp подключён" : "WhatsApp не подключён"}
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 animate-fade-in">

          {/* ── CONNECT ── */}
          {tab === "connect" && (
            <div className="max-w-lg space-y-6">
              {/* Status card */}
              <div className={`rounded-xl border p-5 flex items-start gap-4 transition-all
                ${waStatus === "connected" ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                  ${waStatus === "connected" ? "bg-primary/20" : "bg-secondary"}`}>
                  <Icon name={waStatus === "connected" ? "CheckCircle" : "Smartphone"} size={20}
                    className={waStatus === "connected" ? "text-primary" : "text-muted-foreground"} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {waStatus === "connected" ? "WhatsApp успешно подключён" :
                     waStatus === "qr" ? "Отсканируйте QR-код" :
                     waStatus === "loading" ? "Загрузка..." :
                     "WhatsApp не подключён"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {waStatus === "connected" ? "Аккаунт авторизован, можно отправлять рассылки" :
                     waStatus === "qr" ? "Откройте WhatsApp → Связанные устройства → Привязать устройство" :
                     waStatus === "loading" ? "Запрашиваем QR-код у Whapi..." :
                     "Нажмите кнопку ниже, чтобы получить QR-код для авторизации"}
                  </div>
                </div>
              </div>

              {/* QR block */}
              {waStatus === "qr" && qrImage && (
                <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4 animate-fade-in">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">QR-код для входа</div>
                  <div className="rounded-xl overflow-hidden border-4 border-white shadow-lg">
                    <img src={qrImage} alt="WhatsApp QR" className="w-52 h-52 object-contain" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Ожидаем сканирования...
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={requestQr}>
                    <Icon name="RefreshCw" size={12} className="mr-1" />
                    Обновить QR
                  </Button>
                </div>
              )}

              {/* Error */}
              {qrError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-fade-in">
                  {qrError}
                </div>
              )}

              {/* Action buttons */}
              {waStatus === "disconnected" && (
                <Button onClick={requestQr} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11">
                  <Icon name="QrCode" size={16} />
                  Получить QR-код для входа
                </Button>
              )}

              {waStatus === "loading" && (
                <Button disabled className="w-full h-11 gap-2 opacity-60">
                  <Icon name="Loader" size={16} className="animate-spin" />
                  Загружаем QR-код...
                </Button>
              )}

              {/* Connected — groups import */}
              {waStatus === "connected" && (
                <div className="rounded-xl border border-border bg-card overflow-hidden animate-fade-in">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Группы вашего WhatsApp</span>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={fetchWaGroups}>
                      <Icon name="RefreshCw" size={12} />
                      Обновить
                    </Button>
                  </div>

                  {loadingGroups ? (
                    <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
                      <Icon name="Loader" size={16} className="animate-spin" />
                      Загружаем группы...
                    </div>
                  ) : importedGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                      <Icon name="Users" size={32} className="opacity-30" />
                      <span className="text-sm">Группы не найдены</span>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                        {importedGroups.map((g) => (
                          <label key={g.id} className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors
                            ${selectedWaGroups.includes(g.id) ? "bg-primary/5" : "hover:bg-secondary/40"}`}>
                            <input
                              type="checkbox"
                              checked={selectedWaGroups.includes(g.id)}
                              onChange={() => toggleWaGroup(g.id)}
                              className="w-4 h-4 accent-green-500"
                            />
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                              <Icon name="Users" size={13} className="text-muted-foreground" />
                            </div>
                            <span className="text-sm text-foreground font-medium flex-1 truncate">{g.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{g.members} уч.</span>
                          </label>
                        ))}
                      </div>
                      <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {selectedWaGroups.length > 0
                            ? `Выбрано: ${selectedWaGroups.length}`
                            : "Отметьте группы для добавления"}
                        </span>
                        <Button
                          size="sm"
                          disabled={selectedWaGroups.length === 0}
                          onClick={importSelectedGroups}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 disabled:opacity-40"
                        >
                          <Icon name="Download" size={13} />
                          Добавить в рассылки
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Disconnect */}
              {waStatus === "connected" && (
                <button
                  onClick={() => { setWaStatus("disconnected"); setBotActive(false); setImportedGroups([]); setQrImage(null); }}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                >
                  <Icon name="LogOut" size={12} />
                  Отключить WhatsApp
                </button>
              )}
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <div className="space-y-6">
              {waStatus !== "connected" && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon name="AlertTriangle" size={16} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-300">WhatsApp не подключён — рассылки недоступны</span>
                  </div>
                  <Button size="sm" onClick={() => setTab("connect")}
                    className="bg-amber-500 text-white hover:bg-amber-500/90 shrink-0 gap-1.5">
                    <Icon name="QrCode" size={13} />
                    Подключить
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Активных групп", value: groups.filter((g) => g.active).length, icon: "Users", color: "text-blue-400" },
                  { label: "Контактов в базе", value: totalMembers, icon: "ContactRound", color: "text-violet-400" },
                  { label: "Рассылок за месяц", value: 12, icon: "Send", color: "text-primary" },
                  { label: "Прочитано", value: "71%", icon: "CheckCheck", color: "text-amber-400" },
                ].map((stat, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                      <Icon name={stat.icon} size={15} className={stat.color} />
                    </div>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">История рассылок</span>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setTab("broadcast")}>
                    Все рассылки
                  </Button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Название", "Групп", "Отправлено", "Прочитано", "Дата", "Статус"].map((h) => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockHistory.map((item, i) => (
                      <tr key={item.id} className={`hover:bg-secondary/40 transition-colors ${i < mockHistory.length - 1 ? "border-b border-border/50" : ""}`}>
                        <td className="px-6 py-3.5 text-sm text-foreground font-medium">{item.title}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{item.groups}</td>
                        <td className="px-6 py-3.5 text-sm text-foreground">{item.sent}</td>
                        <td className="px-6 py-3.5 text-sm text-foreground">{item.read > 0 ? item.read : "—"}</td>
                        <td className="px-6 py-3.5 text-xs text-muted-foreground">{item.date}</td>
                        <td className="px-6 py-3.5">
                          <span className={`text-xs px-2 py-1 rounded-full border font-medium
                            ${item.status === "done" ? "bg-primary/10 text-primary border-primary/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}`}>
                            {item.status === "done" ? "Отправлено" : "Ожидание"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Новая рассылка", icon: "Send", desc: "Отправить сообщение группам", action: () => setTab("broadcast") },
                  { label: "Подключить WhatsApp", icon: "QrCode", desc: "Авторизоваться через QR-код", action: () => setTab("connect") },
                  { label: "Импорт контактов", icon: "Upload", desc: "Загрузить список из файла", action: () => {} },
                ].map((a, i) => (
                  <button key={i} onClick={a.action}
                    className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                      <Icon name={a.icon} size={15} className="text-primary" />
                    </div>
                    <div className="text-sm font-semibold text-foreground">{a.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── GROUPS ── */}
          {tab === "groups" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{groups.length} групп · {totalMembers} участников</p>
                <div className="flex gap-2">
                  {waStatus === "connected" && (
                    <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10" onClick={() => setTab("connect")}>
                      <Icon name="Download" size={13} />
                      Импорт из WhatsApp
                    </Button>
                  )}
                  <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowAddGroup((v) => !v)}>
                    <Icon name="Plus" size={14} />
                    Добавить
                  </Button>
                </div>
              </div>

              {showAddGroup && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 animate-fade-in space-y-3">
                  <div className="text-sm font-semibold text-foreground">Новая группа</div>
                  <div className="flex gap-3">
                    <Input placeholder="Название группы" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                      className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
                    <select value={newGroupTag} onChange={(e) => setNewGroupTag(e.target.value)}
                      className="bg-secondary border border-border text-foreground text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary">
                      <option>Клиенты</option>
                      <option>Партнёры</option>
                      <option>VIP</option>
                    </select>
                    <Button onClick={addGroup} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">Добавить</Button>
                    <Button variant="ghost" onClick={() => setShowAddGroup(false)} className="shrink-0 text-muted-foreground">Отмена</Button>
                  </div>
                </div>
              )}

              {groups.length === 0 ? (
                <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Icon name="Users" size={40} className="opacity-20" />
                  <p className="text-sm">Нет групп</p>
                  {waStatus !== "connected" && (
                    <Button size="sm" variant="outline" onClick={() => setTab("connect")} className="mt-2 gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                      <Icon name="QrCode" size={13} />
                      Подключить WhatsApp
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {["Группа", "Тег", "Участники", "Статус", ""].map((h) => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, i) => (
                        <tr key={g.id} className={`hover:bg-secondary/40 transition-colors ${i < groups.length - 1 ? "border-b border-border/50" : ""}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                                <Icon name="Users" size={13} className="text-muted-foreground" />
                              </div>
                              <span className="text-sm font-medium text-foreground">{g.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${tagColors[g.tag] || "bg-secondary text-foreground border-border"}`}>
                              {g.tag}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">{g.members}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-1 rounded-full border font-medium
                              ${g.active ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border"}`}>
                              {g.active ? "Активна" : "Неактивна"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => deleteGroup(g.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded">
                              <Icon name="Trash2" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── CONTACTS ── */}
          {tab === "contacts" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{mockContacts.length} контактов</p>
                <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Icon name="UserPlus" size={14} />
                  Добавить контакт
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Имя", "Телефон", "Группа", "Статус"].map((h) => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockContacts.map((c, i) => (
                      <tr key={c.id} className={`hover:bg-secondary/40 transition-colors ${i < mockContacts.length - 1 ? "border-b border-border/50" : ""}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground">
                              {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <span className="text-sm font-medium text-foreground">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{c.phone}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{c.group}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2 py-1 rounded-full border font-medium
                            ${c.status === "active" ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border"}`}>
                            {c.status === "active" ? "Активен" : "Неактивен"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── BROADCAST ── */}
          {tab === "broadcast" && (
            <div className="max-w-2xl space-y-6">
              {waStatus !== "connected" && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon name="AlertTriangle" size={16} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-300">Для отправки подключите WhatsApp</span>
                  </div>
                  <Button size="sm" onClick={() => setTab("connect")} className="bg-amber-500 text-white hover:bg-amber-500/90 shrink-0 gap-1.5">
                    <Icon name="QrCode" size={13} />
                    Подключить
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="text-sm font-semibold text-foreground">Текст сообщения</div>
                <Textarea placeholder="Введите текст рассылки..." value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)}
                  rows={5} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{broadcastText.length} символов</span>
                  {broadcastText.length > 0 && <span className="text-primary">Готово к отправке</span>}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="text-sm font-semibold text-foreground">Выберите группы получателей</div>
                {groups.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Нет групп. <button onClick={() => setTab("connect")} className="text-primary hover:underline">Подключите WhatsApp</button> и импортируйте группы.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groups.filter((g) => g.active).map((g) => (
                      <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-150
                        ${selectedGroups.includes(g.id) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/40"}`}>
                        <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroupSelection(g.id)} className="w-4 h-4 accent-green-500" />
                        <span className="text-sm text-foreground font-medium flex-1">{g.name}</span>
                        <span className="text-xs text-muted-foreground">{g.members} участников</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tagColors[g.tag] || ""}`}>{g.tag}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedGroups.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Выбрано групп: <span className="text-foreground font-semibold">{selectedGroups.length}</span> · Получателей:{" "}
                    <span className="text-foreground font-semibold">
                      {groups.filter((g) => selectedGroups.includes(g.id)).reduce((s, g) => s + g.members, 0)}
                    </span>
                  </div>
                )}
              </div>

              <Button
                disabled={!broadcastText.trim() || selectedGroups.length === 0 || waStatus !== "connected"}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11 text-sm font-semibold disabled:opacity-40"
              >
                <Icon name="Send" size={15} />
                Отправить рассылку
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;