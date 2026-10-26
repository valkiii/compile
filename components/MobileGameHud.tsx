/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phone-only HUD: replaces the desktop "Mainframe" sidebar and the deck/trash column.
 * The mini piles keep the `deck-pile` / `trash-pile` + `pile-card-wrapper` class names so
 * AnimatedCard can still find draw/discard origins in the DOM.
 */

import React, { useEffect, useState } from 'react';
import { GamePhase, Player, PlayerState } from '../types';

const PHASE_LABELS: Record<GamePhase, string> = {
    start: 'Start',
    control: 'Control',
    compile: 'Compile',
    action: 'Action',
    hand_limit: 'Hand limit',
    end: 'End',
};

interface MiniPileProps {
    owner: Player;
    kind: 'deck' | 'trash';
    count: number;
    warn?: boolean;
    onClick?: () => void;
}

export const MiniPile: React.FC<MiniPileProps> = ({ owner, kind, count, warn, onClick }) => (
    <button className={`mini-pile ${kind}-pile ${owner} ${warn ? 'warn' : ''}`} onClick={onClick} aria-label={`${owner} ${kind}: ${count}`}>
        <span className="pile-card-wrapper" />
        <span className="mini-pile-label">{kind === 'deck' ? 'Deck' : 'Trash'}</span>
        <span className="mini-pile-count">{count}</span>
    </button>
);

interface MobileTopBarProps {
    opponent: PlayerState;
    opponentName?: string;
    difficultyLabel: string;
    turn: Player;
    phase: GamePhase;
    onQuit: () => void;
    onShowLog: () => void;
    onShowHelp: () => void;
    onPileClick: (owner: Player) => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({ opponent, opponentName = 'AI', difficultyLabel, turn, phase, onQuit, onShowLog, onShowHelp, onPileClick }) => {
    // Quitting a game by accident on a phone is easy, so it takes two taps
    const [confirmQuit, setConfirmQuit] = useState(false);
    useEffect(() => {
        if (!confirmQuit) return;
        const t = setTimeout(() => setConfirmQuit(false), 3000);
        return () => clearTimeout(t);
    }, [confirmQuit]);

    return (
        <div className="mobile-top-bar">
            <button
                className={`hud-btn hud-quit ${confirmQuit ? 'confirm' : ''}`}
                onClick={() => (confirmQuit ? onQuit() : setConfirmQuit(true))}
                aria-label="Quit game"
            >
                {confirmQuit ? 'Quit?' : '✕'}
            </button>
            <div className="hud-opponent">
                <span className="hud-opponent-name" title={`${opponentName} (${difficultyLabel})`}>{opponentName}</span>
                <span className="hud-opponent-hand" title="Cards in opponent hand">✋ {opponent.hand.length}</span>
                <MiniPile owner="opponent" kind="deck" count={opponent.deck.length} onClick={() => onPileClick('opponent')} />
                <MiniPile owner="opponent" kind="trash" count={opponent.discard.length} onClick={() => onPileClick('opponent')} />
            </div>
            <div className={`hud-turn ${turn}-turn`}>
                <span className="hud-turn-who">{turn === 'player' ? 'You' : opponentName}</span>
                <span className="hud-turn-phase">{PHASE_LABELS[phase] ?? phase}</span>
            </div>
            <button className="hud-btn" onClick={onShowLog} aria-label="Game log">Log</button>
            <button className="hud-btn" onClick={onShowHelp} aria-label="Quick rules">?</button>
        </div>
    );
};
