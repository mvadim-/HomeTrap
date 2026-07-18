import { afterEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import {
  getPushDeviceStatus,
  subscribePushDevice,
  unsubscribePushDevice,
} from "./push";

const notificationDescriptor = Object.getOwnPropertyDescriptor(window, "Notification");
const pushManagerDescriptor = Object.getOwnPropertyDescriptor(window, "PushManager");
const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

function restoreProperty(target: object, name: string, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

function installPushMocks(
  subscription: PushSubscription | null,
  permission: NotificationPermission = "granted",
) {
  const requestPermission = vi.fn().mockResolvedValue(permission);
  const subscribe = vi.fn();
  const getSubscription = vi.fn().mockResolvedValue(subscription);
  const registration = {
    pushManager: { getSubscription, subscribe },
  };
  const register = vi.fn().mockResolvedValue({
    pushManager: { getSubscription, subscribe },
  });
  const getRegistration = vi.fn().mockResolvedValue(registration);

  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission, requestPermission },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register },
  });

  return { getRegistration, getSubscription, register, requestPermission, subscribe };
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreProperty(window, "Notification", notificationDescriptor);
  restoreProperty(window, "PushManager", pushManagerDescriptor);
  restoreProperty(navigator, "serviceWorker", serviceWorkerDescriptor);
});

describe("Push subscription flow", () => {
  it("registers the service worker and sends a successful browser subscription", async () => {
    const subscription = {
      endpoint: "https://push.example.test/device",
      toJSON: () => ({
        endpoint: "https://push.example.test/device",
        keys: { p256dh: "browser-p256dh", auth: "browser-auth" },
      }),
    } as unknown as PushSubscription;
    const mocks = installPushMocks(null);
    mocks.subscribe.mockResolvedValue(subscription);
    vi.spyOn(apiClient, "getPushPublicKey").mockResolvedValue({ public_key: "AQID" });
    const create = vi.spyOn(apiClient, "createPushSubscription").mockResolvedValue({
      endpoint: subscription.endpoint,
      created_at: "2026-07-18T20:00:00Z",
    });

    await expect(subscribePushDevice()).resolves.toBe("subscribed");
    expect(mocks.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(mocks.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    }));
    expect(create).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      keys: { p256dh: "browser-p256dh", auth: "browser-auth" },
    });
  });

  it("reports denied permission without registering or calling the API", async () => {
    const mocks = installPushMocks(null, "denied");
    const publicKey = vi.spyOn(apiClient, "getPushPublicKey");
    const create = vi.spyOn(apiClient, "createPushSubscription");

    await expect(subscribePushDevice()).resolves.toBe("denied");
    await expect(getPushDeviceStatus()).resolves.toBe("denied");
    expect(mocks.register).not.toHaveBeenCalled();
    expect(publicKey).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("deletes the server subscription and unsubscribes the browser", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: "https://push.example.test/device",
      unsubscribe,
    } as unknown as PushSubscription;
    installPushMocks(subscription);
    const remove = vi.spyOn(apiClient, "deletePushSubscription").mockResolvedValue();

    await expect(unsubscribePushDevice()).resolves.toBe("unsubscribed");
    expect(remove).toHaveBeenCalledWith(subscription.endpoint);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("checks status without registering a service worker", async () => {
    const mocks = installPushMocks(null);

    await expect(getPushDeviceStatus()).resolves.toBe("unsubscribed");

    expect(mocks.getRegistration).toHaveBeenCalledOnce();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("does not report success when browser unsubscribe returns false", async () => {
    const subscription = {
      endpoint: "https://push.example.test/device",
      unsubscribe: vi.fn().mockResolvedValue(false),
    } as unknown as PushSubscription;
    installPushMocks(subscription);
    const remove = vi.spyOn(apiClient, "deletePushSubscription").mockResolvedValue();

    await expect(unsubscribePushDevice()).rejects.toThrow("remains active");
    expect(remove).not.toHaveBeenCalled();
  });
});
