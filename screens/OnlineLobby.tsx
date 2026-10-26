/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Create or join an online room. Hands a connected RelayClient to the App once both
 * players are in the room.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { RelayClient, Role } from '../multiplayer/relayClient';
import '../styles/layouts/online.css';

interface OnlineLobbyProps {
    initialJoinCode?: string | null;
    onReady: (client: RelayClient, role: Role) => void;
    onBack: () => void;
}

const ERRORS: Record<string, string> = {
    no_room: 'No room with that code. Check it with your rival.',
    taken: 'That room already has two players.',
    network: 'Could not reach the matchmaking service. Check your connection.',
};

export function OnlineLobby({ initialJoinCode, onReady, onBack }: OnlineLobbyProps) {
    const clientRef = useRef<RelayClient | null>(null);
    const handedOver = useRef(false);
    const [view, setView] = useState<'choose' | 'hosting' | 'joining'>(initialJoinCode ? 'joining' : 'choose');
    const [code, setCode] = useState(initialJoinCode?.toUpperCase() ?? '');
    const [room, setRoom] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const getClient = () => {
        if (!clientRef.current) {
            const client = new RelayClient();
            client.on(event => {
                if (event.type === 'status') setConnected(event.connected);
                if (event.type === 'session') setRoom(event.session.room);
                if (event.type === 'error') setError(ERRORS[event.code] ?? `Error: ${event.code}`);
                if (event.type === 'peer' && event.connected && client.session && !handedOver.current) {
                    handedOver.current = true;
                    onReady(client, client.session.role);
                }
            });
            clientRef.current = client;
        }
        return clientRef.current;
    };

    // Leaving the lobby without a match closes the socket (a handed-over client lives on in the App)
    useEffect(() => () => {
        if (!handedOver.current) clientRef.current?.leave();
    }, []);

    // Opened from an invite link: join right away
    useEffect(() => {
        if (initialJoinCode && initialJoinCode.length === 4) getClient().join(initialJoinCode);
    }, [initialJoinCode]);

    const createRoom = () => {
        setError(null);
        setView('hosting');
        getClient().create();
    };

    const joinRoom = () => {
        setError(null);
        if (code.trim().length !== 4) {
            setError('Room codes have 4 characters.');
            return;
        }
        getClient().join(code.trim());
    };

    const inviteUrl = (() => {
        if (!room) return '';
        const params = new URLSearchParams(window.location.search);
        params.set('join', room);
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    })();

    const share = async () => {
        if (!inviteUrl) return;
        const text = `Play Compile with me! Room ${room}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Compile', text, url: inviteUrl });
                return;
            }
        } catch {
            return; // share sheet dismissed
        }
        try {
            await navigator.clipboard.writeText(`${text}: ${inviteUrl}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard blocked: the code is on screen anyway
        }
    };

    return (
        <div className="screen online-lobby">
            <Header title="Play Online" onBack={onBack} />
            {view === 'choose' && (
                <div className="online-card">
                    <p className="online-intro">Play a friend anywhere: one of you creates a room, the other joins with the code or link.</p>
                    <button className="btn btn-start" onClick={createRoom}>Create room</button>
                    <div className="online-divider"><span>or</span></div>
                    <button className="btn" onClick={() => setView('joining')}>Join with a code</button>
                </div>
            )}

            {view === 'hosting' && (
                <div className="online-card">
                    <span className="online-label">Room code</span>
                    <div className="online-code">{room ?? '····'}</div>
                    <button className="btn btn-start" onClick={share} disabled={!room}>
                        {copied ? 'Link copied' : 'Send invite link'}
                    </button>
                    <p className="online-waiting">
                        <span className="online-status-dot" />
                        {room ? 'Waiting for your rival to join…' : 'Opening room…'}
                    </p>
                    <p className="online-hint">You host the game: keep this page open in the foreground while you play.</p>
                </div>
            )}

            {view === 'joining' && (
                <div className="online-card">
                    <label className="online-label" htmlFor="room-code">Room code</label>
                    <input
                        id="room-code"
                        className="online-code-input"
                        value={code}
                        maxLength={4}
                        autoCapitalize="characters"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                        placeholder="K7QX"
                        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && joinRoom()}
                    />
                    <button className="btn btn-start" onClick={joinRoom} disabled={code.length !== 4}>Join</button>
                    {room && (
                        <p className="online-waiting"><span className="online-status-dot" />Joined room {room}. Waiting for the host…</p>
                    )}
                </div>
            )}

            {error && <p className="online-error">{error}</p>}
        </div>
    );
}
