const NEW_ORDER_SOUND_KEY = "xiongfei-new-order-sound-v1";

export function loadNewOrderSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(NEW_ORDER_SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveNewOrderSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(NEW_ORDER_SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // The current page still keeps the user's choice when storage is unavailable.
  }
}
