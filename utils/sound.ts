/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Game sound effects, synthesized with the Web Audio API (no audio files).
 * iOS only allows audio after a user gesture, so the context is unlocked on the first tap.
 */

export type SoundName = 'draw' | 'place' | 'discard' | 'delete' | 'flip' | 'shift' | 'compile' | 'message';

const MUTE_KEY = 'compile_sound_muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = (() => {
    try {
        return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
})();
const listeners = new Set<(muted: boolean) => void>();

export const isMuted = () => muted;

export function setMuted(value: boolean) {
    muted = value;
    try {
        localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
        // ignore
    }
    listeners.forEach(l => l(value));
}

export function onMuteChange(listener: (muted: boolean) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function audio(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
}

/** Call from a user gesture (first tap) so iOS lets us play later. */
export function unlockAudio() {
    // iPhones mute web audio when the ring/silent switch is on; game sounds should play
    // anyway (the in-game mute button still silences them)
    try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session && session.type !== 'playback') session.type = 'playback';
    } catch {
        // not supported: fine
    }
    const c = audio();
    if (c && c.state === 'suspended') void c.resume();
}

function envelope(c: AudioContext, start: number, peak: number, attack: number, decay: number): GainNode {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    g.connect(master!);
    return g;
}

function tone(c: AudioContext, type: OscillatorType, from: number, to: number, start: number, peak: number, decay: number) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, start);
    o.frequency.exponentialRampToValueAtTime(to, start + decay);
    o.connect(envelope(c, start, peak, 0.005, decay));
    o.start(start);
    o.stop(start + decay + 0.05);
}

function noise(c: AudioContext, filter: BiquadFilterType, from: number, to: number, start: number, peak: number, decay: number) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, start);
    f.frequency.exponentialRampToValueAtTime(to, start + decay);
    src.connect(f);
    f.connect(envelope(c, start, peak, 0.01, decay));
    src.start(start);
    src.stop(start + decay + 0.05);
}

let lastPlayed: Partial<Record<SoundName, number>> = {};

export function playSound(name: SoundName) {
    if (muted) return;
    const c = audio();
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    // Bursts of identical events (multi-card draws) sound like one
    if ((lastPlayed[name] ?? -1) > now - 0.06) return;
    lastPlayed[name] = now;

    switch (name) {
        case 'draw': // soft swish up
            noise(c, 'bandpass', 1800, 4200, now, 0.25, 0.16);
            break;
        case 'place': // card set down: low thump + tap
            tone(c, 'sine', 150, 70, now, 0.6, 0.13);
            noise(c, 'highpass', 3000, 2500, now, 0.12, 0.03);
            break;
        case 'shift': // slide across
            noise(c, 'bandpass', 900, 1800, now, 0.22, 0.14);
            tone(c, 'sine', 220, 180, now + 0.1, 0.25, 0.08);
            break;
        case 'flip': // quick tick-tock
            tone(c, 'square', 1100, 900, now, 0.08, 0.035);
            tone(c, 'square', 800, 700, now + 0.06, 0.07, 0.035);
            break;
        case 'discard': // slide down into the trash
            noise(c, 'lowpass', 3000, 400, now, 0.3, 0.26);
            break;
        case 'delete': // heavier discard
            noise(c, 'lowpass', 2500, 250, now, 0.32, 0.3);
            tone(c, 'triangle', 200, 60, now, 0.35, 0.25);
            break;
        case 'compile': { // thunder crack + rumble, then a rising chime
            noise(c, 'highpass', 6000, 1500, now, 0.55, 0.12);
            noise(c, 'lowpass', 900, 80, now + 0.04, 0.6, 0.9);
            tone(c, 'sawtooth', 70, 35, now + 0.02, 0.25, 0.7);
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, 'sine', f, f, now + 0.35 + i * 0.09, 0.24, 0.35));
            tone(c, 'triangle', 1046.5, 2093, now + 0.71, 0.1, 0.5);
            break;
        }
        case 'message': // two-note ping
            tone(c, 'sine', 880, 880, now, 0.3, 0.18);
            tone(c, 'sine', 1318.5, 1318.5, now + 0.11, 0.28, 0.28);
            break;
    }
}

/** Which sound an animation should make. */
export function soundForAnimation(type: string): SoundName | null {
    switch (type) {
        case 'draw':
        case 'refresh':
        case 'take':
        case 'give':
            return 'draw';
        case 'play':
            return 'place';
        case 'shift':
        case 'return':
            return 'shift';
        case 'flip':
            return 'flip';
        case 'discard':
            return 'discard';
        case 'delete':
            return 'delete';
        case 'compile':
            return 'compile';
        default:
            return null;
    }
}
