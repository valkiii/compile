/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contextual hints shown during the guided tutorial game. Each hint appears once per game,
 * when its situation first comes up, and stays until dismissed or the situation passes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GameState } from '../types';

interface CoachHintsProps {
    gameState: GameState;
    selectedCardId: string | null;
    isAnimating: boolean;
}

type Hint = { id: string; title: string; text: string };

function pickHint(state: GameState, selectedCardId: string | null): Hint | null {
    const { turn, phase, actionRequired, player, compilableLanes, controlCardHolder } = state;

    if (actionRequired?.actor === 'player') {
        if (actionRequired.type === 'discard') {
            return { id: 'discard', title: 'Discard', text: 'Tap cards in your hand to discard them. The prompt above your hand says how many.' };
        }
        return { id: 'effect', title: 'Make a choice', text: 'A card effect needs your input. Read the prompt above your hand: glowing cards or lines are valid targets.' };
    }
    if (turn === 'player' && phase === 'compile' && compilableLanes.length > 0 && !actionRequired) {
        return { id: 'compile', title: 'Compile!', text: 'You have 10+ in a line and more than the AI. Tap the glowing line to compile it: every card in it is deleted and the protocol flips to Compiled.' };
    }
    if (turn === 'player' && phase === 'action' && !actionRequired) {
        if (controlCardHolder === 'player') {
            return { id: 'control', title: 'You have Control', text: 'You lead in 2 lines, so you hold the C coin. The next time you compile or refresh you may rearrange protocols.' };
        }
        if (selectedCardId) {
            return { id: 'play', title: 'Pick a line', text: 'The line matching the card\'s protocol plays it face-up and fires its middle command. Any other line plays it face-down as a plain 2. "Face-down" on the matching line also works.' };
        }
        if (player.hand.length <= 1) {
            return { id: 'refresh', title: 'Running low', text: 'Refresh draws you back up to 5 cards, but it uses your whole turn.' };
        }
        return { id: 'select', title: 'Your turn', text: 'Tap a card in your hand to select it and read its text. Aim for 10+ in a line to compile it.' };
    }
    if (turn === 'opponent') {
        return { id: 'ai-turn', title: 'AI turn', text: 'The AI is playing. Its moves pop up as messages, and "Log" shows the full history.' };
    }
    return null;
}

export const CoachHints: React.FC<CoachHintsProps> = ({ gameState, selectedCardId, isAnimating }) => {
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
    const hint = useMemo(() => pickHint(gameState, selectedCardId), [gameState, selectedCardId]);

    // A hint that has been shown and then passed counts as learned
    const [lastShown, setLastShown] = useState<string | null>(null);
    useEffect(() => {
        const visibleId = hint && !dismissed.has(hint.id) ? hint.id : null;
        if (lastShown && lastShown !== visibleId) {
            setDismissed(prev => new Set(prev).add(lastShown));
        }
        setLastShown(visibleId);
    }, [hint?.id]);

    if (!hint || isAnimating || dismissed.has(hint.id)) return null;

    return (
        <div className="coach-hint" role="status">
            <div className="coach-hint-title">Tutorial · {hint.title}</div>
            <div className="coach-hint-text">{hint.text}</div>
            <button className="coach-hint-dismiss" onClick={() => setDismissed(prev => new Set(prev).add(hint.id))}>Got it</button>
        </div>
    );
};
