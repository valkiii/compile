/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getActivePassiveRules } from './passiveRuleChecker';
import { needsControlMechanic } from '../customProtocols/main3Rules';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, PlayerState, PlayedCard } from '../../types';
import { buildDeck, shuffleDeck } from '../../utils/gameLogic';
import { drawCards as drawCardsUtil } from '../../utils/gameStateModifiers';
import { log } from '../utils/log';

export const createInitialPlayerState = (protocols: string[]): PlayerState => {
    const deck = shuffleDeck(buildDeck(protocols));
    const { drawnCards, remainingDeck } = drawCardsUtil(deck, [], 5);

    const initialStats = {
        cardsPlayed: 0,
        cardsDiscarded: 0,
        cardsDeleted: 0,
        cardsFlipped: 0,
        cardsShifted: 0,
        cardsDrawn: drawnCards.length, // Initial draw
        cardsReturned: 0,
        handsRefreshed: 0,
    };

    const hand = drawnCards.map(c => ({ ...c, id: uuidv4(), isFaceUp: true }));

    return {
        protocols,
        deck: remainingDeck,
        hand,
        lanes: [[], [], []],
        discard: [],
        compiled: [false, false, false],
        laneValues: [0, 0, 0],
        cannotCompile: false,
        stats: initialStats,
    };
};

export const createInitialState = (playerProtocols: string[], opponentProtocols: string[], useControlMechanic: boolean, startingPlayer: Player = 'player'): GameState => {
    const playerState = createInitialPlayerState(playerProtocols);
    const opponentState = createInitialPlayerState(opponentProtocols);
    const initialState: GameState = {
        player: playerState,
        opponent: opponentState,
        turn: startingPlayer,
        phase: 'start',
        controlCardHolder: null,
        // Main 3 cards gain, lose and check control: always on when one of them is in the game
        useControlMechanic: useControlMechanic || needsControlMechanic([...playerProtocols, ...opponentProtocols]),
        winner: null,
        log: [],
        actionRequired: null,
        queuedActions: [],
        compilableLanes: [],
        processedStartEffectIds: [],
        processedEndEffectIds: [],
        lastPlayedCardId: undefined,
        stats: {
            player: playerState.stats,
            opponent: opponentState.stats,
        },
        // Initialize detailed game stats for breakdown tracking
        detailedGameStats: {
            cardsPlayed: { playerFromHand: 0, playerFromEffect: 0, aiFromHand: 0, aiFromEffect: 0, playerFaceUp: 0, playerFaceDown: 0, aiFaceUp: 0, aiFaceDown: 0 },
            cardsDrawn: { playerFromRefresh: 0, playerFromEffect: 0, aiFromRefresh: 0, aiFromEffect: 0 },
            compiles: { playerFirstCompile: 0, playerRecompile: 0, aiFirstCompile: 0, aiRecompile: 0 },
            refreshes: { playerCardsDrawn: 0, aiCardsDrawn: 0 },
        }
    };

    // Log game start and protocols
    const starterName = startingPlayer === 'player' ? 'Player' : 'Opponent';
    const playerProtocolsList = playerProtocols.join(', ');
    const opponentProtocolsList = opponentProtocols.join(', ');

    let stateWithLogs = log(initialState, 'player', `Game Started.`);
    stateWithLogs = log(stateWithLogs, 'player', `Player protocols: ${playerProtocolsList}`);
    stateWithLogs = log(stateWithLogs, 'opponent', `Opponent protocols: ${opponentProtocolsList}`);
    stateWithLogs = log(stateWithLogs, 'player', `${starterName} goes first.`);

    return stateWithLogs;
}

export const getEffectiveCardValue = (card: PlayedCard, lane: PlayedCard[], state?: GameState, laneIndex?: number, cardOwner?: Player): number => {
    if (card.isFaceUp) {
        return card.value;
    }

    // Check if Darkness-2 (hardcoded) is active in the lane
    const hasDarkness2 = lane.some(c => c.isFaceUp && c.protocol === 'Darkness' && c.value === 2);
    if (hasDarkness2) {
        return 4;
    }

    // Check for custom cards with set_to_fixed value modifiers
    if (state && laneIndex !== undefined && cardOwner !== undefined) {
        const modifiers = getActiveValueModifiers(state);
        for (const modifier of modifiers) {
            if (modifier.type === 'set_to_fixed') {
                const appliesToLane = modifier.scope === 'global' || (modifier.scope === 'this_lane' && modifier.laneIndex === laneIndex);
                if (!appliesToLane) continue;

                // CRITICAL: Check if modifier applies to this card's owner
                const modifierOwner = modifier.cardOwner;
                if (modifier.target === 'own_cards' && modifierOwner !== cardOwner) continue;
                if (modifier.target === 'opponent_cards' && modifierOwner === cardOwner) continue;

                // Check if modifier filter matches this card
                const filter = modifier.filter;
                if (filter) {
                    const faceStateMatches = !filter.faceState || filter.faceState === 'any' ||
                                           (filter.faceState === 'face_down' && !card.isFaceUp) ||
                                           (filter.faceState === 'face_up' && card.isFaceUp);

                    if (faceStateMatches) {
                        return modifier.value;
                    }
                }
            }
        }
    }

    return 2; // Default face-down value
};

const calculateBaseLaneValue = (lane: PlayedCard[], state?: GameState, laneIndex?: number, cardOwner?: Player): number => {
    let value = 0;
    for (const card of lane) {
        if (card.isFaceUp) {
            value += card.value;
        } else {
            // Check for value modifiers (Darkness-2, custom protocols)
            value += getEffectiveCardValue(card, lane, state, laneIndex, cardOwner);
        }
    }
    return Math.max(0, value);
};

/**
 * Get active value modifiers from custom protocol cards
 */
interface ValueModifier {
    type: 'add_per_condition' | 'set_to_fixed' | 'add_to_total' | 'add_opponent_highest_in_lane' | 'ignore_highest_in_lane';
    value: number;
    condition?: 'per_face_down_card' | 'per_face_up_card' | 'per_card' | 'per_card_in_hand' | 'per_opponent_card_in_lane' | 'has_non_own_protocol_face_up' | 'this_card_covered_by_same_protocol';
    target: 'own_cards' | 'opponent_cards' | 'all_cards' | 'own_total' | 'opponent_total' | 'both_totals';
    sourceCardId?: string;
    scope: 'this_lane' | 'global';
    sourceCardProtocol?: string; // For has_non_own_protocol_face_up condition
    filter?: {
        faceState?: 'face_up' | 'face_down' | 'any';
        position?: 'covered' | 'uncovered' | 'any';
    };
    cardOwner: Player;
    laneIndex: number;
}

function getActiveValueModifiers(state: GameState): ValueModifier[] {
    const modifiers: ValueModifier[] = [];

    for (const player of ['player', 'opponent'] as Player[]) {
        state[player].lanes.forEach((lane, laneIndex) => {
            lane.forEach(card => {
                if (card.isFaceUp) {
                    const customCard = card as any;
                    if (customCard.customEffects) {
                        // Check all three boxes for value modifiers
                        const allEffects = [
                            ...(customCard.customEffects.topEffects || []),
                            ...(customCard.customEffects.middleEffects || []),
                            ...(customCard.customEffects.bottomEffects || [])
                        ];

                        allEffects.forEach((effect: any) => {
                            if (effect.params.action === 'value_modifier' && effect.trigger === 'passive') {
                                modifiers.push({
                                    ...effect.params.modifier,
                                    cardOwner: player,
                                    laneIndex,
                                    sourceCardProtocol: card.protocol, // Store for has_non_own_protocol_face_up
                                    sourceCardId: card.id,
                                });
                            }
                        });
                    }
                }
            });
        });
    }

    return modifiers;
}

/**
 * Apply custom protocol value modifiers
 */
function applyCustomValueModifiers(
    state: GameState,
    playerValues: number[],
    opponentValues: number[]
): { finalPlayerValues: number[]; finalOpponentValues: number[] } {
    const modifiers = getActiveValueModifiers(state);
    const finalPlayerValues = [...playerValues];
    const finalOpponentValues = [...opponentValues];

    // Wrath-0: cards with the highest value in the line don't add to either total (once per line)
    const ignoredLanes = new Set(modifiers.filter(m => m.type === 'ignore_highest_in_lane').map(m => m.laneIndex));
    for (const lane of ignoredLanes) {
        const valueOf = (p: Player, c: PlayedCard) => getEffectiveCardValue(c, state[p].lanes[lane], state, lane, p);
        const all = (['player', 'opponent'] as Player[]).flatMap(p => state[p].lanes[lane].map(c => valueOf(p, c)));
        if (all.length === 0) continue;
        const highest = Math.max(...all);
        finalPlayerValues[lane] -= state.player.lanes[lane].filter(c => valueOf('player', c) === highest).length * highest;
        finalOpponentValues[lane] -= state.opponent.lanes[lane].filter(c => valueOf('opponent', c) === highest).length * highest;
    }

    for (const modifier of modifiers) {
        const { type, value, condition, target, scope, filter, cardOwner, laneIndex } = modifier;

        // Determine which lanes to affect
        const lanes: number[] = scope === 'global' ? [0, 1, 2] : [laneIndex];

        for (const lane of lanes) {
            switch (type) {
                case 'add_per_condition': {
                    if (!condition) continue;

                    let count = 0;
                    const playerLane = state.player.lanes[lane];
                    const opponentLane = state.opponent.lanes[lane];

                    // Count based on condition
                    if (condition === 'per_face_down_card') {
                        count = playerLane.filter(c => !c.isFaceUp).length +
                                opponentLane.filter(c => !c.isFaceUp).length;
                    } else if (condition === 'per_face_up_card') {
                        count = playerLane.filter(c => c.isFaceUp).length +
                                opponentLane.filter(c => c.isFaceUp).length;
                    } else if (condition === 'per_card') {
                        count = playerLane.length + opponentLane.length;
                    } else if (condition === 'per_card_in_hand') {
                        // Clarity-0: Count cards in the card owner's hand
                        count = state[cardOwner].hand.length;
                    } else if (condition === 'per_opponent_card_in_lane') {
                        // Mirror-0: Count opponent's cards in this lane
                        const opponent = cardOwner === 'player' ? 'opponent' : 'player';
                        count = state[opponent].lanes[lane].length;
                    }

                    // Apply to target
                    if (target === 'own_total' && cardOwner === 'player') {
                        finalPlayerValues[lane] += value * count;
                    } else if (target === 'own_total' && cardOwner === 'opponent') {
                        finalOpponentValues[lane] += value * count;
                    } else if (target === 'opponent_total' && cardOwner === 'player') {
                        finalOpponentValues[lane] += value * count;
                    } else if (target === 'opponent_total' && cardOwner === 'opponent') {
                        finalPlayerValues[lane] += value * count;
                    }
                    break;
                }

                case 'set_to_fixed':
                case 'ignore_highest_in_lane': {
                    // Handled per card (getEffectiveCardValue) / before this loop
                    break;
                }

                case 'add_opponent_highest_in_lane': {
                    // Envy-0: + the value of the opponent's highest card in this line
                    const opponent = cardOwner === 'player' ? 'opponent' : 'player';
                    const oppLane = state[opponent].lanes[lane];
                    const highest = oppLane.length ? Math.max(...oppLane.map(c => getEffectiveCardValue(c, oppLane, state, lane, opponent))) : 0;
                    if (cardOwner === 'player') finalPlayerValues[lane] += highest;
                    else finalOpponentValues[lane] += highest;
                    break;
                }

                case 'add_to_total': {
                    // NEW: Check has_non_own_protocol_face_up condition (Diversity-3)
                    if (condition === 'has_non_own_protocol_face_up') {
                        // Only apply if there are face-up cards with different protocol in owner's lane
                        const ownerLane = state[cardOwner].lanes[laneIndex];
                        const sourceProtocol = modifier.sourceCardProtocol;

                        if (!sourceProtocol) continue; // Skip if no source protocol stored

                        // Check if any OTHER face-up card in owner's stack has different protocol
                        const hasNonOwnProtocol = ownerLane.some(c =>
                            c.isFaceUp && c.protocol !== sourceProtocol
                        );

                        if (!hasNonOwnProtocol) continue; // Condition not met, skip this modifier
                    }

                    // Sloth-0: only while the card is covered by a card of its own protocol
                    if (condition === 'this_card_covered_by_same_protocol') {
                        const ownerLane = state[cardOwner].lanes[laneIndex];
                        const idx = ownerLane.findIndex(c => c.id === modifier.sourceCardId);
                        const coveringCard = idx >= 0 ? ownerLane[idx + 1] : undefined;
                        if (!coveringCard || !coveringCard.isFaceUp || coveringCard.protocol !== modifier.sourceCardProtocol) continue;
                    }

                    if (target === 'both_totals') {
                        // Lust-0: each player's total in this line
                        finalPlayerValues[lane] += value;
                        finalOpponentValues[lane] += value;
                        break;
                    }

                    if (target === 'own_total' && cardOwner === 'player') {
                        finalPlayerValues[lane] += value;
                    } else if (target === 'own_total' && cardOwner === 'opponent') {
                        finalOpponentValues[lane] += value;
                    } else if (target === 'opponent_total' && cardOwner === 'player') {
                        finalOpponentValues[lane] += value;
                    } else if (target === 'opponent_total' && cardOwner === 'opponent') {
                        finalPlayerValues[lane] += value;
                    }
                    break;
                }
            }
        }
    }

    return {
        finalPlayerValues: finalPlayerValues.map(v => Math.max(0, v)),
        finalOpponentValues: finalOpponentValues.map(v => Math.max(0, v))
    };
}

function applyStaticValueModifiers(state: GameState, playerBase: number[], opponentBase: number[]): { finalPlayerValues: number[], finalOpponentValues: number[] } {
    let finalPlayerValues = [...playerBase];
    let finalOpponentValues = [...opponentBase];

    // NOTE: Metal-0 hardcoded logic removed - now uses custom protocol value_modifier
    // Cross-lane effects are now handled via applyCustomValueModifiers

    // NOTE: Apathy-0 hardcoded logic removed - now uses custom protocol value_modifier
    // NOTE: Darkness-2 is handled in getEffectiveCardValue, not here (to avoid double-counting)

    return { finalPlayerValues, finalOpponentValues };
}


export const recalculateAllLaneValues = (state: GameState): GameState => {
    const playerBaseValues = state.player.lanes.map((lane, idx) => calculateBaseLaneValue(lane, state, idx, 'player'));
    const opponentBaseValues = state.opponent.lanes.map((lane, idx) => calculateBaseLaneValue(lane, state, idx, 'opponent'));

    // Apply hardcoded modifiers (Darkness-2 only - others moved to custom protocols)
    const staticResult = applyStaticValueModifiers(state, playerBaseValues, opponentBaseValues);

    // Apply custom protocol value modifiers
    const { finalPlayerValues, finalOpponentValues } = applyCustomValueModifiers(
        state,
        staticResult.finalPlayerValues,
        staticResult.finalOpponentValues
    );

    return {
        ...state,
        player: { ...state.player, laneValues: finalPlayerValues },
        opponent: { ...state.opponent, laneValues: finalOpponentValues },
    };
};

export const calculateCompilableLanes = (state: GameState, player: Player): number[] => {
    const compilableLanes = [];
    const playerState = state[player];
    const opponentState = state[player === 'player' ? 'opponent' : 'player'];
    // Lust-0 (bottom): "Your opponent can't compile if you have control"
    const blockedByControl = getActivePassiveRules(state).some(({ rule, cardOwner }) =>
        rule.type === 'block_opponent_compile_while_controlling' && cardOwner !== player && state.controlCardHolder === cardOwner);
    if (!playerState.cannotCompile && !blockedByControl) {
        for(let i = 0; i < 3; i++) {
            const playerValue = playerState.laneValues[i];
            const opponentValue = opponentState.laneValues[i];
            if(playerValue >= 10 && playerValue > opponentValue) {
                compilableLanes.push(i);
            }
        }
    }
    return compilableLanes;
};

/**
 * Calculate total lane value for a specific player (uses cached laneValues)
 * This is more efficient than recalculating from scratch
 */
export const getPlayerLaneValue = (state: GameState, player: Player, laneIndex: number): number => {
    return state[player].laneValues[laneIndex];
};

/**
 * Find lanes where opponent has higher total value than the card owner (Courage-1)
 */
export const getLanesWhereOpponentHasHigherValue = (state: GameState, cardOwner: Player): number[] => {
    const opponent = cardOwner === 'player' ? 'opponent' : 'player';
    const validLanes: number[] = [];

    for (let i = 0; i < 3; i++) {
        const ownValue = state[cardOwner].laneValues[i];
        const oppValue = state[opponent].laneValues[i];
        if (oppValue > ownValue) {
            validLanes.push(i);
        }
    }
    return validLanes;
};

/**
 * Find lane(s) with opponent's highest total value (Courage-3)
 * Returns array in case of ties
 */
export const getOpponentHighestValueLanes = (state: GameState, cardOwner: Player): number[] => {
    const opponent = cardOwner === 'player' ? 'opponent' : 'player';
    let maxValue = -1;
    let maxLanes: number[] = [];

    for (let i = 0; i < 3; i++) {
        const oppValue = state[opponent].laneValues[i];
        if (oppValue > maxValue) {
            maxValue = oppValue;
            maxLanes = [i];
        } else if (oppValue === maxValue) {
            maxLanes.push(i);
        }
    }
    return maxLanes;
};