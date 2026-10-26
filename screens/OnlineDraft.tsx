/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Protocol draft between two online players (1-2-2-1, host first).
 * The host owns the draft state and broadcasts it; the guest sends its picks.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from '../components/Header';
import { getAllCustomProtocolCards } from '../logic/customProtocols/cardFactory';
import { loadCustomProtocols } from '../logic/customProtocols/storage';
import { isSystemProtocol } from './CustomProtocolCreator/ProtocolList';
import { invalidateCardCache } from '../utils/gameLogic';
import { Card as CardData } from '../data/cards';
import { protocolTileUrl } from '../data/cardArt';
import { RelayClient, Role } from '../multiplayer/relayClient';
import { DraftState, onlineDraftSteps, OnlineGameSetup, isOnlineMessage } from '../multiplayer/messages';
import '../styles/layouts/protocol-selection.css';
import '../styles/layouts/online.css';

interface OnlineDraftProps {
    client: RelayClient;
    role: Role;
    useControl: boolean;
    /** Host only: called when the draft is complete (the guest is moved by the App on 'start') */
    onStart: (setup: OnlineGameSetup) => void;
    onLeave: () => void;
}

const DEFAULT_OFF = ['Fan-Content', 'Main 2', 'Aux 2'];

function useSystemCards(): CardData[] {
    return useMemo(() => {
        invalidateCardCache();
        // Only official protocols: both phones must have identical card definitions
        const system = new Set(loadCustomProtocols().filter(p => isSystemProtocol(p)).map(p => p.name));
        return getAllCustomProtocolCards().filter(c => system.has(c.protocol));
    }, []);
}

export function OnlineDraft({ client, role, useControl, onStart, onLeave }: OnlineDraftProps) {
    const isHost = role === 'host';
    const cards = useSystemCards();
    const categoryOf = (protocol: string) => cards.find(c => c.protocol === protocol)?.category ?? '';
    const allCategories = useMemo(() => Array.from(new Set(cards.map(c => c.category))).sort(), [cards]);
    const allProtocols = useMemo(() => Array.from(new Set(cards.map(c => c.protocol))).sort(), [cards]);

    const [draft, setDraft] = useState<DraftState>(() => ({
        // Coin toss at the start of the draft: the winner picks first and starts the game
        first: Math.random() < 0.5 ? 'host' : 'guest',
        step: 0,
        hostPicks: [],
        guestPicks: [],
        categories: allCategories.filter(c => !DEFAULT_OFF.includes(c)),
    }));
    const [selection, setSelection] = useState<string[]>([]);
    // The guest only knows the toss result once the host's draft arrives
    const [synced, setSynced] = useState(isHost);
    const [preview, setPreview] = useState<string | null>(null);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const startedRef = useRef(false);

    const steps = onlineDraftSteps(draft.first);
    const step = steps[draft.step];
    const myTurn = !!step && step.who === role;
    const myPicks = isHost ? draft.hostPicks : draft.guestPicks;
    const theirPicks = isHost ? draft.guestPicks : draft.hostPicks;
    const taken = new Set([...draft.hostPicks, ...draft.guestPicks]);
    const visible = allProtocols.filter(p => draft.categories.includes(categoryOf(p)));

    // Host: apply a pick (own or the guest's) and broadcast
    const applyPick = (who: 'host' | 'guest', protocols: string[]) => {
        const current = draftRef.current;
        const s = onlineDraftSteps(current.first)[current.step];
        if (!s || s.who !== who || protocols.length !== s.picks) return;
        const taken = new Set([...current.hostPicks, ...current.guestPicks]);
        if (protocols.some(p => taken.has(p) || !allProtocols.includes(p)) || new Set(protocols).size !== protocols.length) return;
        const next: DraftState = {
            ...current,
            step: current.step + 1,
            hostPicks: who === 'host' ? [...current.hostPicks, ...protocols] : current.hostPicks,
            guestPicks: who === 'guest' ? [...current.guestPicks, ...protocols] : current.guestPicks,
        };
        setDraft(next);
    };

    // Host: broadcast every draft change, start the game when the draft is complete
    useEffect(() => {
        if (!isHost) return;
        client.send({ k: 'draft', draft });
        if (draft.step >= steps.length && !startedRef.current) {
            startedRef.current = true;
            const setup: OnlineGameSetup = {
                gameId: uuidv4(),
                hostProtocols: draft.hostPicks,
                guestProtocols: draft.guestPicks,
                startingPlayer: draft.first === 'host' ? 'player' : 'opponent',
                useControl,
            };
            setTimeout(() => {
                client.send({ k: 'start', game: setup });
                onStart(setup);
            }, 900);
        }
    }, [draft, isHost]);

    useEffect(() => {
        const off = client.on(event => {
            if (event.type === 'peer' && event.connected && isHost) client.send({ k: 'draft', draft: draftRef.current });
            if (event.type !== 'message' || !isOnlineMessage(event.data)) return;
            const msg = event.data;
            if (isHost && msg.k === 'draftPick') applyPick('guest', msg.protocols);
            if (isHost && msg.k === 'sync') client.send({ k: 'draft', draft: draftRef.current });
            if (!isHost && msg.k === 'draft') {
                setDraft(msg.draft);
                setSynced(true);
            }
            // The guest's switch to the game ('start') is routed by the App
        });
        if (!isHost) client.send({ k: 'sync' });
        return off;
    }, [client, isHost]);

    // Selection is cleared whenever the turn passes
    useEffect(() => setSelection([]), [draft.step]);

    const toggle = (protocol: string) => {
        setPreview(protocol);
        if (!myTurn || taken.has(protocol)) return;
        setSelection(prev => {
            if (prev.includes(protocol)) return prev.filter(p => p !== protocol);
            const next = [...prev, protocol];
            return next.length > step.picks ? next.slice(next.length - step.picks) : next;
        });
    };

    const randomPick = () => {
        if (!myTurn || !step) return;
        const pool = visible.filter(p => !taken.has(p));
        const picks: string[] = [];
        while (picks.length < step.picks && pool.length > 0) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        setSelection(picks);
        setPreview(picks[picks.length - 1] ?? null);
    };

    const confirm = () => {
        if (!myTurn || selection.length !== step.picks) return;
        if (isHost) applyPick('host', selection);
        else client.send({ k: 'draftPick', protocols: selection });
        setSelection([]);
    };

    const toggleCategory = (category: string) => {
        if (!isHost || draft.step > 0) return;
        setDraft(d => ({
            ...d,
            categories: d.categories.includes(category) ? d.categories.filter(c => c !== category) : [...d.categories, category],
        }));
    };

    const iWonToss = draft.first === role;
    const status = !step
        ? 'Draft complete. Starting the game…'
        : myTurn
            ? `Your pick: choose ${step.picks} protocol${step.picks > 1 ? 's' : ''} (${selection.length}/${step.picks})`
            : `Your rival is picking ${step.picks} protocol${step.picks > 1 ? 's' : ''}…`;

    const previewCards = preview ? cards.filter(c => c.protocol === preview).sort((a, b) => a.value - b.value) : [];

    return (
        <div className="screen protocol-selection-screen online-draft">
            <Header title="Online Draft" onBack={onLeave} />
            <div className="online-draft-picks">
                <div className="player-protocols-area">
                    <h3>You</h3>
                    {myPicks.map(p => <div key={p} className={`protocol-display-card player card-protocol-${p.toLowerCase()}`}>{p}</div>)}
                </div>
                <div className="opponent-protocols-area">
                    <h3>Rival</h3>
                    {theirPicks.map(p => <div key={p} className={`protocol-display-card opponent card-protocol-${p.toLowerCase()}`}>{p}</div>)}
                </div>
            </div>

            <div className="protocol-grid-container">
                {synced && draft.step === 0 && (
                    <p className="online-toss">🪙 Coin toss: {iWonToss ? 'you won! You pick first and start the game.' : 'your rival won. They pick first and start the game.'}</p>
                )}
                <p className={myTurn ? 'online-your-turn' : ''}>{status}</p>
                <div className="category-filters">
                    {allCategories.map(category => (
                        <label key={category} className="category-filter-item">
                            <input
                                type="checkbox"
                                checked={draft.categories.includes(category)}
                                disabled={!isHost || draft.step > 0}
                                onChange={() => toggleCategory(category)}
                            />
                            <span>{category}</span>
                        </label>
                    ))}
                </div>
                <div className="protocol-grid-scroll-wrapper">
                    <div className="protocol-grid">
                        {visible.map(protocol => {
                            const classes = ['protocol-card', `card-protocol-${protocol.toLowerCase()}`];
                            if (selection.includes(protocol)) classes.push('selected');
                            if (taken.has(protocol)) classes.push('chosen');
                            const tile = protocolTileUrl(protocol);
                            if (tile) classes.push('has-tile-art');
                            return (
                                <div
                                    key={protocol}
                                    className={classes.join(' ')}
                                    role="button"
                                    style={tile ? ({ '--tile-art': `url(${tile})` } as React.CSSProperties) : undefined}
                                    aria-disabled={taken.has(protocol) || !myTurn}
                                    onClick={() => toggle(protocol)}
                                >
                                    <span className="protocol-category-label">{categoryOf(protocol)}</span>
                                    <span className="protocol-name" style={{ fontSize: protocol.length > 10 ? '0.65em' : '1em' }}>{protocol}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {myTurn && (
                    <div className="draft-actions">
                        <button className="btn btn-random" onClick={randomPick} title="Pick at random (tap again to reroll)">🎲 Random</button>
                        <button className="btn" onClick={confirm} disabled={selection.length !== step.picks}>Confirm Selection</button>
                    </div>
                )}
            </div>

            {previewCards.length > 0 && (
                <div className="selected-protocol-cards-container">
                    <div className="protocol-text-list">
                        <button className="protocol-text-close" aria-label="Hide cards" onClick={() => setPreview(null)}>✕</button>
                        <h4>{preview}</h4>
                        {previewCards.map(card => (
                            <div key={card.value} className="protocol-text-row">
                                <span className="protocol-text-value">{card.value}</span>
                                <div className="protocol-text-commands">
                                    {[card.top, card.middle, card.bottom].filter(Boolean).map((text, i) => (
                                        <span key={i} dangerouslySetInnerHTML={{ __html: text }} />
                                    ))}
                                    {!card.top && !card.middle && !card.bottom && <span className="muted">No commands</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
