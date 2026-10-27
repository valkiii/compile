/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared rules for the Main 3 protocols: effect conditions ("If you have control, ..."),
 * dynamic counts ("cards equal to the number of lines where ..."), computed target sets
 * (highest / lowest value, value below the stack size) and control changes.
 */

import { GameState, PlayedCard, Player } from '../../types';
import { EffectCondition, EffectDefinition } from '../../types/customProtocol';
import { getEffectiveCardValue } from '../game/stateManager';
import { processReactiveEffects } from '../game/reactiveEffectProcessor';
import { log } from '../utils/log';

const other = (p: Player): Player => (p === 'player' ? 'opponent' : 'player');

export const MAIN3_PROTOCOLS = ['Envy', 'Gluttony', 'Greed', 'Lust', 'Pride', 'Sloth', 'Wrath', 'Ambush', 'Fulcrum', 'Overwhelm', 'Momentum', 'Nova'];

/** Main 3 cards gain, lose and check control, so control is always on when one is in the game. */
export const needsControlMechanic = (protocols: string[]): boolean =>
    protocols.some(p => MAIN3_PROTOCOLS.includes(p));

export function cardValueOnBoard(state: GameState, card: PlayedCard, owner: Player, laneIndex: number): number {
    return getEffectiveCardValue(card, state[owner].lanes[laneIndex], state, laneIndex, owner);
}

function linesWhere(state: GameState, owner: Player, compare: (own: number, opp: number) => boolean): number {
    let n = 0;
    for (let i = 0; i < 3; i++) {
        if (compare(state[owner].laneValues[i], state[other(owner)].laneValues[i])) n++;
    }
    return n;
}

const cardsInPlay = (state: GameState, p: Player) => state[p].lanes.reduce((n, l) => n + l.length, 0);
const compiledCount = (state: GameState, p: Player) => state[p].compiled.filter(Boolean).length;

/** Checks a Main 3 effect condition for the card's owner. */
export function checkEffectCondition(condition: EffectCondition, state: GameState, card: PlayedCard, laneIndex: number, owner: Player): boolean {
    const opp = other(owner);
    switch (condition.type) {
        case 'self_has_control':
            return state.controlCardHolder === owner;
        case 'opponent_has_control':
            return state.controlCardHolder === opp;
        case 'opponent_more_compiled':
            return compiledCount(state, opp) > compiledCount(state, owner);
        case 'hand_exactly':
            return state[owner].hand.length === (condition.value ?? 0);
        case 'hand_at_least':
            return state[owner].hand.length >= (condition.value ?? 0);
        case 'higher_total_in_this_line':
            return state[owner].laneValues[laneIndex] > state[opp].laneValues[laneIndex];
        case 'opponent_higher_in_this_line':
            return state[opp].laneValues[laneIndex] > state[owner].laneValues[laneIndex];
        case 'more_cards_in_play':
            return cardsInPlay(state, owner) > cardsInPlay(state, opp);
        case 'has_uncovered_face_down':
            return state[owner].lanes.some(l => l.length > 0 && !l[l.length - 1].isFaceUp);
        case 'covering_same_protocol': {
            const lane = state[owner].lanes[laneIndex];
            const idx = lane.findIndex(c => c.id === card.id);
            return idx > 0 && lane[idx - 1].isFaceUp && lane[idx - 1].protocol === card.protocol;
        }
        case 'last_returned_was_own':
            return (state as any)._lastReturnedCardOwner === owner;
        default:
            return true;
    }
}

export const conditionText = (condition: EffectCondition): string => {
    switch (condition.type) {
        case 'self_has_control': return 'you do not have control';
        case 'opponent_has_control': return 'your opponent does not have control';
        case 'opponent_more_compiled': return 'your opponent does not have more compiled protocols';
        case 'hand_exactly': return `you do not have exactly ${condition.value} cards in hand`;
        case 'hand_at_least': return `you have fewer than ${condition.value} cards in hand`;
        case 'higher_total_in_this_line': return 'you do not have a higher total value in this line';
        case 'opponent_higher_in_this_line': return 'your opponent does not have a higher total value in this line';
        case 'more_cards_in_play': return 'you do not have more cards in play';
        case 'has_uncovered_face_down': return 'you have no uncovered face-down card';
        case 'covering_same_protocol': return 'this card is not covering a card of its protocol';
        case 'last_returned_was_own': return 'the returned card was not yours';
        default: return 'the condition is not met';
    }
};

/**
 * Runs the condition gate of an effect. Returns null when the effect may run as written;
 * otherwise the effect to run instead (elseEffect) or 'skip'.
 */
export function gateEffect(effectDef: EffectDefinition, state: GameState, card: PlayedCard, laneIndex: number, owner: Player): null | 'skip' | EffectDefinition {
    if (!effectDef.condition) return null;
    if (checkEffectCondition(effectDef.condition, state, card, laneIndex, owner)) return null;
    return effectDef.elseEffect ?? 'skip';
}

/** Main 3 dynamic counts. Returns undefined for count types this module doesn't handle. */
export function computeMain3Count(countType: string, state: GameState, card: PlayedCard, laneIndex: number, owner: Player): number | undefined {
    switch (countType) {
        case 'opponent_hand_size': return state[other(owner)].hand.length;
        case 'own_hand_size': return state[owner].hand.length;
        case 'lines_with_higher_total': return linesWhere(state, owner, (a, b) => a > b);
        case 'lines_with_lower_total': return linesWhere(state, owner, (a, b) => a < b);
        case 'cards_in_this_stack': return state[owner].lanes[laneIndex]?.length ?? 0;
        case 'equal_to_flipped': return (state as any)._lastFlippedCount ?? 0;
        default: return undefined;
    }
}

interface BoardEntry { card: PlayedCard; owner: Player; laneIndex: number; cardIndex: number; value: number }

/**
 * Turns filters the generic selectors can't express (value below the stack size, highest /
 * lowest value, "other" card for returns) into a precomputed `allowedIds` list on the
 * target filter. Returns null when nothing can be targeted.
 */
export function withComputedTargets(params: any, state: GameState, card: PlayedCard, laneIndex: number, owner: Player): any | null {
    const tf = params.targetFilter;
    const action = params.action;
    if (!tf || !['flip', 'shift', 'return'].includes(action)) return params;
    const toThisLine = action === 'shift' && params.destinationRestriction?.type === 'to_this_lane';
    const needsList = tf.valueLessThanStackSize || tf.calculation || (action === 'return' && tf.excludeSelf) || toThisLine;
    if (!needsList) return params;

    const entries: BoardEntry[] = [];
    for (const p of ['player', 'opponent'] as Player[]) {
        if (tf.owner === 'own' && p !== owner) continue;
        if (tf.owner === 'opponent' && p === owner) continue;
        state[p].lanes.forEach((lane, li) => lane.forEach((c, ci) => {
            const isTop = ci === lane.length - 1;
            const pos = tf.position || 'uncovered';
            if (pos === 'uncovered' && !isTop) return;
            if (pos === 'covered' && isTop) return;
            if (tf.faceState === 'face_up' && !c.isFaceUp) return;
            if (tf.faceState === 'face_down' && c.isFaceUp) return;
            if (tf.excludeSelf && c.id === card.id) return;
            if (params.scope === 'this_lane' && li !== laneIndex) return;
            // "Shift ... to this line": cards already in this line can't be chosen
            if (toThisLine && li === laneIndex) return;
            entries.push({ card: c, owner: p, laneIndex: li, cardIndex: ci, value: cardValueOnBoard(state, c, p, li) });
        }));
    }

    let matches = entries;
    if (tf.valueLessThanStackSize) {
        const stackSize = state[owner].lanes[laneIndex]?.length ?? 0;
        matches = matches.filter(e => e.value < stackSize);
    }
    if (tf.calculation === 'highest_value' || tf.calculation === 'lowest_value') {
        const values = matches.map(e => e.value);
        const target = tf.calculation === 'highest_value' ? Math.max(...values) : Math.min(...values);
        matches = matches.filter(e => e.value === target);
    }
    if (matches.length === 0) return null;
    return { ...params, targetFilter: { ...tf, allowedIds: matches.map(e => e.card.id) } };
}

/**
 * Changes who holds control, logs it and triggers "After your opponent gains control".
 */
export function setControlHolder(state: GameState, holder: Player | null, logAs: Player): GameState {
    const previous = state.controlCardHolder;
    if (previous === holder) return state;
    let newState: GameState = { ...state, controlCardHolder: holder };
    if (holder) {
        newState = log(newState, logAs, `${holder === 'player' ? 'Player' : 'Opponent'} gains control.`);
        // context.player is the player whose OPPONENT gained control (same convention as after_opponent_*)
        newState = processReactiveEffects(newState, 'after_opponent_gain_control', { player: other(holder) }).newState;
    } else if (previous) {
        newState = log(newState, logAs, `${previous === 'player' ? 'Player' : 'Opponent'} loses control.`);
    }
    return newState;
}
