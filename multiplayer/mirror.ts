/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Online multiplayer: perspective flipping.
 *
 * The host's engine always calls the host "player" and the guest "opponent". The guest's
 * UI is the normal single-player UI, so it gets the host state mirrored: the two sides
 * swapped and every absolute Player value ('player' / 'opponent') swapped.
 *
 * Card effect definitions use RELATIVE owners ('own' / 'opponent', relative to whoever
 * resolves the effect), so those subtrees are copied untouched. Cards are copied as-is.
 */

import { AIAction, GameState, PlayedCard, Player } from '../types';

/** Keys whose string value is an absolute Player. */
const PLAYER_VALUE_KEYS = new Set([
    'actor', 'turn', 'owner', 'cardOwner', 'player', 'opponent', 'winner', 'target', 'targetOwner',
    'currentTurn', 'toTurn', 'fromTurn', 'toOwner', 'fromOwner', 'targetPlayer', 'nextTurn',
    'interruptedTurn', '_interruptedTurn', 'controlCardHolder', 'drawingPlayer', 'sourcePlayer',
    'sourceOwner', 'sourceCardOwner', 'holder', 'forPlayer', 'blockedPlayer', 'affectedPlayer',
    'deckOwner', 'startingPlayer', 'lastTurn', 'originalTurn',
]);

/** Subtrees holding effect definitions (relative semantics): never rewritten. */
const OPAQUE_KEYS = new Set([
    'params', 'targetFilter', 'followUpEffect', 'thenEffect', 'elseEffect', 'effect', 'effects',
    'conditional', 'customEffects', 'topEffects', 'middleEffects', 'bottomEffects', 'sourceEffect',
    'effectDef', 'pendingEffects', 'remainingEffects',
]);

/** Boolean keys meaning "this is the opponent's doing" (animation highlight). */
const OPPONENT_FLAG_KEYS = new Set(['isOpponentAction']);

export const flipPlayer = (p: Player): Player => (p === 'player' ? 'opponent' : 'player');

const isCard = (v: Record<string, unknown>): boolean =>
    typeof v.protocol === 'string' && typeof v.value === 'number' && 'id' in v;

export const swapWords = (text: string): string =>
    text.replace(/\b(Player|Opponent|player|opponent)\b/g, w =>
        ({ Player: 'Opponent', Opponent: 'Player', player: 'opponent', opponent: 'player' } as Record<string, string>)[w]);

function mirrorValue(value: unknown, key: string | null): unknown {
    if (value === null || typeof value !== 'object') {
        if (key && PLAYER_VALUE_KEYS.has(key) && (value === 'player' || value === 'opponent')) {
            return flipPlayer(value);
        }
        if (key && OPPONENT_FLAG_KEYS.has(key) && typeof value === 'boolean') return !value;
        return value;
    }
    if (Array.isArray(value)) return value.map(v => mirrorValue(v, null));
    if (value instanceof Set || value instanceof Map) return value;

    const obj = value as Record<string, unknown>;
    if (isCard(obj)) return { ...obj };

    const out: Record<string, unknown> = {};
    // Sides stored under 'player' / 'opponent' (PlayerState, visual snapshots, stats) swap places
    const swapSides = obj.player !== undefined && obj.opponent !== undefined
        && typeof obj.player === 'object' && typeof obj.opponent === 'object';

    for (const [k, v] of Object.entries(obj)) {
        if (OPAQUE_KEYS.has(k)) {
            out[k] = v;
            continue;
        }
        const targetKey = swapSides && (k === 'player' || k === 'opponent') ? flipPlayer(k) : k;
        out[targetKey] = mirrorValue(v, k);
    }
    return out;
}

/** Mirror any game structure (GameState, AnimationQueueItem, AnimationRequest, ...). */
export function mirror<T>(value: T): T {
    return mirrorValue(value, null) as T;
}

/** A card the guest may not see (host hand / deck): keep its id, drop its identity. */
export const hideCard = (card: PlayedCard): PlayedCard =>
    card.isRevealed ? card : ({ ...card, protocol: 'Hidden', value: 0, top: '', middle: '', bottom: '' } as PlayedCard);

/** Host state as the guest should see it: mirrored, host secrets hidden, log wording flipped. */
export function stateForGuest(hostState: GameState): GameState {
    const m = mirror(hostState);
    const hide = hideCard;
    const next: GameState = {
        ...m,
        // The host (now "opponent") keeps hand and deck private
        opponent: {
            ...m.opponent,
            hand: m.opponent.hand.map(hide),
            deck: m.opponent.deck.map(c => hide({ ...(c as PlayedCard), id: '', isFaceUp: false })),
        },
        player: { ...m.player, deck: m.player.deck.map(c => hide({ ...(c as PlayedCard), id: '', isFaceUp: false })) },
        log: m.log.map(entry => ({ ...entry, message: swapWords(entry.message) })),
    };
    delete (next as Partial<GameState> & Record<string, unknown>)._pendingAnimationRequests;
    return next;
}

/**
 * Identifies the decision the host is waiting for. The guest echoes it with its move,
 * so a late or duplicated move can never be applied to a different prompt.
 */
export function decisionKey(state: GameState): string {
    const a = state.actionRequired as (Record<string, unknown> & { type?: string }) | null;
    const parts = [state.log.length, state.turn, state.phase, a?.type ?? 'main', a?.sourceCardId ?? '', a?.count ?? ''];
    return parts.join('|');
}

/** Guest moves are made in the guest's frame; translate back to the host's frame. */
export function actionFromGuest(action: AIAction): AIAction {
    if (action.type === 'resolveControlMechanicPrompt' && action.choice !== 'skip') {
        return { ...action, choice: flipPlayer(action.choice) };
    }
    return action;
}

/** Decision types valid while a given prompt is pending (mirrors aiManager's dispatch table). */
const PROMPT_DECISIONS: Record<string, AIAction['type'][]> = {
    discard: ['discardCards'],
    prompt_rearrange_protocols: ['rearrangeProtocols'],
    custom_choice: ['resolveCustomChoice'],
    prompt_swap_protocols: ['resolveSwapProtocols'],
    prompt_use_control_mechanic: ['resolveControlMechanicPrompt'],
    select_card_from_hand_to_play: ['playCard'],
    state_number: ['stateNumber'],
    state_protocol: ['stateProtocol'],
    select_from_drawn_to_reveal: ['selectFromDrawnToReveal'],
    confirm_deck_discard: ['confirmDeckDiscard'],
    confirm_deck_play_preview: ['confirmDeckPlayPreview'],
    select_card_from_trash_to_play: ['selectTrashCard'],
    select_card_from_trash_to_reveal: ['selectTrashCard'],
    select_card_from_hand_to_give: ['giveCard'],
    select_card_from_hand_to_reveal: ['revealCard'],
    select_card_from_revealed_deck: ['selectRevealedDeckCard'],
    prompt_shift_or_flip_revealed_card: ['resolveRevealBoardCardPrompt'],
    prompt_shift_or_flip_board_card_custom: ['resolveRevealBoardCardPrompt'],
    prompt_optional_shuffle_trash: ['resolvePrompt'],
    prompt_optional_discard_custom: ['resolveOptionalDiscardCustomPrompt'],
};
const GENERIC_DECISIONS: AIAction['type'][] = ['skip', 'selectLane', 'flipCard', 'deleteCard', 'returnCard', 'shiftCard', 'selectCard', 'resolveOptionalEffectPrompt'];
const LANE_DECISIONS: AIAction['type'][] = ['skip', 'selectLane', 'resolveOptionalEffectPrompt'];
const CARD_DECISIONS: AIAction['type'][] = ['skip', 'flipCard', 'deleteCard', 'returnCard', 'shiftCard', 'selectCard', 'resolveOptionalEffectPrompt'];

export function isDecisionValidFor(state: GameState, action: AIAction): boolean {
    const prompt = state.actionRequired;
    if (!prompt) {
        if (state.phase === 'compile') return action.type === 'compile' && state.compilableLanes.includes(action.laneIndex);
        if (state.phase === 'action') return action.type === 'playCard' || action.type === 'fillHand';
        return false;
    }
    const specific = PROMPT_DECISIONS[prompt.type];
    if (specific) return specific.includes(action.type) || action.type === 'skip';
    if ((prompt.type as string) === 'reveal_deck_draw_protocol') return (action.type as string) === 'confirmRevealDeckDrawProtocol';
    // Lane prompts take a lane, card prompts take a card (a stray tap must not answer the wrong kind)
    // (card check first: e.g. select_card_from_other_lanes_to_delete is a card prompt)
    if (/^select_(card|cards)_/.test(prompt.type) || /flip_self/.test(prompt.type)) return CARD_DECISIONS.includes(action.type);
    if (/lane/.test(prompt.type)) return LANE_DECISIONS.includes(action.type);
    return GENERIC_DECISIONS.includes(action.type);
}
