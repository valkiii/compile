/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Online connection through the invite-only relay on the owner's home server
 * (server/relay.py behind Tailscale Funnel). Plain outbound secure WebSockets, so it works
 * on any network; no third-party services.
 *
 * The relay has two doors: a tailnet-only one (Tailscale Serve) where the owner opens and
 * hosts rooms (owner key required), and a public one (Tailscale Funnel) where guests can
 * only join with room code + invite key (both in the invite link). Handles reconnecting after network switches or the phone
 * sleeping, and re-attaching to the room after a page reload (session in localStorage).
 */

export type Role = 'host' | 'guest';

export interface OnlineSessionInfo {
    room: string;
    role: Role;
    token: string;
    /** Host only: the room's invite key (goes into the invite link). */
    invite?: string;
}

export type RelayEvent =
    | { type: 'status'; connected: boolean }
    | { type: 'session'; session: OnlineSessionInfo }
    | { type: 'peer'; connected: boolean; left?: boolean }
    | { type: 'message'; data: unknown }
    | { type: 'error'; code: string };

const PUBLIC_RELAY_URL = 'wss://pihole1.tail448243.ts.net:10000/compile-relay';
const PRIVATE_RELAY_URL = 'wss://pihole1.tail448243.ts.net:8796';
const SESSION_KEY = 'compile_online_session';
const OWNER_KEY_STORAGE = 'compile_owner_key';

/** Guests use the public door, the host the tailnet-only one. ?relay= / ?relayprivate= override for testing. */
export function relayUrl(role: Role): string {
    try {
        const params = new URLSearchParams(window.location.search);
        const override = params.get(role === 'host' ? 'relayprivate' : 'relay');
        if (override) return override;
    } catch {
        // ignore
    }
    return role === 'host' ? PRIVATE_RELAY_URL : PUBLIC_RELAY_URL;
}

/** The owner key lets this device open rooms. Set once by opening the site with ?owner=KEY. */
export function getOwnerKey(): string | null {
    try {
        return localStorage.getItem(OWNER_KEY_STORAGE);
    } catch {
        return null;
    }
}

export function setOwnerKey(key: string | null) {
    try {
        if (key) localStorage.setItem(OWNER_KEY_STORAGE, key);
        else localStorage.removeItem(OWNER_KEY_STORAGE);
    } catch {
        // ignore
    }
}

export function loadSavedSession(): OnlineSessionInfo | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(session: OnlineSessionInfo | null) {
    try {
        if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else localStorage.removeItem(SESSION_KEY);
    } catch {
        // ignore
    }
}

type Listener = (event: RelayEvent) => void;
type Intent = { t: 'create'; ownerKey: string } | { t: 'join'; room: string; invite: string };

export class RelayClient {
    private ws: WebSocket | null = null;
    private listeners = new Set<Listener>();
    private outbox: string[] = [];
    private intent: Intent | null = null;
    private retry = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private closed = false;
    private attached = false;

    session: OnlineSessionInfo | null = null;
    connected = false;
    peerConnected = false;

    private url: string;

    constructor(role: Role) {
        this.url = relayUrl(role);
        document.addEventListener('visibilitychange', this.onWake);
        window.addEventListener('online', this.onWake);
    }

    on(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    create(ownerKey: string) {
        this.intent = { t: 'create', ownerKey };
        this.ensureOpen();
    }

    join(room: string, invite: string) {
        this.intent = { t: 'join', room: room.toUpperCase().trim(), invite: invite.toUpperCase().trim() };
        this.ensureOpen();
    }

    resume(session: OnlineSessionInfo) {
        this.session = session;
        this.ensureOpen();
    }

    /** Send game data to the other player. Only guest moves are queued while offline: the host re-sends everything on 'sync'. */
    send(data: unknown) {
        const frame = JSON.stringify({ t: 'msg', data });
        if (this.ws?.readyState === WebSocket.OPEN && this.attached) this.ws.send(frame);
        else if (this.session?.role !== 'host') this.outbox.push(frame);
    }

    /** Leave the room for good (the other player is told, the room is closed). */
    leave() {
        try {
            if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' }));
        } catch {
            // ignore
        }
        saveSession(null);
        setTimeout(() => this.dispose(), 200);
    }

    dispose() {
        this.closed = true;
        document.removeEventListener('visibilitychange', this.onWake);
        window.removeEventListener('online', this.onWake);
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.ws?.close();
        this.ws = null;
        this.listeners.clear();
    }

    private emit(event: RelayEvent) {
        this.listeners.forEach(l => l(event));
    }

    private onWake = () => {
        // iOS suspends sockets in the background; reconnect as soon as the page is back
        if (document.visibilityState === 'visible' && !this.closed
            && (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING)) {
            this.retry = 0;
            this.open();
        }
    };

    private ensureOpen() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.handshake();
            return;
        }
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
        this.open();
    }

    private open() {
        if (this.closed) return;
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.attached = false;
        let ws: WebSocket;
        try {
            ws = new WebSocket(this.url);
        } catch {
            this.scheduleReconnect();
            return;
        }
        this.ws = ws;
        ws.onopen = () => {
            if (this.ws !== ws) return;
            this.retry = 0;
            this.setConnected(true);
            this.handshake();
            if (this.pingTimer) clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send('{"t":"ping"}');
            }, 20000);
        };
        ws.onmessage = ev => this.onFrame(String(ev.data));
        ws.onclose = () => {
            if (this.ws !== ws) return;
            this.attached = false;
            this.setConnected(false);
            if (this.peerConnected) {
                this.peerConnected = false;
                this.emit({ type: 'peer', connected: false });
            }
            if (this.pingTimer) clearInterval(this.pingTimer);
            if (!this.closed) this.scheduleReconnect();
        };
        ws.onerror = () => ws.close();
    }

    private scheduleReconnect() {
        const delay = Math.min(8000, 500 * 2 ** this.retry);
        this.retry++;
        this.retryTimer = setTimeout(() => this.open(), delay);
    }

    private handshake() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.session) this.ws.send(JSON.stringify({ t: 'rejoin', room: this.session.room, role: this.session.role, token: this.session.token }));
        else if (this.intent) this.ws.send(JSON.stringify(this.intent));
    }

    private onFrame(raw: string) {
        let msg: Record<string, unknown>;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        switch (msg.t) {
            case 'created':
            case 'joined':
            case 'rejoined': {
                this.session = {
                    room: msg.room as string,
                    role: msg.role as Role,
                    token: msg.token as string,
                    invite: (msg.invite as string | undefined) ?? this.session?.invite,
                };
                this.intent = null;
                this.attached = true;
                saveSession(this.session);
                this.emit({ type: 'session', session: this.session });
                this.outbox.splice(0).forEach(frame => this.ws?.send(frame));
                break;
            }
            case 'peer':
                this.peerConnected = !!msg.connected;
                if (msg.left) saveSession(null);
                this.emit({ type: 'peer', connected: this.peerConnected, left: !!msg.left });
                break;
            case 'msg':
                this.emit({ type: 'message', data: msg.data });
                break;
            case 'error':
                if (msg.code === 'rejoin_failed') {
                    this.session = null;
                    saveSession(null);
                }
                // A failed create/join is final: don't retry the same request on reconnect
                if (msg.code !== 'rejoin_failed') this.intent = null;
                this.emit({ type: 'error', code: String(msg.code) });
                break;
        }
    }

    private setConnected(connected: boolean) {
        if (this.connected === connected) return;
        this.connected = connected;
        this.emit({ type: 'status', connected });
    }
}
