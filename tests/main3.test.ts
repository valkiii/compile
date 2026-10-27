/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Main 3 protocols (Envy ... Nova): value modifiers, control, compiling from an effect,
 * swaps, computed targets and the new play destinations, using the real protocol JSONs.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EffectContext, GameState, PlayedCard, Player } from '../types';
import { installLocalStorageShim, seedProtocols, loadGameModules } from './helpers/headlessGame';

const MAIN3 = ['Envy', 'Gluttony', 'Greed', 'Lust', 'Pride', 'Sloth', 'Wrath', 'Ambush', 'Fulcrum', 'Overwhelm', 'Momentum', 'Nova'];

let mods: Awaited<ReturnType<typeof loadGameModules>>;
let run: typeof import('../logic/customProtocols/effectInterpreter').executeCustomEffect;
let react: typeof import('../logic/game/reactiveEffectProcessor').processReactiveEffects;
let resolveLane: typeof import('../logic/effects/actions/main3Executor').resolveCustomLaneChoice;
let realCard: (protocol: string, value: number, faceUp?: boolean) => PlayedCard;

beforeAll(async () => {
    installLocalStorageShim();
    seedProtocols([...MAIN3, 'Fire', 'Metal', 'Spirit', 'Water']);
    mods = await loadGameModules();
    run = (await import('../logic/customProtocols/effectInterpreter')).executeCustomEffect;
    react = (await import('../logic/game/reactiveEffectProcessor')).processReactiveEffects;
    resolveLane = (await import('../logic/effects/actions/main3Executor')).resolveCustomLaneChoice;
    const { getAllCustomProtocolCards } = await import('../logic/customProtocols/cardFactory');
    const all = getAllCustomProtocolCards();
    let n = 0;
    realCard = (protocol, value, faceUp = true) => {
        const def = all.find(c => c.protocol === protocol && c.value === value);
        if (!def) throw new Error(`no card ${protocol}-${value}`);
        return { ...def, id: `${protocol}-${value}-${n++}`, isFaceUp: faceUp } as PlayedCard;
    };
});

function base(playerProtocols = ['Envy', 'Lust', 'Nova'], opponentProtocols = ['Fire', 'Metal', 'Water']): GameState {
    const s = mods.stateManager.createInitialState(playerProtocols, opponentProtocols, false, 'player');
    const filler = () => realCard('Fire', 2, false);
    return {
        ...s,
        phase: 'action',
        player: { ...s.player, hand: [], deck: Array.from({ length: 10 }, filler) },
        opponent: { ...s.opponent, hand: [], deck: Array.from({ length: 10 }, filler) },
    };
}

const withLanes = (s: GameState, owner: Player, lanes: PlayedCard[][]): GameState =>
    mods.stateManager.recalculateAllLaneValues({ ...s, [owner]: { ...s[owner], lanes } });

const ctx = (owner: Player): EffectContext => ({
    cardOwner: owner, actor: owner, currentTurn: owner, opponent: owner === 'player' ? 'opponent' : 'player', triggerType: 'play',
});

/** Runs every effect of one box of a card that's on the board. */
function runBox(s: GameState, card: PlayedCard, laneIndex: number, box: 'topEffects' | 'middleEffects' | 'bottomEffects', owner: Player = 'player'): GameState {
    for (const effect of (card as any).customEffects[box]) {
        s = mods.stateManager.recalculateAllLaneValues(run(card, laneIndex, s, ctx(owner), effect).newState);
    }
    return s;
}

describe('Main 3: value modifiers', () => {
    it("Envy-0 adds the opponent's highest card in the line", () => {
        let s = withLanes(base(), 'player', [[realCard('Envy', 0)], [], []]);
        s = withLanes(s, 'opponent', [[realCard('Fire', 3), realCard('Metal', 5)], [], []]);
        expect(s.player.laneValues[0]).toBe(5);
    });

    it("Lust-0 adds 10 to each player's total in its line", () => {
        let s = withLanes(base(), 'player', [[], [realCard('Lust', 0)], []]);
        s = withLanes(s, 'opponent', [[], [realCard('Fire', 3)], []]);
        expect(s.player.laneValues[1]).toBe(10);
        expect(s.opponent.laneValues[1]).toBe(13);
    });

    it("Wrath-0: the highest-value cards in the line don't count", () => {
        let s = withLanes(base(['Wrath', 'Lust', 'Nova']), 'player', [[realCard('Wrath', 0), realCard('Fire', 5)], [], []]);
        s = withLanes(s, 'opponent', [[realCard('Metal', 5), realCard('Fire', 1, false)], [], []]);
        expect(s.player.laneValues[0]).toBe(0);      // 0 + (5 ignored)
        expect(s.opponent.laneValues[0]).toBe(2);    // (5 ignored) + face-down 2
    });

    it('Sloth-0 gets +5 only while covered by a Sloth card', () => {
        let s = withLanes(base(['Sloth', 'Lust', 'Nova']), 'player', [[realCard('Sloth', 0), realCard('Sloth', 3)], [], []]);
        expect(s.player.laneValues[0]).toBe(0 + 3 + 5);
        s = withLanes(s, 'player', [[realCard('Sloth', 0), realCard('Fire', 3)], [], []]);
        expect(s.player.laneValues[0]).toBe(3);
    });
});

describe('Main 3: control', () => {
    it('Main 3 protocols switch the control mechanic on', () => {
        expect(base().useControlMechanic).toBe(true);
        expect(mods.stateManager.createInitialState(['Fire', 'Metal', 'Water'], ['Spirit', 'Fire', 'Metal'], false).useControlMechanic).toBe(false);
    });

    it("Lust-0: the opponent can't compile while its owner has control", () => {
        let s = withLanes(base(), 'player', [[], [realCard('Lust', 0)], []]);
        s = withLanes(s, 'opponent', [[realCard('Fire', 5), realCard('Metal', 6)], [], []]);
        expect(mods.stateManager.calculateCompilableLanes(s, 'opponent')).toEqual([0]);
        s = { ...s, controlCardHolder: 'player' };
        expect(mods.stateManager.calculateCompilableLanes(s, 'opponent')).toEqual([]);
    });

    it('gaining control (Lust-0) makes the opponent\'s Pride-6 flip and Lust-4 draw', () => {
        const lust0 = realCard('Lust', 0);
        const pride6 = realCard('Pride', 6);
        const lust4 = realCard('Lust', 4);
        let s = withLanes(base(), 'player', [[], [lust0], []]);
        s = withLanes(s, 'opponent', [[pride6], [lust4], []]);
        s = runBox(s, lust0, 1, 'middleEffects');
        expect(s.controlCardHolder).toBe('player');
        expect(s.opponent.lanes[0][0].isFaceUp).toBe(false);
        expect(s.opponent.hand.length).toBe(1);
    });

    it('Wrath-4: lose control, and only then the opponent discards 2', () => {
        const wrath4 = realCard('Wrath', 4);
        let s = withLanes(base(['Wrath', 'Lust', 'Nova']), 'player', [[wrath4], [], []]);
        s = { ...s, opponent: { ...s.opponent, hand: [realCard('Fire', 1), realCard('Fire', 3), realCard('Metal', 2)] } };
        const without = runBox(s, wrath4, 0, 'middleEffects');
        expect(without.opponent.hand.length).toBe(3);
        const withControl = runBox({ ...s, controlCardHolder: 'player' }, wrath4, 0, 'middleEffects');
        expect(withControl.controlCardHolder).toBe(null);
        expect(withControl.actionRequired?.type).toBe('discard');
        expect(withControl.actionRequired?.actor).toBe('opponent');
    });

    it('Nova-2: covering a Nova card offers a rearrange, otherwise gains control', () => {
        const nova2 = realCard('Nova', 2);
        const plain = runBox(withLanes(base(), 'player', [[], [], [nova2]]), nova2, 2, 'middleEffects');
        expect(plain.controlCardHolder).toBe('player');
        const covering = runBox(withLanes(base(), 'player', [[], [], [realCard('Nova', 4), nova2]]), nova2, 2, 'middleEffects');
        expect(covering.actionRequired?.type).toBe('prompt_optional_effect');
    });
});

describe('Main 3: actions', () => {
    it('Greed-1 compiles a line from its End effect', () => {
        const greed1 = realCard('Greed', 1);
        let s = withLanes(base(['Envy', 'Greed', 'Nova']), 'player', [[], [realCard('Fire', 5), realCard('Metal', 6), greed1], []]);
        s = runBox(s, greed1, 1, 'bottomEffects');
        expect(s.player.compiled[1]).toBe(true);
        expect(s.player.lanes[1]).toEqual([]);
    });

    it('Fulcrum-3 draws 1 and swaps the left and right protocols (with compiled status)', () => {
        const f3 = realCard('Fulcrum', 3);
        let s = withLanes(base(['Envy', 'Fulcrum', 'Nova']), 'player', [[], [f3], []]);
        s = { ...s, player: { ...s.player, compiled: [true, false, false] } };
        s = runBox(s, f3, 1, 'middleEffects');
        expect(s.player.protocols).toEqual(['Nova', 'Fulcrum', 'Envy']);
        expect(s.player.compiled).toEqual([false, false, true]);
        expect(s.player.hand.length).toBe(1);
    });

    it('Fulcrum-1 flips every other face-up card and swaps the left and right stacks', () => {
        const f1 = realCard('Fulcrum', 1);
        const left = realCard('Fire', 3);
        let s = withLanes(base(['Envy', 'Fulcrum', 'Nova']), 'player', [[left], [f1], []]);
        s = runBox(s, f1, 1, 'middleEffects');
        expect(s.player.lanes[2].map(c => c.id)).toEqual([left.id]);
        expect(s.player.lanes[2][0].isFaceUp).toBe(false);
        expect(s.player.lanes[1][0].isFaceUp).toBe(true);
    });

    it('Gluttony-3 (End) deletes the face-up card covering it', () => {
        const g3 = realCard('Gluttony', 3);
        const top = realCard('Fire', 4);
        let s = withLanes(base(['Gluttony', 'Lust', 'Nova']), 'player', [[g3, top], [], []]);
        s = runBox(s, g3, 0, 'topEffects');
        expect(s.player.lanes[0].map(c => c.id)).toEqual([g3.id]);
    });

    it('Nova-1: opponent discards one card per card in this stack', () => {
        const nova1 = realCard('Nova', 1);
        let s = withLanes(base(), 'player', [[], [], [realCard('Fire', 2, false), realCard('Fire', 3, false), nova1]]);
        s = { ...s, opponent: { ...s.opponent, hand: Array.from({ length: 5 }, () => realCard('Metal', 2)) } };
        s = runBox(s, nova1, 2, 'middleEffects');
        expect(s.actionRequired?.type).toBe('discard');
        expect((s.actionRequired as any).count).toBe(3);
    });

    it("Ambush-3 targets only the opponent's highest face-up covered card", () => {
        const a3 = realCard('Ambush', 3);
        const low = realCard('Metal', 1);
        const high = realCard('Fire', 4);
        let s = withLanes(base(['Ambush', 'Lust', 'Nova']), 'player', [[a3], [], []]);
        s = withLanes(s, 'opponent', [[low, realCard('Fire', 0)], [high, realCard('Metal', 2)], []]);
        s = runBox(s, a3, 0, 'middleEffects');
        expect((s.actionRequired as any).targetFilter.allowedIds).toEqual([high.id]);
    });

    it('Wrath-2 asks for a line when several have the most cards, then flips their face-up cards', () => {
        const w2 = realCard('Wrath', 2);
        let s = withLanes(base(['Wrath', 'Lust', 'Nova']), 'player', [[realCard('Fire', 3), w2], [realCard('Fire', 1), realCard('Fire', 2)], []]);
        s = runBox(s, w2, 0, 'middleEffects');
        expect(s.actionRequired?.type).toBe('select_lane_custom');
        s = resolveLane(s, 1);
        expect(s.player.lanes[1].every(c => !c.isFaceUp)).toBe(true);
        expect(s.player.lanes[0].every(c => c.isFaceUp)).toBe(true);
    });

    it('Nova-0 (End) plays the top deck card under an uncovered Nova card', () => {
        const nova0 = realCard('Nova', 0);
        let s = withLanes(base(), 'player', [[], [], [nova0]]);
        s = runBox(s, nova0, 2, 'bottomEffects');
        expect(s.player.lanes[2].length).toBe(2);
        expect(s.player.lanes[2][1].id).toBe(nova0.id);
        expect(s.player.lanes[2][0].isFaceUp).toBe(false);
    });

    it('Momentum-6 deletes itself after a player compiles', () => {
        const m6 = realCard('Momentum', 6);
        let s = withLanes(base(['Momentum', 'Lust', 'Nova']), 'player', [[realCard('Fire', 1, false), m6], [], []]);
        s = react(s, 'after_compile', { player: 'opponent' }).newState;
        expect(s.player.lanes[0].some(c => c.id === m6.id)).toBe(false);
    });

    it('Overwhelm-1 plays face-down only in lines where its owner leads', () => {
        const o1 = realCard('Overwhelm', 1);
        let s = withLanes(base(['Overwhelm', 'Lust', 'Nova']), 'player', [[o1], [realCard('Fire', 4)], []]);
        s = withLanes(s, 'opponent', [[realCard('Metal', 3)], [], [realCard('Fire', 1)]]);
        s = runBox(s, o1, 0, 'middleEffects');
        expect(s.player.lanes.map(l => l.length)).toEqual([1, 2, 0]);
    });

    it('Sloth-2 (Start) can put a hand card on the bottom of the deck', async () => {
        const sloth2 = realCard('Sloth', 2);
        const handCard = realCard('Fire', 5);
        let s = withLanes(base(['Sloth', 'Lust', 'Nova']), 'player', [[sloth2], [], []]);
        s = { ...s, player: { ...s.player, hand: [handCard] } };
        s = runBox(s, sloth2, 0, 'bottomEffects');
        expect(s.actionRequired?.type).toBe('prompt_optional_effect');
        s = mods.resolvers.resolveOptionalEffectPrompt(s, true);
        expect((s.actionRequired as any).mode).toBe('deck_bottom');
        const { resolveActionWithHandCard } = await import('../logic/game/resolvers/handCardResolver');
        s = resolveActionWithHandCard(s, handCard.id);
        expect(s.player.hand).toEqual([]);
        expect(s.player.deck[s.player.deck.length - 1].protocol).toBe('Fire');
    });
});
