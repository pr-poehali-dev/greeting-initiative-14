import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const GREENAPI_URL = "https://functions.poehali.dev/2be7b0f6-d7f9-474a-b21e-d4a74f848153";
const AUTH_URL = "https://functions.poehali.dev/cf07907b-f87d-40a4-a63c-82694338b69b";
const SEND_URL = "https://functions.poehali.dev/3c368aad-a7c2-4a91-9095-ac1a47fe77c9";
const TELEGRAM_URL = "https://functions.poehali.dev/97d4798c-1a93-44d3-9fdc-40acf141a66b";
const WHAPI_URL = "https://functions.poehali.dev/f6a3c6b6-03f7-4150-b586-7cf660c83ced";
const UPLOAD_URL = "https://functions.poehali.dev/168495aa-6a87-499f-8375-61b74d3dcef3";

type Tab = "dashboard" | "groups" | "contacts" | "broadcast" | "connect" | "help" | "users";
type WaStatus = "disconnected" | "loading" | "qr" | "connected";
type Platform = "whatsapp" | "max" | "telegram" | "whapi";

interface IndexProps {
  sessionId: string;
  userEmail: string;
  onLogout: () => void;
}

interface WaGroup {
  id: string;
  name: string;
  members: number;
}

interface WaAccount {
  id: number;
  name: string;
  instance_id: string;
  token: string;
  status: string;
}

interface Group {
  id: number;
  name: string;
  members: number;
  active: boolean;
  tag: string;
  waId?: string;
  instance_id?: string;
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

const Index = ({ sessionId, userEmail, onLogout }: IndexProps) => {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [platform, setPlatform] = useState<Platform>("whatsapp");
  const [botActive, setBotActive] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [broadcastText, setBroadcastText] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [broadcastImagePreview, setBroadcastImagePreview] = useState<string | null>(null);
  const [broadcastImageUrl, setBroadcastImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTag, setNewGroupTag] = useState("Клиенты");
  const [groupsLoadError, setGroupsLoadError] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // WhatsApp / MAX connection state
  const [waStatus, setWaStatus] = useState<WaStatus>("disconnected");
  const [maxStatus, setMaxStatus] = useState<WaStatus>("disconnected");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [importedGroups, setImportedGroups] = useState<WaGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedWaGroups, setSelectedWaGroups] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [adminSecretError, setAdminSecretError] = useState("");
  const [adminUsers, setAdminUsers] = useState<{id: number; email: string; instance_id?: string; instance_token?: string; max_instance_id?: string; max_instance_token?: string; telegram_bot_token?: string; whapi_token?: string}[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{text: string; ok: boolean} | null>(null);
  const [editApiUserId, setEditApiUserId] = useState<number | null>(null);
  const [editApiFields, setEditApiFields] = useState({ instance_id: "", instance_token: "", max_instance_id: "", max_instance_token: "", telegram_bot_token: "", whapi_token: "" });

  // Multi-account state
  const [waAccounts, setWaAccounts] = useState<WaAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccInstance, setNewAccInstance] = useState("");
  const [newAccToken, setNewAccToken] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [accountQrImage, setAccountQrImage] = useState<string | null>(null);
  const [accountQrError, setAccountQrError] = useState<string | null>(null);
  const [accountQrStatus, setAccountQrStatus] = useState<WaStatus>("disconnected");
  const accountPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accountQrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [includeMainAccount, setIncludeMainAccount] = useState(true);

  // Whapi state
  const [whapiStatus, setWhapiStatus] = useState<WaStatus>("disconnected");
  const [whapiQrImage, setWhapiQrImage] = useState<string | null>(null);
  const [whapiQrError, setWhapiQrError] = useState<string | null>(null);
  const [whapiGroups, setWhapiGroups] = useState<WaGroup[]>([]);
  const [whapiSelectedGroups, setWhapiSelectedGroups] = useState<string[]>([]);
  const [loadingWhapiGroups, setLoadingWhapiGroups] = useState(false);

  // Telegram state
  const [tgStatus, setTgStatus] = useState<"disconnected" | "connected" | "loading">("disconnected");
  const [tgBotName, setTgBotName] = useState<string>("");
  const [tgGroups, setTgGroups] = useState<WaGroup[]>([]);
  const [tgSelectedGroups, setTgSelectedGroups] = useState<string[]>([]);
  const [loadingTgGroups, setLoadingTgGroups] = useState(false);

  const navItems: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Дашборд", icon: "LayoutDashboard" },
    { id: "connect", label: "Подключение", icon: "Smartphone" },
    { id: "groups", label: "Группы", icon: "Users" },
    { id: "contacts", label: "Контакты", icon: "ContactRound" },
    { id: "broadcast", label: "Рассылка", icon: "Send" },
    { id: "help", label: "Инструкция", icon: "BookOpen" },
  ];

  const totalMembers = groups.filter((g) => g.active).reduce((s, g) => s + g.members, 0);

  const apiHeaders = { "X-Session-Id": sessionId };

  const qrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if ((tab === "connect" || tab === "broadcast") && (platform === "whatsapp" || platform === "max")) {
      fetchAccounts(platform);
    }
  }, [tab, platform]);

  // По умолчанию выбираем все подключённые аккаунты (доп. + основной)
  useEffect(() => {
    setSelectedAccountIds(waAccounts.filter((a) => a.status === "connected").map((a) => a.id));
    setIncludeMainAccount(true);
  }, [waAccounts, platform]);

  // Загружаем группы из БД при старте
  async function loadGroups() {
    setGroupsLoading(true);
    setGroupsLoadError(false);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=load_groups`, { headers: apiHeaders });
      const data = await res.json();
      if (data.groups) {
        setGroups(data.groups);
      }
    } catch {
      setGroupsLoadError(true);
    } finally {
      setGroupsLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, [sessionId]);

  // Polling для WA/MAX QR
  useEffect(() => {
    const activeStatus = platform === "max" ? maxStatus : waStatus;
    const setStatus = platform === "max" ? setMaxStatus : setWaStatus;
    if (activeStatus === "qr") {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${GREENAPI_URL}?action=status&platform=${platform}`, { headers: apiHeaders });
          const data = await res.json();
          if (data.connected || data.status === "authorized") {
            clearInterval(pollRef.current!);
            clearInterval(qrRefreshRef.current!);
            setStatus("connected");
            setBotActive(true);
            setQrImage(null);
            fetchWaGroups(platform);
          }
        } catch (_e) { /* ignore */ }
      }, 4000);

      qrRefreshRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${GREENAPI_URL}?action=qr&platform=${platform}`, { headers: apiHeaders });
          const data = await res.json();
          if (data.already_connected) {
            clearInterval(pollRef.current!);
            clearInterval(qrRefreshRef.current!);
            setStatus("connected");
            setBotActive(true);
            fetchWaGroups(platform);
          } else if (data.qr_code) {
            setQrImage(data.qr_code);
          }
        } catch (_e) { /* ignore */ }
      }, 15000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrRefreshRef.current) clearInterval(qrRefreshRef.current);
    };
  }, [waStatus, maxStatus, platform]);

  async function requestQr() {
    const setStatus = platform === "max" ? setMaxStatus : setWaStatus;
    setStatus("loading");
    setQrError(null);
    setQrImage(null);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=qr&platform=${platform}`, { headers: apiHeaders });
      const data = await res.json();
      if (data.error === "no_instance") {
        setQrError("Инстанс не назначен. Обратитесь к администратору.");
        setStatus("disconnected");
        return;
      }
      if (data.already_connected) {
        setStatus("connected");
        setBotActive(true);
        fetchWaGroups(platform);
        return;
      }
      if (data.qr_code) {
        setQrImage(data.qr_code);
        setStatus("qr");
      } else {
        setQrError(data.error || "Не удалось получить QR-код. Попробуйте ещё раз.");
        setStatus("disconnected");
      }
    } catch {
      setQrError("Ошибка соединения с сервером. Попробуйте ещё раз.");
      (platform === "max" ? setMaxStatus : setWaStatus)("disconnected");
    }
  }

  async function requestWhapiQr() {
    setWhapiStatus("loading");
    setWhapiQrError(null);
    setWhapiQrImage(null);
    try {
      const res = await fetch(`${WHAPI_URL}?action=qr`, { headers: apiHeaders });
      const data = await res.json();
      if (data.error) {
        setWhapiQrError(data.message || data.error);
        setWhapiStatus("disconnected");
        return;
      }
      if (data.already_connected) {
        setWhapiStatus("connected");
        fetchWhapiGroups();
        return;
      }
      if (data.qr_code) {
        setWhapiQrImage(data.qr_code);
        setWhapiStatus("qr");
      } else {
        setWhapiQrError("Не удалось получить QR-код. Проверьте токен Whapi.");
        setWhapiStatus("disconnected");
      }
    } catch {
      setWhapiQrError("Ошибка соединения с сервером.");
      setWhapiStatus("disconnected");
    }
  }

  async function fetchWhapiGroups() {
    setLoadingWhapiGroups(true);
    try {
      const res = await fetch(`${WHAPI_URL}?action=groups`, { headers: apiHeaders });
      const data = await res.json();
      setWhapiGroups(data.groups || []);
    } catch {
      setWhapiGroups([]);
    } finally {
      setLoadingWhapiGroups(false);
    }
  }

  async function saveGroupsToDB(allGroups: Group[]) {
    const byTagInstance = new Map<string, Group[]>();
    for (const g of allGroups) {
      const key = `${g.tag}||${(g as Group & {instance_id?: string}).instance_id || ""}`;
      if (!byTagInstance.has(key)) byTagInstance.set(key, []);
      byTagInstance.get(key)!.push(g);
    }
    for (const [key, grps] of byTagInstance.entries()) {
      const [tag, inst] = key.split("||");
      try {
        await fetch(`${GREENAPI_URL}?action=save_groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
          body: JSON.stringify({ groups: grps, tag, instance_id: inst }),
        });
      } catch { /* ignore */ }
    }
  }

  function importWhapiGroups() {
    const toAdd = whapiGroups
      .filter((g) => whapiSelectedGroups.includes(g.id))
      .map((g) => ({
        id: Date.now() + Math.random(),
        name: g.name,
        members: g.members || 0,
        active: true,
        tag: "Whapi",
        waId: g.id,
      }));
    setGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.waId).filter(Boolean));
      const fresh = toAdd.filter((g) => !existingIds.has(g.waId));
      const next = [...prev, ...fresh];
      saveGroupsToDB(next);
      return next;
    });
    setWhapiSelectedGroups([]);
    setTab("groups");
  }

  async function disconnectWa() {
    try {
      await fetch(`${GREENAPI_URL}?action=logout&platform=${platform}`, { headers: apiHeaders });
    } catch { /* ignore */ }
    if (platform === "max") setMaxStatus("disconnected");
    else setWaStatus("disconnected");
    setBotActive(false);
    setQrImage(null);
    setImportedGroups([]);
  }

  async function fetchAccounts(plat: Platform = "whatsapp") {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=list_accounts&platform=${plat}`, { headers: apiHeaders });
      const data = await res.json();
      setWaAccounts(data.accounts || []);
    } catch {
      setWaAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function addAccount() {
    if (!newAccInstance.trim() || !newAccToken.trim()) return;
    setAddingAccount(true);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=add_account&platform=${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
        body: JSON.stringify({ name: newAccName, instance_id: newAccInstance.trim(), token: newAccToken.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewAccName(""); setNewAccInstance(""); setNewAccToken("");
        setShowAddAccount(false);
        fetchAccounts(platform);
      }
    } catch { /* ignore */ }
    setAddingAccount(false);
  }

  async function removeAccount(accountId: number) {
    try {
      await fetch(`${GREENAPI_URL}?action=remove_account&platform=${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
        body: JSON.stringify({ account_id: accountId }),
      });
      if (activeAccountId === accountId) {
        setActiveAccountId(null);
        setAccountQrImage(null);
        setAccountQrStatus("disconnected");
      }
      fetchAccounts(platform);
    } catch { /* ignore */ }
  }

  async function requestAccountQr(accountId: number) {
    setActiveAccountId(accountId);
    setAccountQrStatus("loading");
    setAccountQrError(null);
    setAccountQrImage(null);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=qr_account&platform=${platform}&account_id=${accountId}`, { headers: apiHeaders });
      const data = await res.json();
      if (data.already_connected) {
        setAccountQrStatus("connected");
        fetchAccounts(platform);
        return;
      }
      if (data.qr_code) {
        setAccountQrImage(data.qr_code);
        setAccountQrStatus("qr");
        if (accountPollRef.current) clearInterval(accountPollRef.current);
        if (accountQrRefreshRef.current) clearInterval(accountQrRefreshRef.current);
        accountPollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`${GREENAPI_URL}?action=status_account&platform=${platform}&account_id=${accountId}`, { headers: apiHeaders });
            const d = await r.json();
            if (d.connected) {
              clearInterval(accountPollRef.current!);
              clearInterval(accountQrRefreshRef.current!);
              setAccountQrStatus("connected");
              setAccountQrImage(null);
              fetchAccounts(platform);
            }
          } catch { /* ignore */ }
        }, 4000);
        accountQrRefreshRef.current = setInterval(async () => {
          try {
            const r = await fetch(`${GREENAPI_URL}?action=qr_account&platform=${platform}&account_id=${accountId}`, { headers: apiHeaders });
            const d = await r.json();
            if (d.already_connected) {
              clearInterval(accountPollRef.current!);
              clearInterval(accountQrRefreshRef.current!);
              setAccountQrStatus("connected");
              fetchAccounts(platform);
            } else if (d.qr_code) setAccountQrImage(d.qr_code);
          } catch { /* ignore */ }
        }, 15000);
      } else {
        setAccountQrError(data.error || "Не удалось получить QR-код");
        setAccountQrStatus("disconnected");
      }
    } catch {
      setAccountQrError("Ошибка соединения");
      setAccountQrStatus("disconnected");
    }
  }

  async function fetchWaGroups(plat: Platform = "whatsapp") {
    setLoadingGroups(true);
    try {
      const res = await fetch(`${GREENAPI_URL}?action=groups&platform=${plat}`, { headers: apiHeaders });
      const data = await res.json();
      setImportedGroups(data.groups || []);
    } catch {
      setImportedGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }

  async function checkTgStatus() {
    setTgStatus("loading");
    try {
      const res = await fetch(`${TELEGRAM_URL}?action=status`, { headers: apiHeaders });
      const data = await res.json();
      if (data.connected) {
        setTgStatus("connected");
        setTgBotName(data.bot?.username || data.bot?.first_name || "Бот");
        fetchTgGroups();
      } else {
        setTgStatus("disconnected");
        if (data.error === "no_token") setQrError("Токен бота не назначен. Обратитесь к администратору.");
      }
    } catch {
      setTgStatus("disconnected");
    }
  }

  async function fetchTgGroups() {
    setLoadingTgGroups(true);
    try {
      const res = await fetch(`${TELEGRAM_URL}?action=groups`, { headers: apiHeaders });
      const data = await res.json();
      setTgGroups(data.groups || []);
    } catch {
      setTgGroups([]);
    } finally {
      setLoadingTgGroups(false);
    }
  }

  async function uploadBroadcastImage(file: File) {
    setUploadError(null);
    setUploadingImage(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setBroadcastImagePreview(base64);
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_data: base64, file_name: file.name, content_type: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (data.url) {
        setBroadcastImageUrl(data.url);
      } else {
        setUploadError(data.error || "Не удалось загрузить фото");
        setBroadcastImagePreview(null);
      }
    } catch {
      setUploadError("Ошибка загрузки фото");
      setBroadcastImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  }

  function removeBroadcastImage() {
    setBroadcastImagePreview(null);
    setBroadcastImageUrl(null);
    setUploadError(null);
  }

  async function sendBroadcast() {
    if (!broadcastText.trim() && !broadcastImageUrl) return;

    if (platform === "telegram") {
      if (tgSelectedGroups.length === 0) return;
      setSending(true); setSendResult(null);
      setSendProgress({ done: 0, total: tgSelectedGroups.length });
      const BATCH = 20;
      let totalSent = 0, totalFailed = 0;
      for (let i = 0; i < tgSelectedGroups.length; i += BATCH) {
        const batch = tgSelectedGroups.slice(i, i + BATCH);
        try {
          const res = await fetch(`${TELEGRAM_URL}?action=send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
            body: JSON.stringify({ text: broadcastText, chat_ids: batch, image_url: broadcastImageUrl || undefined }),
          });
          const data = await res.json();
          totalSent += data.sent ?? 0;
          totalFailed += data.failed ?? 0;
        } catch { totalFailed += batch.length; }
        setSendProgress({ done: Math.min(i + BATCH, tgSelectedGroups.length), total: tgSelectedGroups.length });
      }
      setSendResult({ sent: totalSent, failed: totalFailed, total: tgSelectedGroups.length });
      setSendProgress(null); setSending(false);
      removeBroadcastImage();
      return;
    }

    const platformTag = platform === "max" ? "MAX" : platform === "whapi" ? "Whapi" : "WhatsApp";
    const targetGroups = groups.filter((g) => selectedGroups.includes(g.id) && g.waId && g.tag === platformTag);
    if (targetGroups.length === 0) return;
    setSending(true);
    setSendResult(null);
    setSendProgress({ done: 0, total: targetGroups.length });

    const BATCH = 10;
    const allIds = targetGroups.map((g) => g.waId!);
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const batch = allIds.slice(i, i + BATCH);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch(`${SEND_URL}?platform=${platform}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
          body: JSON.stringify({
            text: broadcastText, group_ids: batch,
            multi_account: waAccounts.length > 0,
            account_ids: selectedAccountIds,
            use_main_account: includeMainAccount,
            image_url: broadcastImageUrl || undefined,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json();
        totalSent += data.sent ?? 0;
        totalFailed += data.failed ?? 0;
      } catch {
        totalFailed += batch.length;
      }
      setSendProgress({ done: Math.min(i + BATCH, allIds.length), total: allIds.length });
    }

    setSendResult({ sent: totalSent, failed: totalFailed, total: allIds.length });
    setSendProgress(null);
    setSending(false);
    removeBroadcastImage();
  }

  function importSelectedGroups(plat: Platform = "whatsapp") {
    const tag = plat === "max" ? "MAX" : "WhatsApp";
    const toAdd = importedGroups
      .filter((g) => selectedWaGroups.includes(g.id))
      .map((g) => ({
        id: Date.now() + Math.random(),
        name: g.name,
        members: g.members,
        active: true,
        tag,
        waId: g.id,
      }));
    setGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.waId).filter(Boolean));
      const fresh = toAdd.filter((g) => !existingIds.has(g.waId));
      const next = [...prev, ...fresh];
      saveGroupsToDB(next);
      return next;
    });
    setSelectedWaGroups([]);
    setTab("groups");
  }

  function importTgGroups() {
    const toAdd = tgGroups
      .filter((g) => tgSelectedGroups.includes(g.id))
      .map((g) => ({
        id: Date.now() + Math.random(),
        name: g.name,
        members: g.members,
        active: true,
        tag: "Telegram",
        waId: g.id,
      }));
    setGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.waId).filter(Boolean));
      const fresh = toAdd.filter((g) => !existingIds.has(g.waId));
      const next = [...prev, ...fresh];
      saveGroupsToDB(next);
      return next;
    });
    setTgSelectedGroups([]);
    setTab("groups");
  }

  function toggleAccountSelection(id: number) {
    setSelectedAccountIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
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
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGroupsToDB(next);
      return next;
    });
  }

  async function verifyAdminSecret() {
    setAdminActionLoading(true);
    setAdminSecretError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=list_users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecretInput }),
      });
      const data = await res.json();
      if (data.error) {
        setAdminSecretError("Неверный пароль");
      } else {
        setAdminSecret(adminSecretInput);
        setIsAdmin(true);
        setShowAdminPrompt(false);
        setAdminSecretInput("");
        setAdminUsers(data.users || []);
        setTab("users");
      }
    } catch {
      setAdminSecretError("Ошибка соединения");
    }
    setAdminActionLoading(false);
  }

  async function fetchAdminUsers() {
    setAdminLoading(true);
    try {
      const res = await fetch(`${AUTH_URL}?action=list_users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret }),
      });
      const data = await res.json();
      setAdminUsers(data.users || []);
    } catch { /* ignore */ }
    setAdminLoading(false);
  }

  async function createUser() {
    if (!newUserEmail.trim() || !newUserPassword.trim()) return;
    setAdminActionLoading(true);
    setAdminMsg(null);
    try {
      const res = await fetch(`${AUTH_URL}?action=create_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, email: newUserEmail.trim(), password: newUserPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminMsg({ text: `Пользователь ${newUserEmail} создан`, ok: true });
        setNewUserEmail(""); setNewUserPassword("");
        setShowCreateUser(false);
        fetchAdminUsers();
      } else {
        setAdminMsg({ text: data.error || "Ошибка", ok: false });
      }
    } catch {
      setAdminMsg({ text: "Ошибка соединения", ok: false });
    }
    setAdminActionLoading(false);
  }

  async function doResetPassword() {
    if (!resetUserId || !resetPassword.trim()) return;
    setAdminActionLoading(true);
    setAdminMsg(null);
    try {
      const res = await fetch(`${AUTH_URL}?action=reset_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, user_id: resetUserId, new_password: resetPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminMsg({ text: "Пароль успешно изменён", ok: true });
        setResetUserId(null); setResetPassword("");
      } else {
        setAdminMsg({ text: data.error || "Ошибка", ok: false });
      }
    } catch {
      setAdminMsg({ text: "Ошибка соединения", ok: false });
    }
    setAdminActionLoading(false);
  }

  async function deleteUser(userId: number, email: string) {
    if (!confirm(`Удалить пользователя ${email}?`)) return;
    setAdminActionLoading(true);
    setAdminMsg(null);
    try {
      const res = await fetch(`${AUTH_URL}?action=delete_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, user_id: userId }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminMsg({ text: `Пользователь удалён`, ok: true });
        fetchAdminUsers();
      } else {
        setAdminMsg({ text: data.error || "Ошибка", ok: false });
      }
    } catch {
      setAdminMsg({ text: "Ошибка соединения", ok: false });
    }
    setAdminActionLoading(false);
  }

  async function saveApiKeys(userId: number) {
    setAdminActionLoading(true);
    setAdminMsg(null);
    try {
      const res = await fetch(`${AUTH_URL}?action=set_instance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, user_id: userId, ...editApiFields }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminMsg({ text: "API-ключи сохранены", ok: true });
        setEditApiUserId(null);
        fetchAdminUsers();
      } else {
        setAdminMsg({ text: data.error || "Ошибка", ok: false });
      }
    } catch {
      setAdminMsg({ text: "Ошибка соединения", ok: false });
    }
    setAdminActionLoading(false);
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

        <div className="px-4 py-4 border-t border-border space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Icon name="User" size={12} className="text-primary" />
            </div>
            <div className="text-xs text-muted-foreground truncate flex-1">{userEmail}</div>
            {/* Скрытая кнопка администратора */}
            <button
              onClick={() => isAdmin ? setTab("users") : setShowAdminPrompt(true)}
              className={`p-1 rounded transition-colors ${isAdmin ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
              title="Управление пользователями"
            >
              <Icon name="Shield" size={14} />
            </button>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Icon name="LogOut" size={14} />
            Выйти
          </button>
        </div>

        {/* Модалка ввода Admin Secret */}
        {showAdminPrompt && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowAdminPrompt(false); setAdminSecretInput(""); setAdminSecretError(""); }}>
            <div className="bg-card border border-border rounded-2xl p-6 w-80 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Icon name="Shield" size={18} className="text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">Администратор</div>
                  <div className="text-xs text-muted-foreground">Введите секретный пароль</div>
                </div>
              </div>
              <Input
                type="password"
                placeholder="Секретный пароль"
                value={adminSecretInput}
                onChange={(e) => { setAdminSecretInput(e.target.value); setAdminSecretError(""); }}
                onKeyDown={(e) => e.key === "Enter" && verifyAdminSecret()}
                className="h-10"
                autoFocus
              />
              {adminSecretError && (
                <div className="text-xs text-destructive">{adminSecretError}</div>
              )}
              <div className="flex gap-2">
                <Button onClick={verifyAdminSecret} disabled={adminActionLoading || !adminSecretInput.trim()} className="flex-1 bg-amber-500 hover:bg-amber-500/90 text-white h-9 text-sm">
                  {adminActionLoading ? <Icon name="Loader" size={14} className="animate-spin" /> : "Войти"}
                </Button>
                <Button variant="ghost" onClick={() => { setShowAdminPrompt(false); setAdminSecretInput(""); setAdminSecretError(""); }} className="h-9 text-sm">
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

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

              {/* Переключатель платформ */}
              <div className="flex rounded-xl border border-border bg-card p-1 gap-1">
                {([["whatsapp", "WhatsApp", "MessageCircle"], ["max", "MAX", "Zap"], ["telegram", "Telegram", "Send"], ["whapi", "Whapi", "Wifi"]] as const).map(([id, label, icon]) => (
                  <button
                    key={id}
                    onClick={() => { setPlatform(id); setQrError(null); setQrImage(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${platform === id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon name={icon} size={15} />
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Несколько аккаунтов WhatsApp / MAX ── */}
              {(platform === "whatsapp" || platform === "max") && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="Smartphone" size={16} className="text-primary" />
                      <span className="text-sm font-semibold text-foreground">Аккаунты {platform === "max" ? "MAX" : "WhatsApp"}</span>
                      {waAccounts.length > 0 && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">{waAccounts.length}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      <Icon name="Plus" size={14} />Добавить
                    </button>
                  </div>

                  {loadingAccounts ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                      <Icon name="Loader" size={16} className="animate-spin" />Загрузка...
                    </div>
                  ) : waAccounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                      <Icon name="Smartphone" size={32} className="opacity-20" />
                      <span className="text-sm">Нет добавленных аккаунтов</span>
                      <button onClick={() => setShowAddAccount(true)} className="text-xs text-primary hover:underline mt-1">
                        + Добавить первый аккаунт
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {waAccounts.map((acc) => (
                        <div key={acc.id} className="px-5 py-3 flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.status === "connected" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{acc.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {acc.status === "connected" ? "Подключён" : "Отключён"} · ID: ••••••••••••
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {acc.status !== "connected" && (
                              <button
                                onClick={() => requestAccountQr(acc.id)}
                                className="text-xs text-primary hover:text-primary/80 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors font-medium"
                              >
                                Подключить
                              </button>
                            )}
                            <button
                              onClick={() => removeAccount(acc.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Icon name="Trash2" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Форма добавления аккаунта */}
                  {showAddAccount && (
                    <div className="border-t border-border px-5 py-4 bg-secondary/30 space-y-3 animate-fade-in">
                      <div className="text-sm font-semibold text-foreground">Новый аккаунт</div>
                      <Input
                        placeholder="Название (например: Основной)"
                        value={newAccName}
                        onChange={(e) => setNewAccName(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <Input
                        placeholder="Идентификатор инстанса"
                        value={newAccInstance}
                        onChange={(e) => setNewAccInstance(e.target.value)}
                        className="h-9 text-sm font-mono"
                      />
                      <Input
                        placeholder="Токен доступа"
                        type="password"
                        value={newAccToken}
                        onChange={(e) => setNewAccToken(e.target.value)}
                        className="h-9 text-sm font-mono"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={addAccount}
                          disabled={addingAccount || !newAccInstance.trim() || !newAccToken.trim()}
                          className="flex-1 h-9 text-sm bg-primary text-primary-foreground"
                        >
                          {addingAccount ? <><Icon name="Loader" size={14} className="animate-spin mr-1" />Добавляем...</> : "Добавить"}
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowAddAccount(false); setNewAccName(""); setNewAccInstance(""); setNewAccToken(""); }} className="h-9 text-sm">
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* QR для конкретного аккаунта */}
                  {activeAccountId !== null && accountQrStatus !== "disconnected" && (
                    <div className="border-t border-border px-5 py-4 space-y-3 animate-fade-in">
                      {accountQrStatus === "loading" && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon name="Loader" size={14} className="animate-spin" />Загружаем QR-код...
                        </div>
                      )}
                      {accountQrStatus === "qr" && accountQrImage && (
                        <div className="flex flex-col items-center gap-3">
                          <div className="text-xs text-muted-foreground font-medium">Отсканируйте QR-код</div>
                          <div className="rounded-xl overflow-hidden border-4 border-white shadow-lg">
                            <img src={accountQrImage} alt="QR" className="w-44 h-44 object-contain" />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Ожидаем сканирования...
                          </div>
                        </div>
                      )}
                      {accountQrStatus === "connected" && (
                        <div className="flex items-center gap-2 text-sm text-primary font-medium">
                          <Icon name="CheckCircle" size={16} />Аккаунт успешно подключён!
                        </div>
                      )}
                      {accountQrError && (
                        <div className="text-sm text-destructive">{accountQrError}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* WhatsApp / MAX — QR подключение (legacy основной аккаунт) */}
              {(platform === "whatsapp" || platform === "max") && (() => {
                const st = platform === "max" ? maxStatus : waStatus;
                const platformLabel = platform === "max" ? "MAX" : "WhatsApp";
                return (
                  <>
                    <div className={`rounded-xl border p-5 flex items-start gap-4 transition-all
                      ${st === "connected" ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                        ${st === "connected" ? "bg-primary/20" : "bg-secondary"}`}>
                        <Icon name={st === "connected" ? "CheckCircle" : "Smartphone"} size={20}
                          className={st === "connected" ? "text-primary" : "text-muted-foreground"} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {st === "connected" ? `${platformLabel} успешно подключён` :
                           st === "qr" ? "Отсканируйте QR-код" :
                           st === "loading" ? "Загрузка..." :
                           `${platformLabel} не подключён`}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {st === "connected" ? "Аккаунт авторизован, можно отправлять рассылки" :
                           st === "qr" ? `Откройте ${platformLabel} → Связанные устройства → Привязать устройство` :
                           st === "loading" ? "Запрашиваем QR-код..." :
                           "Нажмите кнопку ниже, чтобы получить QR-код для авторизации"}
                        </div>
                      </div>
                    </div>

                    {st === "qr" && qrImage && (
                      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4 animate-fade-in">
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">QR-код для входа</div>
                        <div className="rounded-xl overflow-hidden border-4 border-white shadow-lg">
                          <img src={qrImage} alt="QR" className="w-52 h-52 object-contain" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Ожидаем сканирования...
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={requestQr}>
                          <Icon name="RefreshCw" size={12} className="mr-1" />Обновить QR
                        </Button>
                      </div>
                    )}

                    {qrError && (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-fade-in">
                        {qrError}
                      </div>
                    )}

                    {st === "disconnected" && (
                      <Button onClick={requestQr} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11">
                        <Icon name="QrCode" size={16} />Получить QR-код для входа
                      </Button>
                    )}
                    {st === "loading" && (
                      <Button disabled className="w-full h-11 gap-2 opacity-60">
                        <Icon name="Loader" size={16} className="animate-spin" />Загружаем QR-код...
                      </Button>
                    )}
                    {st === "connected" && (
                      <Button variant="outline" onClick={disconnectWa} className="w-full h-11 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
                        <Icon name="RefreshCw" size={16} />Сменить аккаунт {platformLabel}
                      </Button>
                    )}

                    {st === "connected" && (
                      <div className="rounded-xl border border-border bg-card overflow-hidden animate-fade-in">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">Группы вашего {platformLabel}</span>
                          <div className="flex items-center gap-2">
                            {importedGroups.length > 0 && (
                              <button
                                onClick={() => selectedWaGroups.length === importedGroups.length ? setSelectedWaGroups([]) : setSelectedWaGroups(importedGroups.map((g) => g.id))}
                                className="text-xs text-primary hover:underline"
                              >
                                {selectedWaGroups.length === importedGroups.length ? "Снять всё" : "Отметить всё"}
                              </button>
                            )}
                            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={() => fetchWaGroups(platform)}>
                              <Icon name="RefreshCw" size={12} />Обновить
                            </Button>
                          </div>
                        </div>
                        {loadingGroups ? (
                          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
                            <Icon name="Loader" size={16} className="animate-spin" />Загружаем группы...
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
                                <label key={g.id} className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors ${selectedWaGroups.includes(g.id) ? "bg-primary/5" : "hover:bg-secondary/40"}`}>
                                  <input type="checkbox" checked={selectedWaGroups.includes(g.id)} onChange={() => toggleWaGroup(g.id)} className="w-4 h-4 accent-green-500" />
                                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                    <Icon name="Users" size={13} className="text-muted-foreground" />
                                  </div>
                                  <span className={`text-sm font-medium flex-1 truncate ${g.name ? "text-foreground" : "text-muted-foreground italic"}`}>{g.name || "Без названия"}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{g.members ? `${g.members} уч.` : ""}</span>
                                </label>
                              ))}
                            </div>
                            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{selectedWaGroups.length > 0 ? `Выбрано: ${selectedWaGroups.length}` : "Отметьте группы для добавления"}</span>
                              <Button size="sm" disabled={selectedWaGroups.length === 0} onClick={() => importSelectedGroups(platform)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 disabled:opacity-40">
                                <Icon name="Download" size={13} />Добавить в рассылки
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Whapi */}
              {platform === "whapi" && (
                <>
                  <div className={`rounded-xl border p-5 flex items-start gap-4 transition-all ${whapiStatus === "connected" ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${whapiStatus === "connected" ? "bg-primary/20" : "bg-secondary"}`}>
                      <Icon name={whapiStatus === "connected" ? "CheckCircle" : "Wifi"} size={20} className={whapiStatus === "connected" ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {whapiStatus === "connected" ? "Whapi подключён" : whapiStatus === "loading" ? "Подключаемся..." : "Whapi не подключён"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {whapiStatus === "connected" ? "Аккаунт активен, можно делать рассылки" : "Отсканируйте QR-код в WhatsApp"}
                      </div>
                    </div>
                    {whapiStatus === "connected" && (
                      <button onClick={() => { setWhapiStatus("disconnected"); setWhapiQrImage(null); setWhapiGroups([]); }} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Отключить
                      </button>
                    )}
                  </div>

                  {whapiQrError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{whapiQrError}</div>
                  )}

                  {whapiStatus === "qr" && whapiQrImage && (
                    <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4 animate-fade-in">
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">QR-код для входа</div>
                      <div className="rounded-xl overflow-hidden border-4 border-white shadow-lg">
                        <img src={whapiQrImage} alt="QR" className="w-52 h-52 object-contain" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Ожидаем сканирования...
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={requestWhapiQr}>
                        <Icon name="RefreshCw" size={12} className="mr-1" />Обновить QR
                      </Button>
                    </div>
                  )}

                  {whapiStatus === "disconnected" && (
                    <Button onClick={requestWhapiQr} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11">
                      <Icon name="QrCode" size={16} />Получить QR-код для входа
                    </Button>
                  )}
                  {whapiStatus === "loading" && (
                    <Button disabled className="w-full h-11 gap-2 opacity-60">
                      <Icon name="Loader" size={16} className="animate-spin" />Подключаемся...
                    </Button>
                  )}

                  {whapiStatus === "connected" && (
                    <div className="rounded-xl border border-border bg-card overflow-hidden animate-fade-in">
                      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Группы Whapi</span>
                        <div className="flex items-center gap-2">
                          {whapiGroups.length > 0 && (
                            <button onClick={() => whapiSelectedGroups.length === whapiGroups.length ? setWhapiSelectedGroups([]) : setWhapiSelectedGroups(whapiGroups.map((g) => g.id))} className="text-xs text-primary hover:underline">
                              {whapiSelectedGroups.length === whapiGroups.length ? "Снять всё" : "Отметить всё"}
                            </button>
                          )}
                          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={fetchWhapiGroups}>
                            <Icon name="RefreshCw" size={12} />Обновить
                          </Button>
                        </div>
                      </div>
                      {loadingWhapiGroups ? (
                        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
                          <Icon name="Loader" size={16} className="animate-spin" />Загружаем группы...
                        </div>
                      ) : whapiGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                          <Icon name="Users" size={32} className="opacity-30" />
                          <span className="text-sm">Нет доступных групп</span>
                        </div>
                      ) : (
                        <>
                          <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                            {whapiGroups.map((g) => (
                              <label key={g.id} className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors ${whapiSelectedGroups.includes(g.id) ? "bg-primary/5" : "hover:bg-secondary/40"}`}>
                                <input type="checkbox" checked={whapiSelectedGroups.includes(g.id)} onChange={() => setWhapiSelectedGroups((prev) => prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id])} className="w-4 h-4 accent-blue-500" />
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                  <Icon name="Wifi" size={13} className="text-muted-foreground" />
                                </div>
                                <span className="text-sm text-foreground font-medium flex-1 truncate">{g.name}</span>
                                {g.members ? <span className="text-xs text-muted-foreground">{g.members}</span> : null}
                              </label>
                            ))}
                          </div>
                          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{whapiSelectedGroups.length > 0 ? `Выбрано: ${whapiSelectedGroups.length}` : "Отметьте группы"}</span>
                            <Button size="sm" disabled={whapiSelectedGroups.length === 0} onClick={importWhapiGroups} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 disabled:opacity-40">
                              <Icon name="Download" size={13} />Добавить в рассылки
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Telegram */}
              {platform === "telegram" && (
                <>
                  <div className={`rounded-xl border p-5 flex items-start gap-4 transition-all ${tgStatus === "connected" ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tgStatus === "connected" ? "bg-primary/20" : "bg-secondary"}`}>
                      <Icon name={tgStatus === "connected" ? "CheckCircle" : "Send"} size={20} className={tgStatus === "connected" ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {tgStatus === "connected" ? `Бот @${tgBotName} подключён` : tgStatus === "loading" ? "Проверяем бота..." : "Telegram не подключён"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {tgStatus === "connected" ? "Бот активен, можно отправлять рассылки в группы" : "Администратор должен назначить токен Telegram-бота"}
                      </div>
                    </div>
                  </div>

                  {tgStatus === "disconnected" && (
                    <Button onClick={checkTgStatus} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11">
                      <Icon name="Send" size={16} />Проверить подключение бота
                    </Button>
                  )}
                  {tgStatus === "loading" && (
                    <Button disabled className="w-full h-11 gap-2 opacity-60">
                      <Icon name="Loader" size={16} className="animate-spin" />Подключаемся...
                    </Button>
                  )}

                  {tgStatus === "connected" && (
                    <div className="rounded-xl border border-border bg-card overflow-hidden animate-fade-in">
                      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Группы бота</span>
                        <div className="flex items-center gap-2">
                          {tgGroups.length > 0 && (
                            <button
                              onClick={() => tgSelectedGroups.length === tgGroups.length ? setTgSelectedGroups([]) : setTgSelectedGroups(tgGroups.map((g) => g.id))}
                              className="text-xs text-primary hover:underline"
                            >
                              {tgSelectedGroups.length === tgGroups.length ? "Снять всё" : "Отметить всё"}
                            </button>
                          )}
                          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={fetchTgGroups}>
                            <Icon name="RefreshCw" size={12} />Обновить
                          </Button>
                        </div>
                      </div>
                      {loadingTgGroups ? (
                        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground text-sm">
                          <Icon name="Loader" size={16} className="animate-spin" />Загружаем группы...
                        </div>
                      ) : tgGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                          <Icon name="Users" size={32} className="opacity-30" />
                          <span className="text-sm">Добавьте бота в группы в Telegram</span>
                        </div>
                      ) : (
                        <>
                          <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                            {tgGroups.map((g) => (
                              <label key={g.id} className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors ${tgSelectedGroups.includes(g.id) ? "bg-primary/5" : "hover:bg-secondary/40"}`}>
                                <input type="checkbox" checked={tgSelectedGroups.includes(g.id)} onChange={() => setTgSelectedGroups((prev) => prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id])} className="w-4 h-4 accent-blue-500" />
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                  <Icon name="Send" size={13} className="text-muted-foreground" />
                                </div>
                                <span className="text-sm text-foreground font-medium flex-1 truncate">{g.name}</span>
                              </label>
                            ))}
                          </div>
                          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{tgSelectedGroups.length > 0 ? `Выбрано: ${tgSelectedGroups.length}` : "Отметьте группы"}</span>
                            <Button size="sm" disabled={tgSelectedGroups.length === 0} onClick={importTgGroups} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 disabled:opacity-40">
                              <Icon name="Download" size={13} />Добавить в рассылки
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
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
                  {groups.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => {
                      if (confirm("Удалить все группы из списка?")) {
                        setGroups([]);
                        saveGroupsToDB([]);
                      }
                    }}>
                      <Icon name="Trash2" size={13} />
                      Очистить всё
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

              {groupsLoading ? (
                <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Icon name="Loader" size={32} className="animate-spin opacity-40" />
                  <p className="text-sm">Загружаем группы...</p>
                </div>
              ) : groupsLoadError ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col items-center justify-center py-20 gap-3">
                  <Icon name="WifiOff" size={40} className="text-amber-400 opacity-60" />
                  <p className="text-sm text-amber-300">Не удалось загрузить группы — проблема с соединением</p>
                  <Button size="sm" variant="outline" onClick={loadGroups} className="mt-2 gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                    <Icon name="RefreshCw" size={13} />
                    Повторить
                  </Button>
                </div>
              ) : groups.length === 0 ? (
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
                      {groups.filter((g) => g.active).map((g, i, arr) => (
                        <tr key={g.id} className={`hover:bg-secondary/40 transition-colors ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}>
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

              {/* Переключатель платформ */}
              <div className="flex rounded-xl border border-border bg-card p-1 gap-1">
                {([["whatsapp", "WhatsApp", "MessageCircle"], ["max", "MAX", "Zap"], ["telegram", "Telegram", "Send"], ["whapi", "Whapi", "Wifi"]] as const).map(([id, label, icon]) => (
                  <button key={id} onClick={() => { setPlatform(id); setSendResult(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${platform === id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon name={icon} size={15} />{label}
                  </button>
                ))}
              </div>

              {/* Выбор аккаунтов для рассылки */}
              {(platform === "whatsapp" || platform === "max") && waAccounts.length > 0 && (() => {
                const mainConnected = (platform === "max" ? maxStatus : waStatus) === "connected";
                const totalSelected = (mainConnected && includeMainAccount ? 1 : 0) + selectedAccountIds.length;
                return (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                      <Icon name="Layers" size={16} className="text-primary flex-shrink-0" />
                      <span className="text-sm text-foreground">
                        Отправка с <span className="text-primary font-semibold">{totalSelected}</span> {totalSelected === 1 ? "аккаунта" : "аккаунтов"} — группы распределятся между выбранными
                      </span>
                      <button onClick={() => setTab("connect")} className="ml-auto text-xs text-primary hover:underline flex-shrink-0">
                        Управлять
                      </button>
                    </div>
                    <div className="divide-y divide-border/50">
                      {mainConnected && (
                        <label className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-secondary/40 transition-colors">
                          <input type="checkbox" checked={includeMainAccount} onChange={() => setIncludeMainAccount((v) => !v)} className="w-4 h-4 accent-green-500" />
                          <span className="text-sm text-foreground flex-1">Основной аккаунт</span>
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        </label>
                      )}
                      {waAccounts.map((acc) => (
                        <label key={acc.id} className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${acc.status === "connected" ? "cursor-pointer hover:bg-secondary/40" : "opacity-40 cursor-not-allowed"}`}>
                          <input type="checkbox" checked={selectedAccountIds.includes(acc.id)} disabled={acc.status !== "connected"}
                            onChange={() => toggleAccountSelection(acc.id)} className="w-4 h-4 accent-green-500" />
                          <span className="text-sm text-foreground flex-1 truncate">{acc.name}</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.status === "connected" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Предупреждение если не подключено */}
              {platform === "whatsapp" && waStatus !== "connected" && waAccounts.length === 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon name="AlertTriangle" size={16} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-300">Для отправки подключите WhatsApp</span>
                  </div>
                  <Button size="sm" onClick={() => { setTab("connect"); setPlatform("whatsapp"); }} className="bg-amber-500 text-white hover:bg-amber-500/90 shrink-0 gap-1.5">
                    <Icon name="QrCode" size={13} />Подключить
                  </Button>
                </div>
              )}
              {platform === "max" && maxStatus !== "connected" && waAccounts.length === 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon name="AlertTriangle" size={16} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-300">Для отправки подключите MAX</span>
                  </div>
                  <Button size="sm" onClick={() => { setTab("connect"); setPlatform("max"); }} className="bg-amber-500 text-white hover:bg-amber-500/90 shrink-0 gap-1.5">
                    <Icon name="Zap" size={13} />Подключить
                  </Button>
                </div>
              )}
              {platform === "telegram" && tgStatus !== "connected" && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon name="AlertTriangle" size={16} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-amber-300">Для отправки подключите Telegram-бота</span>
                  </div>
                  <Button size="sm" onClick={() => { setTab("connect"); setPlatform("telegram"); }} className="bg-amber-500 text-white hover:bg-amber-500/90 shrink-0 gap-1.5">
                    <Icon name="Send" size={13} />Подключить
                  </Button>
                </div>
              )}

              <div className="flex gap-4 items-start">
                <div className="rounded-xl border border-border bg-card p-6 space-y-3 flex-1">
                  <div className="text-sm font-semibold text-foreground">Текст сообщения</div>
                  <Textarea placeholder="Введите текст рассылки..." value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)}
                    rows={5} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{broadcastText.length} символов</span>
                    {broadcastText.length > 0 && <span className="text-primary">Готово к отправке</span>}
                  </div>

                  {/* Фото к рассылке */}
                  <div className="pt-2 border-t border-border/60">
                    <div className="text-sm font-semibold text-foreground mb-2">Фото (необязательно)</div>
                    {broadcastImagePreview ? (
                      <div className="relative inline-block">
                        <img src={broadcastImagePreview} alt="Превью" className="max-h-40 rounded-lg border border-border object-cover" />
                        {uploadingImage && (
                          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                            <Icon name="Loader" size={20} className="animate-spin text-white" />
                          </div>
                        )}
                        {!uploadingImage && (
                          <button onClick={removeBroadcastImage}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center shadow hover:bg-destructive/90">
                            <Icon name="X" size={13} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 w-fit px-4 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground cursor-pointer hover:border-primary/40 hover:text-foreground transition-colors">
                        <Icon name="Image" size={16} />
                        Прикрепить фото
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBroadcastImage(f); e.target.value = ""; }} />
                      </label>
                    )}
                    {uploadError && <div className="text-xs text-destructive mt-2">{uploadError}</div>}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-10">
                  <Button
                    onClick={sendBroadcast}
                    disabled={
                      (!broadcastText.trim() && !broadcastImageUrl) || sending || uploadingImage ||
                      (platform === "telegram" ? tgStatus !== "connected" || tgSelectedGroups.length === 0 :
                       (() => {
                         const mainConnected = (platform === "max" ? maxStatus : waStatus) === "connected";
                         const hasAnyAccount = waAccounts.length > 0
                           ? (mainConnected && includeMainAccount) || selectedAccountIds.length > 0
                           : mainConnected;
                         return !hasAnyAccount || selectedGroups.length === 0;
                       })())
                    }
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-11 text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    <Icon name={sending ? "Loader" : "Send"} size={15} className={sending ? "animate-spin" : ""} />
                    {sending ? "Отправляю..." : "Отправить"}
                  </Button>
                  {sendProgress && (
                    <div className="space-y-1.5 min-w-[140px]">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Прогресс</span>
                        <span>{sendProgress.done} / {sendProgress.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.round((sendProgress.done / sendProgress.total) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Результат рассылки */}
              {sendResult && (
                <div className={`rounded-xl border p-5 flex items-center gap-4 animate-fade-in ${
                  sendResult.failed === 0 ? "border-primary/40 bg-primary/10" : sendResult.sent === 0 ? "border-red-500/40 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10"
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${sendResult.failed === 0 ? "bg-primary/20" : sendResult.sent === 0 ? "bg-red-500/20" : "bg-amber-500/20"}`}>
                    <Icon name={sendResult.failed === 0 ? "CheckCircle" : "AlertTriangle"} size={20}
                      className={sendResult.failed === 0 ? "text-primary" : sendResult.sent === 0 ? "text-red-400" : "text-amber-400"} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${sendResult.failed === 0 ? "text-primary" : sendResult.sent === 0 ? "text-red-400" : "text-amber-400"}`}>
                      {sendResult.failed === 0 ? "Рассылка выполнена успешно!" : sendResult.sent === 0 ? "Ошибка отправки" : "Частичная отправка"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Отправлено: <b className="text-foreground">{sendResult.sent}</b> из <b className="text-foreground">{sendResult.total}</b> групп
                      {sendResult.failed > 0 && <span className="text-red-400 ml-2">· Ошибок: {sendResult.failed}</span>}
                    </div>
                  </div>
                  <button onClick={() => setSendResult(null)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              )}

              {/* Telegram — выбор групп из tgSelectedGroups */}
              {platform === "telegram" && tgStatus === "connected" && (
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">Выберите группы получателей</div>
                    {tgGroups.length > 0 && (
                      <button onClick={() => tgSelectedGroups.length === tgGroups.length ? setTgSelectedGroups([]) : setTgSelectedGroups(tgGroups.map((g) => g.id))}
                        className="text-xs text-primary hover:underline">
                        {tgSelectedGroups.length === tgGroups.length ? "Снять всё" : "Отметить всё"}
                      </button>
                    )}
                  </div>
                  {tgGroups.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      Нет групп. <button onClick={() => { setTab("connect"); setPlatform("telegram"); }} className="text-primary hover:underline">Подключите бота</button> и обновите список.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tgGroups.map((g) => (
                        <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-150 ${tgSelectedGroups.includes(g.id) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/40"}`}>
                          <input type="checkbox" checked={tgSelectedGroups.includes(g.id)} onChange={() => setTgSelectedGroups((prev) => prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id])} className="w-4 h-4 accent-blue-500" />
                          <Icon name="Send" size={14} className="text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground font-medium flex-1">{g.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {tgSelectedGroups.length > 0 && (
                    <div className="text-xs text-muted-foreground">Выбрано групп: <span className="text-foreground font-semibold">{tgSelectedGroups.length}</span></div>
                  )}
                </div>
              )}

              {/* WhatsApp / MAX / Whapi — группы */}
              {platform !== "telegram" && (() => {
                const platTag = platform === "max" ? "MAX" : platform === "whapi" ? "Whapi" : "WhatsApp";
                const platGroups = groups.filter((g) => g.active && g.tag === platTag);
                const platSelectedIds = selectedGroups.filter((id) => platGroups.some((g) => g.id === id));
                return (
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">Выберите группы получателей</div>
                      {platGroups.length > 0 && (
                        <button onClick={() => { const ids = platGroups.map((g) => g.id); setSelectedGroups(platSelectedIds.length === ids.length ? selectedGroups.filter((id) => !ids.includes(id)) : [...new Set([...selectedGroups, ...ids])]); }}
                          className="text-xs text-primary hover:underline">
                          {platSelectedIds.length === platGroups.length ? "Снять всё" : "Отметить всё"}
                        </button>
                      )}
                    </div>
                    {platGroups.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        Нет групп. <button onClick={() => setTab("connect")} className="text-primary hover:underline">Подключите аккаунт</button> и импортируйте группы.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {platGroups.map((g) => (
                          <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-150 ${selectedGroups.includes(g.id) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/40"}`}>
                            <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroupSelection(g.id)} className="w-4 h-4 accent-green-500" />
                            <span className="text-sm text-foreground font-medium flex-1">{g.name}</span>
                            <span className="text-xs text-muted-foreground">{g.members} участников</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {platSelectedIds.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Выбрано групп: <span className="text-foreground font-semibold">{platSelectedIds.length}</span> · Получателей:{" "}
                        <span className="text-foreground font-semibold">{groups.filter((g) => platSelectedIds.includes(g.id)).reduce((s, g) => s + g.members, 0)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── USERS (Admin) ── */}
          {tab === "users" && isAdmin && (
            <div className="max-w-2xl space-y-6">

              {/* Заголовок */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon name="Shield" size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Управление пользователями</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Только для администратора</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={fetchAdminUsers} className="h-8 text-xs text-muted-foreground gap-1.5">
                    <Icon name="RefreshCw" size={13} />Обновить
                  </Button>
                  <Button size="sm" onClick={() => { setShowCreateUser(true); setAdminMsg(null); }} className="h-8 text-xs bg-primary text-primary-foreground gap-1.5">
                    <Icon name="UserPlus" size={13} />Новый пользователь
                  </Button>
                </div>
              </div>

              {/* Сообщение об успехе/ошибке */}
              {adminMsg && (
                <div className={`rounded-lg px-4 py-3 text-sm border animate-fade-in ${adminMsg.ok ? "bg-primary/10 border-primary/30 text-primary" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                  {adminMsg.text}
                </div>
              )}

              {/* Форма создания пользователя */}
              {showCreateUser && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-fade-in">
                  <div className="text-sm font-semibold text-foreground">Новый пользователь</div>
                  <Input placeholder="Email / логин" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="h-9 text-sm" />
                  <Input placeholder="Пароль" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="h-9 text-sm" />
                  <div className="flex gap-2">
                    <Button onClick={createUser} disabled={adminActionLoading || !newUserEmail.trim() || !newUserPassword.trim()} className="flex-1 h-9 text-sm bg-primary text-primary-foreground">
                      {adminActionLoading ? <><Icon name="Loader" size={14} className="animate-spin mr-1.5" />Создаём...</> : "Создать"}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowCreateUser(false); setNewUserEmail(""); setNewUserPassword(""); }} className="h-9 text-sm">Отмена</Button>
                  </div>
                </div>
              )}

              {/* Список пользователей */}
              {adminLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                  <Icon name="Loader" size={16} className="animate-spin" />Загрузка...
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {adminUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                      <Icon name="Users" size={32} className="opacity-20" />
                      <span className="text-sm">Нет пользователей</span>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          {["ID", "Логин", "WA", "TG", ""].map((h) => (
                            <th key={h} className="text-left text-xs text-muted-foreground font-medium px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u, i) => (
                          <>
                          <tr key={u.id} className={`hover:bg-secondary/40 transition-colors ${(i < adminUsers.length - 1 || editApiUserId === u.id) ? "border-b border-border/50" : ""}`}>
                            <td className="px-4 py-3 text-xs text-muted-foreground w-10">#{u.id}</td>
                            <td className="px-4 py-3 text-sm text-foreground font-medium">{u.email}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${u.instance_id ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                                {u.instance_id ? "✓" : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${u.telegram_bot_token ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-secondary border-border text-muted-foreground"}`}>
                                {u.telegram_bot_token ? "✓" : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (editApiUserId === u.id) { setEditApiUserId(null); return; }
                                    setEditApiUserId(u.id);
                                    setEditApiFields({ instance_id: u.instance_id || "", instance_token: u.instance_token || "", max_instance_id: u.max_instance_id || "", max_instance_token: u.max_instance_token || "", telegram_bot_token: u.telegram_bot_token || "", whapi_token: u.whapi_token || "" });
                                    setResetUserId(null); setAdminMsg(null);
                                  }}
                                  className={`p-1.5 rounded transition-colors text-xs ${editApiUserId === u.id ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                                  title="API-ключи"
                                >
                                  <Icon name="Settings2" size={13} />
                                </button>
                                {resetUserId === u.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <Input placeholder="Новый пароль" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="h-7 text-xs w-32" />
                                    <button onClick={doResetPassword} disabled={adminActionLoading || !resetPassword.trim()} className="text-xs text-primary hover:underline font-medium disabled:opacity-40">{adminActionLoading ? "..." : "OK"}</button>
                                    <button onClick={() => { setResetUserId(null); setResetPassword(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setResetUserId(u.id); setResetPassword(""); setEditApiUserId(null); setAdminMsg(null); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Сменить пароль">
                                    <Icon name="KeyRound" size={13} />
                                  </button>
                                )}
                                <button onClick={() => deleteUser(u.id, u.email)} disabled={adminActionLoading} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                  <Icon name="Trash2" size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editApiUserId === u.id && (
                            <tr key={`api-${u.id}`} className={i < adminUsers.length - 1 ? "border-b border-border/50" : ""}>
                              <td colSpan={5} className="px-4 py-4 bg-secondary/20">
                                <div className="space-y-3">
                                  <div className="text-xs font-semibold text-amber-400 mb-2">API-ключи для {u.email}</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">WhatsApp Instance ID</div>
                                      <Input value={editApiFields.instance_id} onChange={(e) => setEditApiFields(f => ({...f, instance_id: e.target.value}))} placeholder="1234567890" className="h-8 text-xs" />
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">WhatsApp Token</div>
                                      <Input value={editApiFields.instance_token} onChange={(e) => setEditApiFields(f => ({...f, instance_token: e.target.value}))} placeholder="токен" className="h-8 text-xs" />
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">MAX Instance ID</div>
                                      <Input value={editApiFields.max_instance_id} onChange={(e) => setEditApiFields(f => ({...f, max_instance_id: e.target.value}))} placeholder="1234567890" className="h-8 text-xs" />
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">MAX Token</div>
                                      <Input value={editApiFields.max_instance_token} onChange={(e) => setEditApiFields(f => ({...f, max_instance_token: e.target.value}))} placeholder="токен" className="h-8 text-xs" />
                                    </div>
                                    <div className="col-span-2">
                                      <div className="text-xs text-muted-foreground mb-1">Telegram Bot Token</div>
                                      <Input value={editApiFields.telegram_bot_token} onChange={(e) => setEditApiFields(f => ({...f, telegram_bot_token: e.target.value}))} placeholder="1234567890:AAF..." className="h-8 text-xs" />
                                    </div>
                                    <div className="col-span-2">
                                      <div className="text-xs text-muted-foreground mb-1">Whapi Token</div>
                                      <Input value={editApiFields.whapi_token} onChange={(e) => setEditApiFields(f => ({...f, whapi_token: e.target.value}))} placeholder="токен Whapi.cloud" className="h-8 text-xs" />
                                    </div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button onClick={() => saveApiKeys(u.id)} disabled={adminActionLoading} className="h-8 text-xs bg-amber-500 hover:bg-amber-500/90 text-white gap-1.5">
                                      {adminActionLoading ? <Icon name="Loader" size={12} className="animate-spin" /> : <Icon name="Save" size={12} />}
                                      Сохранить
                                    </Button>
                                    <Button variant="ghost" onClick={() => setEditApiUserId(null)} className="h-8 text-xs">Отмена</Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── HELP ── */}
          {tab === "help" && (
            <div className="max-w-3xl space-y-8">

              {/* Заголовок */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Icon name="BookOpen" size={24} className="text-primary" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">Инструкция по использованию</div>
                  <div className="text-sm text-muted-foreground mt-0.5">Пошаговое руководство — от подключения до отправки рассылки</div>
                </div>
              </div>

              {/* Шаг 1 — Подключение */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary-foreground">1</div>
                  <div className="text-base font-bold text-foreground">Подключите мессенджер</div>
                </div>
                <div className="ml-10 space-y-3">
                  <p className="text-sm text-muted-foreground">Перейдите в раздел <button onClick={() => setTab("connect")} className="text-primary hover:underline font-medium">Подключение</button> и выберите нужную платформу:</p>

                  {[
                    { icon: "MessageCircle", name: "WhatsApp", color: "text-primary", steps: [
                      "Нажмите «Получить QR-код для входа»",
                      "Откройте WhatsApp на телефоне",
                      "Перейдите: Настройки → Связанные устройства → Привязать устройство",
                      "Отсканируйте QR-код камерой телефона",
                      "Дождитесь статуса «WhatsApp успешно подключён»",
                    ]},
                    { icon: "Zap", name: "MAX", color: "text-amber-400", steps: [
                      "Выберите вкладку MAX вверху раздела Подключение",
                      "Нажмите «Получить QR-код для входа»",
                      "Откройте приложение MAX на телефоне",
                      "Найдите раздел Связанные устройства и отсканируйте QR",
                      "Дождитесь статуса «MAX успешно подключён»",
                    ]},
                    { icon: "Send", name: "Telegram", color: "text-blue-400", steps: [
                      "Выберите вкладку Telegram вверху раздела Подключение",
                      "Нажмите «Проверить подключение бота»",
                      "Если бот не подключён — обратитесь к администратору для назначения токена",
                      "После подключения бот автоматически найдёт группы, в которых состоит",
                    ]},
                  ].map((p) => (
                    <div key={p.name} className="rounded-xl border border-border bg-card p-5">
                      <div className={`flex items-center gap-2 text-sm font-semibold mb-3 ${p.color}`}>
                        <Icon name={p.icon} size={16} />
                        {p.name}
                      </div>
                      <ol className="space-y-2">
                        {p.steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-xs font-semibold text-foreground mt-0.5">{i + 1}</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>

              {/* Несколько аккаунтов */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-500/80 flex items-center justify-center flex-shrink-0">
                    <Icon name="Layers" size={14} className="text-white" />
                  </div>
                  <div className="text-base font-bold text-foreground">Несколько аккаунтов WhatsApp / MAX</div>
                </div>
                <div className="ml-10 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
                  <p className="text-sm text-muted-foreground">Можно подключить неограниченное количество аккаунтов WhatsApp или MAX. При рассылке группы автоматически распределятся между всеми аккаунтами — нагрузка делится поровну, скорость рассылки растёт.</p>
                  <div className="space-y-2">
                    {[
                      { n: 1, text: "Перейдите в раздел Подключение → выберите вкладку WhatsApp или MAX" },
                      { n: 2, text: "В блоке «Аккаунты» нажмите «+ Добавить»" },
                      { n: 3, text: "Введите название аккаунта (например: «Основной» или «Запасной»)" },
                      { n: 4, text: "Введите идентификатор инстанса и токен доступа из личного кабинета сервиса" },
                      { n: 5, text: "Нажмите «Добавить», затем «Подключить» — отсканируйте QR на телефоне" },
                      { n: 6, text: "Повторите для каждого дополнительного аккаунта" },
                    ].map((item) => (
                      <div key={item.n} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-400 mt-0.5">{item.n}</span>
                        {item.text}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Icon name="Zap" size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">При рассылке в разделе <button onClick={() => setTab("broadcast")} className="text-primary hover:underline font-medium">Рассылка</button> появится зелёный баннер — он покажет, что сообщения пойдут через все аккаунты сразу.</span>
                  </div>
                </div>
              </div>

              {/* Шаг 2 — Группы */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary-foreground">2</div>
                  <div className="text-base font-bold text-foreground">Добавьте группы для рассылки</div>
                </div>
                <div className="ml-10 rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-sm text-muted-foreground">После подключения мессенджера добавьте группы, которым будете отправлять сообщения:</p>
                  <div className="space-y-2">
                    {[
                      { title: "Импорт из WhatsApp / MAX", desc: "В разделе Подключение → нажмите «Обновить» → отметьте нужные группы галочками → нажмите «Добавить в рассылки»" },
                      { title: "Импорт из Telegram", desc: "В разделе Подключение → вкладка Telegram → отметьте группы бота → нажмите «Добавить в рассылки»" },
                      { title: "Добавить вручную", desc: "В разделе Группы → нажмите «Добавить группу» → введите название и выберите тег" },
                    ].map((item) => (
                      <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40">
                        <Icon name="CheckCircle" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Шаг 3 — Рассылка */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary-foreground">3</div>
                  <div className="text-base font-bold text-foreground">Отправьте рассылку</div>
                </div>
                <div className="ml-10 rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-sm text-muted-foreground">Перейдите в раздел <button onClick={() => setTab("broadcast")} className="text-primary hover:underline font-medium">Рассылка</button> и выполните следующие шаги:</p>
                  <ol className="space-y-3">
                    {[
                      { n: 1, text: "Выберите платформу — WhatsApp, MAX или Telegram (вкладки вверху)" },
                      { n: 2, text: "Введите текст сообщения в поле «Текст сообщения»" },
                      { n: 3, text: "Отметьте группы-получателей галочками в списке ниже" },
                      { n: 4, text: "Нажмите кнопку «Отправить» — прогресс-бар покажет ход отправки" },
                      { n: 5, text: "По завершении появится результат: сколько групп получили сообщение" },
                    ].map((item) => (
                      <li key={item.n} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary mt-0.5">{item.n}</span>
                        {item.text}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Советы */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/80 flex items-center justify-center flex-shrink-0">
                    <Icon name="Lightbulb" size={14} className="text-white" />
                  </div>
                  <div className="text-base font-bold text-foreground">Полезные советы</div>
                </div>
                <div className="ml-10 space-y-2">
                  {[
                    "Телефон с WhatsApp / MAX должен быть включён и иметь интернет во время рассылки",
                    "Не отправляйте слишком часто — мессенджеры могут заблокировать аккаунт за спам",
                    "Используйте теги групп (VIP, Клиенты, Партнёры) для удобной сортировки",
                    "Telegram-бот должен быть администратором группы, чтобы отправлять сообщения",
                    "При отправке большого числа групп используйте краткий и информативный текст",
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <Icon name="Info" size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Быстрые действия */}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="text-sm font-bold text-foreground mb-4">Быстрый старт</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: "Smartphone", label: "Подключить", tab: "connect" as Tab },
                    { icon: "Users", label: "Группы", tab: "groups" as Tab },
                    { icon: "Send", label: "Рассылка", tab: "broadcast" as Tab },
                  ].map((item) => (
                    <button key={item.tab} onClick={() => setTab(item.tab)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-secondary/60 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-all text-muted-foreground hover:text-primary">
                      <Icon name={item.icon} size={22} />
                      <span className="text-xs font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Index;