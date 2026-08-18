import { api } from "./api.js";
import i18n from "./i18n.js";

function b64ZuUint8(base64) {
  const rest = "=".repeat((4 - (base64.length % 4)) % 4);
  const roh = atob((base64 + rest).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...roh].map((c) => c.charCodeAt(0)));
}

export function pushMoeglich() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function istIosOhneInstallation() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installiert = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  return ios && !installiert;
}

export async function pushAktivieren() {
  if (!pushMoeglich()) return { ok: false, fehler: i18n.t("push.geraetNein") };
  if (istIosOhneInstallation()) return { ok: false, fehler: i18n.t("push.iphoneInstallieren") };
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") return { ok: false, fehler: i18n.t("push.nichtErlaubt") };
  const reg = await navigator.serviceWorker.ready;
  const abo = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ZuUint8(import.meta.env.VITE_VAPID_PUBLIC_KEY || ""),
  });
  const antwort = await api("aktion", { aktion: "push_abo", daten: { abo: abo.toJSON() } });
  return antwort.ok ? { ok: true } : { ok: false, fehler: antwort.fehler || i18n.t("push.speichernFehl") };
}

export async function pushStatus() {
  if (!pushMoeglich()) return "unmoeglich";
  if (Notification.permission !== "granted") return "aus";
  const reg = await navigator.serviceWorker.ready;
  const abo = await reg.pushManager.getSubscription();
  return abo ? "an" : "aus";
}
