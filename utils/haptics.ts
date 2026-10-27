/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Haptic feedback. Android/Chrome: Vibration API. iPhone Safari has no Vibration API; on
 * iOS 18+ toggling an <input type="checkbox" switch> through its label plays the system
 * haptic tick, which we use instead (reliable inside a tap, may be ignored otherwise).
 */

const KEY = 'compile_haptics';
let enabled = (() => {
    try {
        return localStorage.getItem(KEY) !== '0';
    } catch {
        return true;
    }
})();

export const hapticsEnabled = () => enabled;

export function setHaptics(value: boolean) {
    enabled = value;
    try {
        localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
        // ignore
    }
}

let iosLabel: HTMLLabelElement | null = null;

function iosTick() {
    if (!iosLabel) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.id = 'haptic-switch';
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-10px;top:-10px';
        iosLabel = document.createElement('label');
        iosLabel.htmlFor = input.id;
        iosLabel.style.cssText = input.style.cssText;
        iosLabel.setAttribute('aria-hidden', 'true');
        document.body.append(input, iosLabel);
    }
    iosLabel.click();
}

// iOS only lets the switch trick buzz inside a user activation, and for touch input that is
// touchend - not touchstart/pointerdown, where card taps are handled. Ticks requested while
// a finger is down are played when it lifts.
let touchActive = false;
let pendingTicks = 0;
let listening = false;

function listenForTouches() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('touchstart', () => { touchActive = true; }, { capture: true, passive: true });
    const flush = () => {
        touchActive = false;
        const n = pendingTicks;
        pendingTicks = 0;
        if (n > 0) {
            try {
                iosTick();
            } catch {
                // ignore
            }
        }
    };
    document.addEventListener('touchend', flush, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => { touchActive = false; pendingTicks = 0; }, { capture: true, passive: true });
}

export function haptic(kind: 'tap' | 'strong' = 'tap') {
    if (!enabled) return;
    try {
        if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(kind === 'strong' ? [30, 50, 70] : 12);
            return;
        }
        listenForTouches();
        if (touchActive) {
            pendingTicks++;
            return;
        }
        iosTick();
        if (kind === 'strong') {
            setTimeout(iosTick, 110);
            setTimeout(iosTick, 220);
        }
    } catch {
        // haptics are a nice-to-have
    }
}

/** Start tracking touches early so the very first card tap can buzz. */
export function initHaptics() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function') listenForTouches();
}
