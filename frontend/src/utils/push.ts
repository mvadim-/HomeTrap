import {
  createPushSubscription,
  deletePushSubscription,
  getPushPublicKey,
} from "../api/client";

export type PushDeviceStatus =
  | "checking"
  | "unsupported"
  | "denied"
  | "unsubscribed"
  | "subscribed";

function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

function decodeVapidPublicKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushDeviceStatus(): Promise<PushDeviceStatus> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "unsubscribed";
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "subscribed" : "unsubscribed";
}

export async function subscribePushDevice(): Promise<PushDeviceStatus> {
  if (!isPushSupported()) return "unsupported";

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await registerServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey((await getPushPublicKey()).public_key),
  });
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("Push subscription does not contain browser keys");
  }

  await createPushSubscription({
    endpoint: serialized.endpoint,
    keys: {
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    },
  });
  return "subscribed";
}

export async function unsubscribePushDevice(): Promise<PushDeviceStatus> {
  if (!isPushSupported()) return "unsupported";

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "unsubscribed";
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "unsubscribed";

  if (!await subscription.unsubscribe()) {
    throw new Error("Browser Push subscription remains active");
  }
  await deletePushSubscription(subscription.endpoint);
  return "unsubscribed";
}
