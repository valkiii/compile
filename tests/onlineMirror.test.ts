/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../logic/game/stateManager';
import { actionFromGuest, decisionKey, isDecisionValidFor, mirror, stateForGuest } from '../multiplayer/mirror';
import { GameState, PlayedCard } from '../types';

const card = (id: string, protocol = 'Fire', value = 3, extra: Partial<PlayedCard> = {}): PlayedCard =>
    ({ id, protocol, value, top: '', middle: 'Flip 1 card.', bottom: '', isFaceUp: true, ...extra } as PlayedCard);

const base = (): GameState => {
    const s = createInitialState(['Fire', 'Water', 'Life'], ['Death', 'Metal', 'Light'], true, 'player');
    return {
        ...s,
        player: { ...s.player, hand: [card('h1'), card('h2', 'Water', 1)], lanes: [[card('p1')], [], []] },
        opponent: { ...s.opponent, hand: [card('o1', 'Death', 4)], lanes: [[], [card('x1', 'Metal', 2, { isFaceUp: false })], []] },
    };
};

describe('online mirror', () => {
    it('swaps the two sides and absolute player fields', () => {
        const s: GameState = {
            ...base(),
            turn: 'opponent',
            controlCardHolder: 'player',
            actionRequired: {
                type: 'select_lane_for_shift', cardToShiftId: 'p1', cardOwner: 'player', originalLaneIndex: 0, actor: 'opponent',
            } as GameState['actionRequired'],
        };
        const m = mirror(s);
        expect(m.player.protocols).toEqual(['Death', 'Metal', 'Light']);
        expect(m.opponent.lanes[0][0].id).toBe('p1');
        expect(m.turn).toBe('player');
        expect(m.controlCardHolder).toBe('opponent');
        expect((m.actionRequired as { actor: string; cardOwner: string }).actor).toBe('player');
        expect((m.actionRequired as { actor: string; cardOwner: string }).cardOwner).toBe('opponent');
    });

    it('is its own inverse', () => {
        const s = base();
        expect(mirror(mirror(s))).toEqual(s);
    });

    it('leaves relative effect definitions alone', () => {
        const s: GameState = {
            ...base(),
            actionRequired: {
                type: 'select_card_to_flip', actor: 'opponent', targetFilter: { owner: 'opponent' },
                followUpEffect: { params: { action: 'draw', targetOwner: 'opponent' } },
            } as unknown as GameState['actionRequired'],
        };
        const a = mirror(s).actionRequired as unknown as { actor: string; targetFilter: { owner: string }; followUpEffect: { params: { targetOwner: string } } };
        expect(a.actor).toBe('player');
        expect(a.targetFilter.owner).toBe('opponent');
        expect(a.followUpEffect.params.targetOwner).toBe('opponent');
    });

    it("hides the host's hand and deck from the guest but not the guest's own hand", () => {
        const g = stateForGuest(base());
        expect(g.opponent.hand[0].id).toBe('h1');
        expect(g.opponent.hand[0].protocol).toBe('Hidden');
        expect(g.player.hand[0].protocol).toBe('Death');
        expect(g.opponent.deck.every(c => c.protocol === 'Hidden')).toBe(true);
    });

    it('flips log wording for the guest', () => {
        const s = { ...base(), log: [{ player: 'player' as const, message: 'Player plays Fire-3. Opponent discards 1.' }] };
        expect(stateForGuest(s).log[0]).toEqual({ player: 'opponent', message: 'Opponent plays Fire-3. Player discards 1.' });
    });

    it('translates control choices back to the host frame', () => {
        expect(actionFromGuest({ type: 'resolveControlMechanicPrompt', choice: 'player' })).toEqual({ type: 'resolveControlMechanicPrompt', choice: 'opponent' });
        expect(actionFromGuest({ type: 'resolveControlMechanicPrompt', choice: 'skip' })).toEqual({ type: 'resolveControlMechanicPrompt', choice: 'skip' });
    });

    it('accepts only moves that fit the pending prompt', () => {
        const lanePrompt = { ...base(), actionRequired: { type: 'select_lane_for_shift', actor: 'opponent' } as GameState['actionRequired'] };
        expect(isDecisionValidFor(lanePrompt, { type: 'selectLane', laneIndex: 1 })).toBe(true);
        expect(isDecisionValidFor(lanePrompt, { type: 'shiftCard', cardId: 'p1' })).toBe(false);

        const cardPrompt = { ...base(), actionRequired: { type: 'select_card_from_other_lanes_to_delete', actor: 'opponent' } as unknown as GameState['actionRequired'] };
        expect(isDecisionValidFor(cardPrompt, { type: 'deleteCard', cardId: 'p1' })).toBe(true);
        expect(isDecisionValidFor(cardPrompt, { type: 'selectLane', laneIndex: 0 })).toBe(false);

        const action = { ...base(), turn: 'opponent' as const, phase: 'action' as const, actionRequired: null };
        expect(isDecisionValidFor(action, { type: 'fillHand' })).toBe(true);
        expect(isDecisionValidFor(action, { type: 'compile', laneIndex: 0 })).toBe(false);
    });

    it('decision keys change when the game moves on', () => {
        const s = base();
        const later = { ...s, log: [...s.log, { player: 'player' as const, message: 'x' }] };
        expect(decisionKey(s)).not.toBe(decisionKey(later));
        expect(decisionKey(s)).toBe(decisionKey({ ...s }));
    });
});
