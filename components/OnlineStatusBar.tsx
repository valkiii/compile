/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Connection banner for online games: only visible when something needs attention.
 */

import React, { useEffect, useState } from 'react';
import { RelayClient } from '../multiplayer/relayClient';

interface OnlineStatusBarProps {
    client: RelayClient;
    waitingForHost?: boolean;
}

export const OnlineStatusBar: React.FC<OnlineStatusBarProps> = ({ client, waitingForHost }) => {
    const [connected, setConnected] = useState(client.connected);
    const [peer, setPeer] = useState(client.peerConnected);
    const [peerLeft, setPeerLeft] = useState(false);

    useEffect(() => client.on(event => {
        if (event.type === 'status') setConnected(event.connected);
        if (event.type === 'peer') {
            setPeer(event.connected);
            setPeerLeft(!!event.left);
        }
    }), [client]);

    // Peer-to-peer: the direct link to the rival is what matters; the broker only matters while it's down
    let message: string | null = null;
    if (peerLeft) message = 'Your rival left the game.';
    else if (!peer && !connected) message = 'Connection lost. Reconnecting…';
    else if (!peer) message = 'Rival disconnected. Waiting for them to come back…';
    else if (waitingForHost) message = 'Loading the game from your rival…';

    if (!message) return null;
    return (
        <div className={`online-status-bar ${peerLeft || (!peer && !connected) ? 'bad' : ''}`} role="status">
            <span className="online-status-dot" />
            {message}
        </div>
    );
};
