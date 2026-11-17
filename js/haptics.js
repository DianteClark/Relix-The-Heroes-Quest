// Haptic feedback. Android/Chrome: Vibration API. iOS Safari (17.4+/18): toggling a
// hidden <input type="checkbox" switch> fires the system haptic. Native app builds
// can replace `impl` with the Capacitor Haptics plugin later.
let enabled = true;
let iosSwitch = null;
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    iosSwitch = document.createElement('input');
    iosSwitch.type = 'checkbox';
    iosSwitch.setAttribute('switch', '');
    label.appendChild(iosSwitch);
    document.body.appendChild(label);
    iosSwitch._label = label;
  }
  iosSwitch._label.click();
}

function buzz(pattern, iosTicks = 1) {
  if (!enabled) return;
  try {
    if (canVibrate && !isIOS) navigator.vibrate(pattern);
    else if (isIOS) { iosTick(); if (iosTicks > 1) setTimeout(iosTick, 90); }
  } catch { /* ignore */ }
}

export const haptics = {
  setEnabled(v) { enabled = !!v; },
  get enabled() { return enabled; },
  tap() { buzz(8); },
  select() { buzz(12); },
  impact(level = 1) { buzz(level >= 2 ? [30, 30, 40] : 22, level >= 2 ? 2 : 1); },
  success() { buzz([15, 60, 25], 2); },
  error() { buzz([40, 50, 40], 2); },
  dice() { buzz(10); },
};
