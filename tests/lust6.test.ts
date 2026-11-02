/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lust-6: "Discard 1 card. Your opponent plays 1 card face-down in this line."
 * The forced play must land in Lust-6's line, face-down, on the opponent's side.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GameState, PlayedCard } from '../types';
import { installLocalStorageShim, seedProtocols, loadGameModules, buildDispatchers, buildPhaseManager, NOOP_ENQUEUE } from './helpers/headlessGame';

let mods: Awaited<ReturnType<typeof loadGameModules>>;
let realCard: (protocol: string, value: number, faceUp?: boolean) => PlayedCard;

beforeAll(async () => {
    installLocalStorageShim();
    seedProtocols(['Lust', 'Envy', 'Nova', 'Fire', 'Metal', 'Water']);
    mods = await loadGameModules();
    const { getAllCustomProtocolCards } = await import('../logic/customProtocols/cardFactory');
    const all = getAllCustomProtocolCards();
    let n = 0;
    realCard = (protocol, value, faceUp = true) => ({ ...all.find(c => c.protocol === protocol && c.value === value)!, id: `${protocol}-${value}-${n++}`, isFaceUp: faceUp } as PlayedCard);
});

function base(turn: 'player' | 'opponent'): GameState {
    const s = mods.stateManager.createInitialState(['Envy', 'Lust', 'Nova'], ['Fire', 'Metal', 'Water'], true, turn);
    const filler = () => realCard('Fire', 2, false);
    return { ...s, turn, phase: 'action', player: { ...s.player, deck: Array.from({ length: 8 }, filler) }, opponent: { ...s.opponent, deck: Array.from({ length: 8 }, filler) } };
}

describe('Lust-6', () => {
    it('player plays it in the middle line: the AI plays a hand card face-down into the middle line', () => {
        const lust6 = realCard('Lust', 6);
        let s = base('player');
        s = { ...s, player: { ...s.player, hand: [lust6, realCard('Envy', 2)] }, opponent: { ...s.opponent, hand: [realCard('Fire', 4), realCard('Metal', 3)] } };
        let r = mods.resolvers.playCard(s, lust6.id, 1, true, 'player');
        s = r.newState;
        expect(s.actionRequired?.type).toBe('discard');
        s = mods.resolvers.discardCards(s, [s.player.hand[0].id], 'player');
        // the AI answers its prompt
        let guard = 0;
        while (s.actionRequired && s.actionRequired.actor === 'opponent' && guard++ < 5) {
            s = mods.aiManager.handleRequiredActionSync(s, 'normal', buildDispatchers(mods.resolvers), buildPhaseManager(mods.phaseManager), NOOP_ENQUEUE);
        }
        expect(s.opponent.lanes[1].length).toBe(1);
        expect(s.opponent.lanes[1][0].isFaceUp).toBe(false);
        expect(s.opponent.hand.length).toBe(1);
        expect(s.opponent.lanes[0].length + s.opponent.lanes[2].length).toBe(0);
    });

    it('AI plays it in the right line: the player is asked to play a card face-down into the right line', async () => {
        const lust6 = realCard('Lust', 6);
        let s = mods.stateManager.createInitialState(['Fire', 'Metal', 'Water'], ['Envy', 'Nova', 'Lust'], true, 'opponent');
        s = { ...s, phase: 'action', opponent: { ...s.opponent, hand: [lust6, realCard('Envy', 2)] }, player: { ...s.player, hand: [realCard('Fire', 4), realCard('Metal', 3)] } };
        let r = mods.resolvers.playCard(s, lust6.id, 2, true, 'opponent');
        s = r.newState;
        const { executeOnPlayEffect } = await import('../logic/effectExecutor');
        if (s.queuedEffect) {
            const q = s.queuedEffect;
            s = executeOnPlayEffect(q.card, q.laneIndex, { ...s, queuedEffect: undefined }, { cardOwner: 'opponent', actor: 'opponent', currentTurn: 'opponent', opponent: 'player', triggerType: 'play' }).newState;
        }
        let guard = 0;
        while (s.actionRequired?.actor === 'opponent' && guard++ < 5) {
            s = mods.aiManager.handleRequiredActionSync(s, 'normal', buildDispatchers(mods.resolvers), buildPhaseManager(mods.phaseManager), NOOP_ENQUEUE);
        }
        expect(s.actionRequired?.type).toBe('select_card_from_hand_to_play');
        expect(s.actionRequired?.actor).toBe('player');
        expect((s.actionRequired as any).forcedLaneIndex).toBe(2);
        // player picks a card: it is placed face-down in the right line
        s = mods.resolvers.selectHandCardForAction(s, s.player.hand[0].id);
        expect((s.actionRequired as any).preSelectedLane ?? (s.actionRequired as any).validLanes?.[0]).toBe(2);
    });
});
