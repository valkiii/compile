/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Executors for the Main 3 actions (Envy ... Nova): control changes, compiling a line from
 * an effect, face-down plays into several lines, bulk flips / deletes and line choices.
 *
 * Effects that need the player to pick a line use one generic prompt, 'select_lane_custom',
 * carrying `pending` (what to do with the chosen line), `validLanes` and `aiLaneScores`.
 */

import { v4 as uuidv4 } from 'uuid';
import { AnimationRequest, EffectContext, EffectResult, GameState, PlayedCard, Player } from '../../../types';
import { log } from '../../utils/log';
import { drawCards } from '../../../utils/gameStateModifiers';
import { deleteCardFromBoard } from '../../utils/boardModifiers';
import { findCardOnBoard, handleUncoverEffect } from '../../game/helpers/actionUtils';
import { recalculateAllLaneValues } from '../../game/stateManager';
import { processReactiveEffects } from '../../game/reactiveEffectProcessor';
import { executeOnCoverEffect } from '../../effectExecutor';
import { performCompile } from '../../game/resolvers/miscResolver';
import { executeCustomEffect } from '../../customProtocols/effectInterpreter';
import { cardValueOnBoard, setControlHolder } from '../../customProtocols/main3Rules';
import { executeDrawEffect } from './drawExecutor';

const other = (p: Player): Player => (p === 'player' ? 'opponent' : 'player');
const name = (p: Player) => (p === 'player' ? 'Player' : 'Opponent');
const cardName = (c: PlayedCard) => `${c.protocol}-${c.value}`;

type PendingKind = 'play_deck_face_down' | 'flip_all_in_line' | 'delete_face_up_in_line' | 'compile_line' | 'play_revealed_on_opponent';

interface Pending {
    kind: PendingKind;
    cardOwner: Player;
    under?: boolean;          // play_deck_face_down: insert under the top card
    revealedCardId?: string;  // play_revealed_on_opponent
}

function withAnimations(state: GameState, requests: AnimationRequest[]): GameState {
    if (requests.length === 0) return state;
    const existing = (state as any)._pendingAnimationRequests || [];
    return { ...state, _pendingAnimationRequests: [...existing, ...requests] } as GameState;
}

// -----------------------------------------------------------------------------
// Line choice
// -----------------------------------------------------------------------------

function laneScore(state: GameState, pending: Pending, lane: number): number {
    const me = pending.cardOwner;
    const opp = other(me);
    const mine = state[me].laneValues[lane];
    const theirs = state[opp].laneValues[lane];
    const faceUpValue = (p: Player) => state[p].lanes[lane].filter(c => c.isFaceUp).reduce((n, c) => n + c.value, 0);
    switch (pending.kind) {
        case 'play_deck_face_down':
            return mine + 2 >= 10 && mine + 2 > theirs ? 20 : mine < 10 ? mine : -mine;
        case 'flip_all_in_line':
        case 'delete_face_up_in_line':
            return faceUpValue(opp) - faceUpValue(me);
        case 'compile_line':
            return state[me].compiled[lane] ? 1 : 10;
        case 'play_revealed_on_opponent':
            return theirs + 2 >= 10 && theirs + 2 > mine ? -100 : -theirs;
    }
}

/** Applies the effect to `lane` right away when only one line is possible, else asks. */
function chooseLane(state: GameState, card: PlayedCard, pending: Pending, validLanes: number[], prompt: string): EffectResult {
    if (validLanes.length === 0) return { newState: state };
    if (validLanes.length === 1) return applyLaneChoice(state, card.id, pending, validLanes[0]);
    const aiLaneScores: Record<number, number> = {};
    validLanes.forEach(l => { aiLaneScores[l] = laneScore(state, pending, l); });
    return {
        newState: {
            ...state,
            actionRequired: {
                type: 'select_lane_custom',
                actor: pending.cardOwner,
                sourceCardId: card.id,
                validLanes,
                prompt,
                pending,
                aiLaneScores,
            } as any,
        },
    };
}

function applyLaneChoice(state: GameState, sourceCardId: string, pending: Pending, lane: number): EffectResult {
    const owner = pending.cardOwner;
    const source = findCardOnBoard(state, sourceCardId)?.card;
    switch (pending.kind) {
        case 'play_deck_face_down':
            return playDeckTopIntoLanes(state, source, owner, [lane], pending.under === true);
        case 'flip_all_in_line':
            return flipCards(state, owner, collectCards(state, [lane], c => c.isFaceUp), 'in this line');
        case 'delete_face_up_in_line':
            return deleteCards(state, owner, collectCards(state, [lane], c => c.isFaceUp));
        case 'compile_line':
            return compileLineFromEffect(state, owner, lane);
        case 'play_revealed_on_opponent':
            return playRevealedOnOpponent(state, owner, pending.revealedCardId!, lane);
    }
}

/** Resolver for 'select_lane_custom' (player tap, AI or online guest). */
export function resolveCustomLaneChoice(prev: GameState, lane: number): GameState {
    const action = prev.actionRequired as any;
    if (!action || action.type !== 'select_lane_custom' || !action.validLanes.includes(lane)) return prev;
    let state: GameState = { ...prev, actionRequired: null };
    const result = applyLaneChoice(state, action.sourceCardId, action.pending, lane);
    state = withAnimations(result.newState, result.animationRequests || []);

    // Chained "then" effect of the card that asked for the line
    if (action.followUpEffect && !state.actionRequired) {
        const source = findCardOnBoard(state, action.sourceCardId);
        if (source) {
            const context: EffectContext = {
                cardOwner: source.owner, actor: source.owner, currentTurn: state.turn,
                opponent: other(source.owner), triggerType: 'play',
            };
            state = executeCustomEffect(source.card, source.laneIndex, state, context, action.followUpEffect).newState;
        }
    }
    return recalculateAllLaneValues(state);
}

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------

interface BoardCard { card: PlayedCard; owner: Player; laneIndex: number; cardIndex: number }

function collectCards(state: GameState, lanes: number[], keep: (c: PlayedCard, owner: Player) => boolean): BoardCard[] {
    const out: BoardCard[] = [];
    for (const owner of ['player', 'opponent'] as Player[]) {
        for (const laneIndex of lanes) {
            state[owner].lanes[laneIndex].forEach((card, cardIndex) => {
                if (keep(card, owner)) out.push({ card, owner, laneIndex, cardIndex });
            });
        }
    }
    return out;
}

function flipCards(state: GameState, actor: Player, targets: BoardCard[], where: string): EffectResult {
    if (targets.length === 0) return { newState: log(state, actor, `No cards to flip ${where}.`) };
    const ids = new Set(targets.map(t => t.card.id));
    const flipLanes = (lanes: PlayedCard[][]) => lanes.map(l => l.map(c => (ids.has(c.id) ? { ...c, isFaceUp: !c.isFaceUp } : c)));
    let newState: GameState = {
        ...state,
        player: { ...state.player, lanes: flipLanes(state.player.lanes) },
        opponent: { ...state.opponent, lanes: flipLanes(state.opponent.lanes) },
    };
    newState = log(newState, actor, `${name(actor)} flips ${targets.length} card(s) ${where}.`);
    (newState as any)._lastFlippedCount = targets.length;
    return { newState: recalculateAllLaneValues(newState) };
}

function deleteCards(state: GameState, actor: Player, targets: BoardCard[]): EffectResult {
    if (targets.length === 0) return { newState: log(state, actor, 'No cards to delete.') };
    // Top to bottom, so indexes in the animation snapshots stay valid
    const ordered = [...targets].sort((a, b) => b.cardIndex - a.cardIndex);
    const topBefore = (p: Player, l: number) => state[p].lanes[l][state[p].lanes[l].length - 1]?.id;
    const animations: AnimationRequest[] = ordered.map(t => ({
        type: 'delete', cardId: t.card.id, owner: t.owner, cardSnapshot: { ...t.card }, laneIndex: t.laneIndex, cardIndex: t.cardIndex,
    } as AnimationRequest));
    let newState = state;
    for (const t of ordered) newState = deleteCardFromBoard(newState, t.card.id);
    const stats = { ...newState.stats[actor], cardsDeleted: newState.stats[actor].cardsDeleted + ordered.length };
    newState = { ...newState, stats: { ...newState.stats, [actor]: stats } };
    newState = log(newState, actor, `${name(actor)} deletes ${ordered.map(t => (t.card.isFaceUp ? cardName(t.card) : 'a face-down card')).join(', ')}.`);
    newState = withAnimations(recalculateAllLaneValues(newState), animations);
    newState = processReactiveEffects(newState, 'after_delete', { player: actor }).newState;

    // Newly uncovered cards trigger their middle command
    const touched = new Set(ordered.map(t => `${t.owner}:${t.laneIndex}`));
    for (const key of touched) {
        if (newState.actionRequired) break;
        const [p, l] = key.split(':') as [Player, string];
        const lane = newState[p].lanes[Number(l)];
        if (lane.length > 0 && lane[lane.length - 1].id !== topBefore(p, Number(l))) {
            newState = handleUncoverEffect(newState, p, Number(l)).newState;
        }
    }
    return { newState };
}

/** Plays the top card of `actor`'s deck face-down into each of `lanes` (or under the top card). */
export function playDeckTopIntoLanes(state: GameState, source: PlayedCard | undefined, actor: Player, lanes: number[], under = false): EffectResult {
    if (lanes.length === 0) return { newState: log(state, actor, 'No line to play into.') };
    const deckState = state[actor];
    if (deckState.deck.length === 0 && deckState.discard.length === 0) {
        return { newState: log(state, actor, `${name(actor)} has no cards in deck - effect skipped.`) };
    }
    const { drawnCards, remainingDeck, newDiscard } = drawCards(deckState.deck, deckState.discard, lanes.length);
    const cards = drawnCards.map((c: any) => ({ ...c, id: uuidv4(), isFaceUp: false } as PlayedCard));
    const prePlayLanes = {
        player: state.player.lanes.map(l => l.map(c => ({ ...c }))),
        opponent: state.opponent.lanes.map(l => l.map(c => ({ ...c }))),
    };
    let newState: GameState = { ...state, [actor]: { ...state[actor], deck: remainingDeck, discard: newDiscard } };
    const animations: AnimationRequest[] = [];

    cards.forEach((played, i) => {
        const lane = lanes[i];
        const current = newState[actor].lanes[lane];
        const top = current[current.length - 1];
        if (!under && top?.isFaceUp && !newState.actionRequired) {
            const coverContext: EffectContext = { cardOwner: actor, actor, currentTurn: newState.turn, opponent: other(actor), triggerType: 'cover' };
            newState = executeOnCoverEffect(top, lane, { ...newState, _coveringCardProtocol: played.protocol } as GameState, coverContext).newState;
        }
        const laneNow = newState[actor].lanes[lane];
        const nextLane = under && laneNow.length > 0
            ? [...laneNow.slice(0, -1), played, laneNow[laneNow.length - 1]]
            : [...laneNow, played];
        const newLanes = [...newState[actor].lanes];
        newLanes[lane] = nextLane;
        newState = { ...newState, [actor]: { ...newState[actor], lanes: newLanes } };
        if (!under) {
            animations.push({ type: 'play', cardId: played.id, owner: actor, toLane: lane, fromDeck: true, isFaceUp: false, prePlayLanes, playIndex: i } as AnimationRequest);
        }
    });

    if (newState.detailedGameStats && cards.length > 0) {
        const fromEffectKey = actor === 'player' ? 'playerFromEffect' : 'aiFromEffect';
        const faceDownKey = actor === 'player' ? 'playerFaceDown' : 'aiFaceDown';
        const played = newState.detailedGameStats.cardsPlayed;
        newState = {
            ...newState,
            detailedGameStats: {
                ...newState.detailedGameStats,
                cardsPlayed: { ...played, [fromEffectKey]: played[fromEffectKey] + cards.length, [faceDownKey]: played[faceDownKey] + cards.length },
            },
        };
    }
    const where = under ? 'under an uncovered card' : lanes.length === 1 ? `in the ${newState[actor].protocols[lanes[0]]} line` : `in ${lanes.length} lines`;
    newState = log(newState, actor, `${source ? `${cardName(source)}: ` : ''}${name(actor)} plays ${cards.length} card(s) face-down ${where}.`);
    return { newState: recalculateAllLaneValues(newState), animationRequests: animations.length ? animations : undefined };
}

function compileLineFromEffect(state: GameState, owner: Player, lane: number): EffectResult {
    // performCompile resets the queue and compiles for state.turn; keep the queue and use the card owner.
    // Compiling from an effect doesn't offer the control rearrange (control stays where it is).
    const { queuedActions, turn, useControlMechanic, controlCardHolder } = state;
    let winner: Player | null = null;
    let compiled = performCompile({ ...state, turn: owner, useControlMechanic: false }, lane, w => { winner = w; });
    const animations: AnimationRequest[] = ((compiled as any)._compileAnimations || []).map((d: BoardCard) => ({
        type: 'delete', cardId: d.card.id, owner: d.owner, cardSnapshot: { ...d.card }, laneIndex: d.laneIndex, cardIndex: d.cardIndex,
    } as AnimationRequest));
    delete (compiled as any)._compileAnimations;
    compiled = {
        ...compiled,
        turn: compiled.actionRequired ? compiled.turn : turn,
        useControlMechanic,
        controlCardHolder,
        queuedActions: [...(compiled.queuedActions || []), ...(queuedActions || [])],
    };
    if (winner) (compiled as any)._effectWinner = winner;
    return { newState: compiled, animationRequests: animations.length ? animations : undefined };
}

function playRevealedOnOpponent(state: GameState, actor: Player, cardId: string, lane: number): EffectResult {
    const opp = other(actor);
    const card = state[opp].hand.find(c => c.id === cardId);
    if (!card) return { newState: state };
    let newState: GameState = { ...state, [opp]: { ...state[opp], hand: state[opp].hand.filter(c => c.id !== cardId) } };
    const top = newState[opp].lanes[lane][newState[opp].lanes[lane].length - 1];
    if (top?.isFaceUp) {
        const coverContext: EffectContext = { cardOwner: opp, actor: opp, currentTurn: newState.turn, opponent: actor, triggerType: 'cover' };
        newState = executeOnCoverEffect(top, lane, { ...newState, _coveringCardProtocol: card.protocol } as GameState, coverContext).newState;
    }
    const lanes = [...newState[opp].lanes];
    lanes[lane] = [...lanes[lane], { ...card, isFaceUp: false, isRevealed: false }];
    newState = { ...newState, [opp]: { ...newState[opp], lanes } };
    newState = log(newState, actor, `${name(actor)} plays the revealed ${cardName(card)} face-down on ${name(opp)}'s ${newState[opp].protocols[lane]} line.`);
    return { newState: recalculateAllLaneValues(newState) };
}

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

export function executeMain3Effect(card: PlayedCard, laneIndex: number, state: GameState, context: EffectContext, params: any): EffectResult {
    const owner = context.cardOwner;
    const opp = other(owner);
    switch (params.action) {
        case 'control': {
            if (params.mode === 'gain') return { newState: setControlHolder(state, owner, owner) };
            const loser = params.who === 'opponent' ? opp : owner;
            if (state.controlCardHolder !== loser) return { newState: state };
            return { newState: setControlHolder(state, null, owner) };
        }

        case 'compile_line': {
            const lanes = [0, 1, 2].filter(i => state[owner].laneValues[i] >= 10 && state[owner].laneValues[i] > state[opp].laneValues[i]);
            if (lanes.length === 0) return { newState: log(state, owner, 'No line can be compiled.') };
            return chooseLane(state, card, { kind: 'compile_line', cardOwner: owner }, lanes, 'Choose a line to compile');
        }

        case 'flip_all_in_line': {
            const size = (l: number) => state.player.lanes[l].length + state.opponent.lanes[l].length;
            const most = Math.max(size(0), size(1), size(2));
            const lanes = [0, 1, 2].filter(l => size(l) === most && most > 0);
            return chooseLane(state, card, { kind: 'flip_all_in_line', cardOwner: owner }, lanes, 'Choose a line with the most cards: flip all its face-up cards');
        }

        case 'flip_all_matching': {
            const max = params.valueMax ?? 1;
            const targets = collectCards(state, [0, 1, 2], (c, p) => p === owner && c.id !== card.id && c.isFaceUp && c.value <= max);
            const flipped = flipCards(state, owner, targets, `with a value of ${max} or less`);
            if (!params.drawPerFlip || targets.length === 0) return flipped;
            return executeDrawEffect(card, laneIndex, flipped.newState, context, { action: 'draw', count: targets.length, target: 'self', source: 'own_deck' });
        }

        case 'delete_face_up_in_line': {
            const exactly = params.ownCardsExactly ?? 5;
            const lanes = [0, 1, 2].filter(l => state[owner].lanes[l].length === exactly);
            if (lanes.length === 0) return { newState: state };
            return chooseLane(state, card, { kind: 'delete_face_up_in_line', cardOwner: owner }, lanes, `Choose a line where you have exactly ${exactly} cards: delete its face-up cards`);
        }

        case 'delete_covering_card': {
            const info = findCardOnBoard(state, card.id);
            if (!info) return { newState: state };
            const lane = state[owner].lanes[info.laneIndex];
            const covering = lane[info.cardIndex + 1];
            if (!covering || !covering.isFaceUp) return { newState: state };
            return deleteCards(state, owner, [{ card: covering, owner, laneIndex: info.laneIndex, cardIndex: info.cardIndex + 1 }]);
        }

        case 'reveal_random_play_on_opponent': {
            const hand = state[opp].hand;
            if (hand.length === 0) return { newState: log(state, owner, `${name(opp)} has no cards in hand.`) };
            const revealed = hand[Math.floor(Math.random() * hand.length)];
            let newState = log(state, owner, `${name(opp)} reveals ${cardName(revealed)} from their hand.`);
            return chooseLane(newState, card, { kind: 'play_revealed_on_opponent', cardOwner: owner, revealedCardId: revealed.id }, [0, 1, 2], `Choose a line on your opponent's side for ${cardName(revealed)}`);
        }

        case 'hand_to_deck_bottom': {
            if (state[owner].hand.length === 0) return { newState: state };
            return {
                newState: {
                    ...state,
                    actionRequired: { type: 'select_card_from_hand_to_give', actor: owner, sourceCardId: card.id, mode: 'deck_bottom' } as any,
                },
            };
        }

        default:
            return { newState: state };
    }
}

/** Main 3 play destinations (deck → face-down). Returns null for destinations it doesn't handle. */
export function executeMain3Play(card: PlayedCard, laneIndex: number, state: GameState, context: EffectContext, params: any): EffectResult | null {
    const type = params.destinationRule?.type;
    if (params.source !== 'deck') return null;
    const actor = params.actor === 'opponent' ? context.opponent : context.cardOwner;
    const opp = other(actor);
    switch (type) {
        case 'each_line':
            return playDeckTopIntoLanes(state, card, actor, [0, 1, 2]);
        case 'each_line_where_higher':
            return playDeckTopIntoLanes(state, card, actor, [0, 1, 2].filter(l => state[actor].laneValues[l] > state[opp].laneValues[l]));
        case 'each_line_with_compiled':
            return playDeckTopIntoLanes(state, card, actor, [0, 1, 2].filter(l => state.player.compiled[l] || state.opponent.compiled[l]));
        case 'any_line':
            return chooseLane(state, card, { kind: 'play_deck_face_down', cardOwner: actor }, [0, 1, 2], 'Choose a line to play the top card of your deck face-down');
        case 'under_uncovered_protocol': {
            const lanes = [0, 1, 2].filter(l => {
                const lane = state[actor].lanes[l];
                const top = lane[lane.length - 1];
                return top?.isFaceUp && top.protocol === card.protocol;
            });
            return chooseLane(state, card, { kind: 'play_deck_face_down', cardOwner: actor, under: true }, lanes, `Choose an uncovered ${card.protocol} card to play under`);
        }
        default:
            return null;
    }
}

/** Fulcrum-1 / Fulcrum-3: swap two fixed stacks or protocols of the card owner. */
export function executeFixedSwap(state: GameState, owner: Player, what: 'stacks' | 'protocols', [a, b]: [number, number], source: PlayedCard): GameState {
    const ps = state[owner];
    let newState: GameState;
    if (what === 'stacks') {
        const lanes = [...ps.lanes];
        [lanes[a], lanes[b]] = [lanes[b], lanes[a]];
        newState = { ...state, [owner]: { ...ps, lanes } };
        newState = log(newState, owner, `${cardName(source)}: ${name(owner)} swaps their left and right stacks.`);
    } else {
        const protocols = [...ps.protocols];
        const compiled = [...ps.compiled];
        [protocols[a], protocols[b]] = [protocols[b], protocols[a]];
        [compiled[a], compiled[b]] = [compiled[b], compiled[a]];
        newState = { ...state, [owner]: { ...ps, protocols, compiled } };
        newState = log(newState, owner, `${cardName(source)}: ${name(owner)} swaps their left and right protocols.`);
    }
    newState = recalculateAllLaneValues(newState);
    if (what === 'protocols') newState = processReactiveEffects(newState, 'after_rearrange', { player: owner }).newState;
    return newState;
}

/** Card values helper for the AI (face-down cards count as their board value). */
export const boardValue = cardValueOnBoard;
