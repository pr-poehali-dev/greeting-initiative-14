import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Tab = "dashboard" | "groups" | "contacts" | "broadcast";

const mockGroups = [
  { id: 1, name: "Клиенты — Москва", members: 48, active: true, tag: "Клиенты" },
  { id: 2, name: "Партнёры 2024", members: 12, active: true, tag: "Партнёры" },
  { id: 3, name: "VIP покупатели", members: 31, active: false, tag: "VIP" },
  { id: 4, name: "Оптовики СПб", members: 27, active: true, tag: "Клиенты" },
  { id: 5, name: "Поставщики", members: 9, active: true, tag: "Партнёры" },
];

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
};

const Index = () => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [botActive, setBotActive] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTag, setNewGroupTag] = useState("Клиенты");
  const [groups, setGroups] = useState(mockGroups);
  const [broadcastText, setBroadcastText] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);

  const navItems: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Дашборд", icon: "LayoutDashboard" },
    { id: "groups", label: "Группы", icon: "Users" },
    { id: "contacts", label: "Контакты", icon: "ContactRound" },
    { id: "broadcast", label: "Рассылка", icon: "Send" },
  ];

  const totalMembers = groups.filter((g) => g.active).reduce((s, g) => s + g.members, 0);

  function toggleGroupSelection(id: number) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  function addGroup() {
    if (!newGroupName.trim()) return;
    setGroups((prev) => [
      ...prev,
      { id: Date.now(), name: newGroupName.trim(), members: 0, active: true, tag: newGroupTag },
    ]);
    setNewGroupName("");
    setShowAddGroup(false);
  }

  function deleteGroup(id: number) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "'Golos Text', sans-serif" }}>
      {/* Sidebar */}
      <aside
        className="w-60 min-h-screen flex flex-col border-r border-border"
        style={{ background: "hsl(220,18%,8%)" }}
      >
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
                ${tab === item.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
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
            <div
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border font-medium
                ${botActive
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-border text-muted-foreground"
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${botActive ? "bg-primary" : "bg-muted-foreground"}`} />
              {botActive ? "Бот работает" : "Бот остановлен"}
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 animate-fade-in">
          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <div className="space-y-6">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7"
                    onClick={() => setTab("broadcast")}
                  >
                    Все рассылки
                  </Button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Название", "Групп", "Отправлено", "Прочитано", "Дата", "Статус"].map((h) => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockHistory.map((item, i) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-secondary/40 transition-colors ${i < mockHistory.length - 1 ? "border-b border-border/50" : ""}`}
                      >
                        <td className="px-6 py-3.5 text-sm text-foreground font-medium">{item.title}</td>
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{item.groups}</td>
                        <td className="px-6 py-3.5 text-sm text-foreground">{item.sent}</td>
                        <td className="px-6 py-3.5 text-sm text-foreground">{item.read > 0 ? item.read : "—"}</td>
                        <td className="px-6 py-3.5 text-xs text-muted-foreground">{item.date}</td>
                        <td className="px-6 py-3.5">
                          <span
                            className={`text-xs px-2 py-1 rounded-full border font-medium
                              ${item.status === "done"
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                          >
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
                  { label: "Добавить группу", icon: "Plus", desc: "Подключить WhatsApp-группу", action: () => { setTab("groups"); setShowAddGroup(true); } },
                  { label: "Импорт контактов", icon: "Upload", desc: "Загрузить список из файла", action: () => {} },
                ].map((a, i) => (
                  <button
                    key={i}
                    onClick={a.action}
                    className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
                  >
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
                <p className="text-sm text-muted-foreground">
                  {groups.length} групп · {totalMembers} участников
                </p>
                <Button
                  size="sm"
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setShowAddGroup((v) => !v)}
                >
                  <Icon name="Plus" size={14} />
                  Добавить группу
                </Button>
              </div>

              {showAddGroup && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 animate-fade-in space-y-3">
                  <div className="text-sm font-semibold text-foreground">Новая группа</div>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Название группы"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <select
                      value={newGroupTag}
                      onChange={(e) => setNewGroupTag(e.target.value)}
                      className="bg-secondary border border-border text-foreground text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option>Клиенты</option>
                      <option>Партнёры</option>
                      <option>VIP</option>
                    </select>
                    <Button onClick={addGroup} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
                      Добавить
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setShowAddGroup(false)}
                      className="shrink-0 text-muted-foreground"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Группа", "Тег", "Участники", "Статус", ""].map((h) => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => (
                      <tr
                        key={g.id}
                        className={`hover:bg-secondary/40 transition-colors ${i < groups.length - 1 ? "border-b border-border/50" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                              <Icon name="Users" size={13} className="text-muted-foreground" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{g.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium ${tagColors[g.tag] || "bg-secondary text-foreground border-border"}`}
                          >
                            {g.tag}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{g.members}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-xs px-2 py-1 rounded-full border font-medium
                              ${g.active
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-secondary text-muted-foreground border-border"
                              }`}
                          >
                            {g.active ? "Активна" : "Неактивна"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => deleteGroup(g.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                          >
                            <Icon name="Trash2" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium px-6 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockContacts.map((c, i) => (
                      <tr
                        key={c.id}
                        className={`hover:bg-secondary/40 transition-colors ${i < mockContacts.length - 1 ? "border-b border-border/50" : ""}`}
                      >
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
                          <span
                            className={`text-xs px-2 py-1 rounded-full border font-medium
                              ${c.status === "active"
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-secondary text-muted-foreground border-border"
                              }`}
                          >
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
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="text-sm font-semibold text-foreground">Текст сообщения</div>
                <Textarea
                  placeholder="Введите текст рассылки..."
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  rows={5}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{broadcastText.length} символов</span>
                  {broadcastText.length > 0 && <span className="text-primary">Готово к отправке</span>}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="text-sm font-semibold text-foreground">Выберите группы получателей</div>
                <div className="space-y-2">
                  {groups
                    .filter((g) => g.active)
                    .map((g) => (
                      <label
                        key={g.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-150
                          ${selectedGroups.includes(g.id)
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:bg-secondary/40"
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(g.id)}
                          onChange={() => toggleGroupSelection(g.id)}
                          className="w-4 h-4 accent-green-500"
                        />
                        <span className="text-sm text-foreground font-medium flex-1">{g.name}</span>
                        <span className="text-xs text-muted-foreground">{g.members} участников</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tagColors[g.tag] || ""}`}>
                          {g.tag}
                        </span>
                      </label>
                    ))}
                </div>
                {selectedGroups.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Выбрано групп:{" "}
                    <span className="text-foreground font-semibold">{selectedGroups.length}</span> · Получателей:{" "}
                    <span className="text-foreground font-semibold">
                      {groups.filter((g) => selectedGroups.includes(g.id)).reduce((s, g) => s + g.members, 0)}
                    </span>
                  </div>
                )}
              </div>

              <Button
                disabled={!broadcastText.trim() || selectedGroups.length === 0}
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
