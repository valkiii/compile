/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Create (owner devices only) or join (with an invite) an online room. Hands a connected
 * RelayClient to the App once both players are in the room.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { RelayClient, Role, getOwnerKey } from '../multiplayer/relayClient';
import { formatInviteCode, inviteLink, parseInvite } from '../multiplayer/invite';
import '../styles/layouts/online.css';

interface OnlineLobbyProps {
    /** From an invite link (#join=…&invite=…) */
    initialInvite?: { room: string; invite: string } | null;
    onReady: (client: RelayClient, role: Role) => void;
    onBack: () => void;
}

const ERRORS: Record<string, string> = {
    no_room: 'That room doesn\'t exist (any more). Ask for a new invite.',
    bad_invite: 'That invite code is not valid for this room. Check it, or ask for a new invite.',
    taken: 'That room already has two players.',
    rate_limited: 'Too many wrong attempts. Wait a few minutes and try again.',
    not_allowed: 'This device is not allowed to open rooms (owner key missing or wrong).',
    full: 'The server is busy. Try again later.',
    rejoin_failed: 'That room has closed.',
};

export function OnlineLobby({ initialInvite, onReady, onBack }: OnlineLobbyProps) {
    const isOwner = !!getOwnerKey();
    const clientRef = useRef<RelayClient | null>(null);
    const handedOver = useRef(false);
    const [view, setView] = useState<'choose' | 'hosting' | 'joining'>(initialInvite || !isOwner ? 'joining' : 'choose');
    const [code, setCode] = useState(initialInvite ? formatInviteCode(initialInvite.room, initialInvite.invite) : '');
    const [room, setRoom] = useState<string | null>(null);
    const [invite, setInvite] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const freshClient = () => {
        if (clientRef.current && !handedOver.current) clientRef.current.dispose();
        const client = new RelayClient();
        client.on(event => {
            if (event.type === 'status') setConnected(event.connected);
            if (event.type === 'session') {
                setRoom(event.session.room);
                if (event.session.invite) setInvite(event.session.invite);
            }
            if (event.type === 'error') {
                setError(ERRORS[event.code] ?? `Error: ${event.code}`);
                setJoining(false);
            }
            if (event.type === 'peer' && event.connected && client.session && !handedOver.current) {
                handedOver.current = true;
                onReady(client, client.session.role);
            }
        });
        clientRef.current = client;
        return client;
    };

    // Leaving the lobby without a match closes the room (a handed-over client lives on in the App)
    useEffect(() => () => {
        if (!handedOver.current) clientRef.current?.leave();
    }, []);

    const joinWith = (value: string) => {
        setError(null);
        const parsed = parseInvite(value);
        if (!parsed) {
            setError('Paste the invite link, or type the full code (like K7QX-8F3KM2PQ).');
            return;
        }
        setJoining(true);
        freshClient().join(parsed.room, parsed.invite);
    };

    // Opened from an invite link: join right away
    useEffect(() => {
        if (initialInvite) joinWith(formatInviteCode(initialInvite.room, initialInvite.invite));
    }, []);

    const createRoom = () => {
        const ownerKey = getOwnerKey();
        if (!ownerKey) return;
        setError(null);
        setView('hosting');
        freshClient().create(ownerKey);
    };

    const link = room && invite ? inviteLink(room, invite) : '';

    const share = async () => {
        if (!link) return;
        const text = 'Play Compile with me!';
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Compile', text, url: link });
                return;
            }
        } catch {
            return; // share sheet dismissed
        }
        try {
            await navigator.clipboard.writeText(`${text} ${link}`);
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
                    <p className="online-intro">Open a private room and send the invite link to your friend. Only people with that link can join.</p>
                    <button className="btn btn-start" onClick={createRoom}>Create room</button>
                    <div className="online-divider"><span>or</span></div>
                    <button className="btn" onClick={() => setView('joining')}>Join with an invite</button>
                </div>
            )}

            {view === 'hosting' && (
                <div className="online-card">
                    <span className="online-label">Invite code</span>
                    <div className="online-code online-code-long">{room && invite ? formatInviteCode(room, invite) : '····-········'}</div>
                    <button className="btn btn-start" onClick={share} disabled={!link}>
                        {copied ? 'Link copied' : 'Send invite link'}
                    </button>
                    <p className="online-waiting">
                        <span className="online-status-dot" />
                        {link ? 'Waiting for your friend to join…' : connected ? 'Opening room…' : 'Connecting to your server…'}
                    </p>
                    <p className="online-hint">Only someone with this link or code can join, and only one person. You host the game: keep this page open while you play.</p>
                </div>
            )}

            {view === 'joining' && (
                <div className="online-card">
                    {!isOwner && !initialInvite && (
                        <p className="online-intro">Online games are invite-only. Open the invite link you received, or paste it here.</p>
                    )}
                    <label className="online-label" htmlFor="invite-code">Invite link or code</label>
                    <input
                        id="invite-code"
                        className="online-code-input online-code-input-long"
                        value={code}
                        maxLength={300}
                        autoCapitalize="characters"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="K7QX-8F3KM2PQ"
                        onChange={e => setCode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && joinWith(code)}
                    />
                    <button className="btn btn-start" onClick={() => joinWith(code)} disabled={!code.trim() || joining}>
                        {joining ? 'Connecting…' : 'Join'}
                    </button>
                    {joining && (
                        <>
                            <p className="online-waiting">
                                <span className="online-status-dot" />
                                {connected ? 'Joining the room…' : 'Connecting to the game server…'}
                            </p>
                            <button className="btn" onClick={() => { clientRef.current?.dispose(); clientRef.current = null; setJoining(false); }}>
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            )}

            {error && <p className="online-error">{error}</p>}
        </div>
    );
}
