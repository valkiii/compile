/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Online connection between the two phones, peer-to-peer over WebRTC (PeerJS).
 * No server of our own: the free public PeerJS broker only introduces the phones, then
 * they talk directly (PeerJS's default config also brings TURN relays for strict networks).
 *
 * The host registers the peer id derived from the room code; the guest connects to it.
 * Handles reconnecting after network switches or the phone sleeping, and re-attaching
 * to the room after a page reload (session saved in localStorage).
 */

import Peer, { DataConnection } from 'peerjs';

export type Role = 'host' | 'guest';

export interface OnlineSessionInfo {
    room: string;
    role: Role;
    /** Identifies the guest to the host, so a stranger with the code can't take the seat. */
    token: string;
    /** Host only: token of the guest who joined first. */
    guestToken?: string;
}

export type RelayEvent =
    | { type: 'status'; connected: boolean }
    | { type: 'session'; session: OnlineSessionInfo }
    | { type: 'peer'; connected: boolean; left?: boolean }
    | { type: 'message'; data: unknown }
    | { type: 'error'; code: string };

type Envelope =
    | { t: 'hello'; token: string }
    | { t: 'welcome' }
    | { t: 'taken' }
    | { t: 'leave' }
    | { t: 'ping' }
    | { t: 'pong' }
    | { t: 'msg'; data: unknown };

const SESSION_KEY = 'compile_online_session';
const PEER_PREFIX = 'compile-main-v1-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const HEARTBEAT_MS = 4000;
const PEER_TIMEOUT_MS = 14000;

const peerIdFor = (room: string) => PEER_PREFIX + room.toUpperCase();
const randomCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const randomToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

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

export class RelayClient {
    private peer: Peer | null = null;
    private conn: DataConnection | null = null;
    private listeners = new Set<Listener>();
    private outbox: unknown[] = [];
    private closed = false;
    private joinedOnce = false;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private lastHeard = 0;
    private createAttempts = 0;

    session: OnlineSessionInfo | null = null;
    connected = false;      // registered with the broker (host) / have a peer object (guest)
    peerConnected = false;  // the other phone is connected and greeted

    constructor() {
        document.addEventListener('visibilitychange', this.onWake);
        window.addEventListener('online', this.onWake);
    }

    on(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    create() {
        this.session = { room: randomCode(), role: 'host', token: randomToken() };
        this.startHost(true);
    }

    join(room: string) {
        this.session = { room: room.toUpperCase().trim(), role: 'guest', token: randomToken() };
        this.joinedOnce = false;
        this.startGuest();
    }

    resume(session: OnlineSessionInfo) {
        this.session = session;
        this.joinedOnce = true;
        if (session.role === 'host') this.startHost(false);
        else this.startGuest();
    }

    /** Send game data to the other player. */
    send(data: unknown) {
        if (this.conn?.open && this.peerConnected) this.write({ t: 'msg', data });
        // The host re-sends everything on the guest's 'sync', so only guest moves are queued
        else if (this.session?.role === 'guest') this.outbox.push(data);
    }

    /** Leave the room for good: the other player is told. */
    leave() {
        this.write({ t: 'leave' });
        saveSession(null);
        // Give the goodbye a moment to go out
        setTimeout(() => this.dispose(), 300);
    }

    dispose() {
        this.closed = true;
        document.removeEventListener('visibilitychange', this.onWake);
        window.removeEventListener('online', this.onWake);
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.conn?.close();
        this.peer?.destroy();
        this.peer = null;
        this.conn = null;
        this.listeners.clear();
    }

    // ---------------------------------------------------------------- host

    private startHost(fresh: boolean) {
        if (this.closed || !this.session) return;
        this.peer?.destroy();
        const peer = new Peer(peerIdFor(this.session.room), { debug: 0 });
        this.peer = peer;

        peer.on('open', () => {
            this.createAttempts = 0;
            this.setConnected(true);
            saveSession(this.session);
            this.emit({ type: 'session', session: this.session! });
        });
        peer.on('connection', conn => this.attachConnection(conn));
        peer.on('disconnected', () => {
            // Lost the broker (network switch / sleep). Existing data connection may survive.
            this.setConnected(false);
            this.later(() => !this.closed && peer === this.peer && !peer.destroyed && peer.reconnect(), 1500);
        });
        peer.on('error', err => {
            const type = (err as { type?: string }).type;
            if (type === 'unavailable-id') {
                if (fresh && this.createAttempts++ < 5) {
                    // Code collision: pick another
                    this.session = { ...this.session!, room: randomCode() };
                    this.startHost(true);
                } else {
                    // Our own old registration hasn't expired yet (page reload): retry shortly
                    this.later(() => this.startHost(false), 3000);
                }
                return;
            }
            if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                this.setConnected(false);
                this.later(() => this.startHost(false), 3000);
            }
        });
    }

    // ---------------------------------------------------------------- guest

    private startGuest() {
        if (this.closed || !this.session) return;
        if (!this.peer || this.peer.destroyed) {
            const peer = new Peer({ debug: 0 });
            this.peer = peer;
            peer.on('open', () => {
                this.setConnected(true);
                this.connectToHost();
            });
            peer.on('disconnected', () => {
                this.setConnected(false);
                this.later(() => !this.closed && peer === this.peer && !peer.destroyed && peer.reconnect(), 1500);
            });
            peer.on('error', err => {
                const type = (err as { type?: string }).type;
                if (type === 'peer-unavailable') {
                    if (!this.joinedOnce) {
                        this.emit({ type: 'error', code: 'no_room' });
                        return;
                    }
                    // Host is away (reloading / asleep): keep trying
                    this.later(() => this.connectToHost(), 3000);
                    return;
                }
                if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                    this.setConnected(false);
                    this.later(() => {
                        this.peer?.destroy();
                        this.peer = null;
                        this.startGuest();
                    }, 3000);
                }
            });
        } else if (this.peer.open) {
            this.connectToHost();
        }
    }

    private connectToHost() {
        if (this.closed || !this.peer || !this.peer.open || !this.session) return;
        if (this.conn?.open) return;
        const conn = this.peer.connect(peerIdFor(this.session.room), { reliable: true, serialization: 'binary' });
        this.attachConnection(conn);
    }

    // ---------------------------------------------------------------- shared

    private attachConnection(conn: DataConnection) {
        const isHost = this.session?.role === 'host';
        conn.on('open', () => {
            if (isHost) {
                // Wait for the guest's hello before accepting
                return;
            }
            if (this.conn && this.conn !== conn) this.conn.close();
            this.conn = conn;
            this.lastHeard = Date.now();
            this.sendOn(conn, { t: 'hello', token: this.session!.token });
        });
        conn.on('data', raw => {
            // Sent as JSON text: binary packing would turn absent fields into null, and the game
            // logic distinguishes "undefined" from null (e.g. lane restrictions)
            let env: Envelope;
            try {
                env = typeof raw === 'string' ? JSON.parse(raw) : (raw as Envelope);
            } catch {
                return;
            }
            this.onEnvelope(conn, env);
        });
        conn.on('close', () => this.onConnectionLost(conn));
        conn.on('error', () => this.onConnectionLost(conn));
    }

    private onEnvelope(conn: DataConnection, env: Envelope) {
        if (!env || typeof env !== 'object') return;
        const isHost = this.session?.role === 'host';
        if (conn === this.conn) this.lastHeard = Date.now();

        switch (env.t) {
            case 'hello': {
                if (!isHost || !this.session) return;
                if (this.session.guestToken && this.session.guestToken !== env.token) {
                    this.sendOn(conn, { t: 'taken' });
                    setTimeout(() => conn.close(), 200);
                    return;
                }
                this.session = { ...this.session, guestToken: env.token };
                saveSession(this.session);
                if (this.conn && this.conn !== conn) this.conn.close();
                this.conn = conn;
                this.lastHeard = Date.now();
                this.sendOn(conn, { t: 'welcome' });
                this.markPeer(true);
                break;
            }
            case 'welcome':
                if (isHost) return;
                this.joinedOnce = true;
                saveSession(this.session);
                this.emit({ type: 'session', session: this.session! });
                this.markPeer(true);
                break;
            case 'taken':
                this.emit({ type: 'error', code: 'taken' });
                this.closed = true;
                break;
            case 'leave':
                this.peerConnected = false;
                saveSession(null);
                this.emit({ type: 'peer', connected: false, left: true });
                break;
            case 'ping':
                this.sendOn(conn, { t: 'pong' });
                break;
            case 'msg':
                this.emit({ type: 'message', data: env.data });
                break;
        }
    }

    private markPeer(connected: boolean) {
        if (connected) {
            this.peerConnected = true;
            this.emit({ type: 'peer', connected: true });
            const queued = this.outbox.splice(0);
            queued.forEach(data => this.write({ t: 'msg', data }));
            this.startHeartbeat();
        } else if (this.peerConnected) {
            this.peerConnected = false;
            this.emit({ type: 'peer', connected: false });
        }
    }

    private onConnectionLost(conn: DataConnection) {
        if (conn !== this.conn) return;
        this.conn = null;
        this.markPeer(false);
        if (!this.closed && this.session?.role === 'guest') this.later(() => this.startGuest(), 1500);
    }

    /** Detect a silently dead connection (phone locked, tunnel...) quickly. */
    private startHeartbeat() {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
            if (!this.conn) return;
            if (Date.now() - this.lastHeard > PEER_TIMEOUT_MS) {
                const dead = this.conn;
                dead.close();
                this.onConnectionLost(dead);
                return;
            }
            this.write({ t: 'ping' });
        }, HEARTBEAT_MS);
    }

    private onWake = () => {
        if (document.visibilityState !== 'visible' || this.closed || !this.session) return;
        if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect();
        if (this.session.role === 'guest' && !this.conn?.open) this.startGuest();
        if (this.session.role === 'host' && (!this.peer || this.peer.destroyed)) this.startHost(false);
    };

    private write(env: Envelope) {
        if (this.conn) this.sendOn(this.conn, env);
    }

    private sendOn(conn: DataConnection, env: Envelope) {
        try {
            if (conn.open) conn.send(JSON.stringify(env));
        } catch {
            // connection is going away; the close handler takes over
        }
    }

    private later(fn: () => void, ms: number) {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (!this.closed) fn();
        }, ms);
    }

    private emit(event: RelayEvent) {
        this.listeners.forEach(l => l(event));
    }

    private setConnected(connected: boolean) {
        if (this.connected === connected) return;
        this.connected = connected;
        this.emit({ type: 'status', connected });
    }
}
