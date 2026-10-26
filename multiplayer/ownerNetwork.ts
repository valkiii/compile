/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Is this device on the owner's tailnet? Only then can it reach the relay's private door,
 * and only then does the site offer online play (guests still join through invite links).
 */

import { relayUrl } from './relayClient';

let pending: Promise<boolean> | null = null;

export function checkOwnerNetwork(timeoutMs = 4000): Promise<boolean> {
    if (pending) return pending;
    pending = new Promise<boolean>(resolve => {
        let settled = false;
        let ws: WebSocket | null = null;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            try {
                ws?.close();
            } catch {
                // ignore
            }
            if (!ok) pending = null; // re-check next time (Tailscale may get switched on)
            resolve(ok);
        };
        try {
            ws = new WebSocket(relayUrl('host'));
        } catch {
            finish(false);
            return;
        }
        ws.onopen = () => ws?.send('{"t":"ping"}');
        ws.onmessage = ev => finish(String(ev.data).includes('"pong"'));
        ws.onerror = () => finish(false);
        ws.onclose = () => finish(false);
        setTimeout(() => finish(false), timeoutMs);
    });
    return pending;
}
