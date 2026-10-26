/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solo "Deck Run" variant (adapted from the "Easy Solo Variant" posted on BoardGameGeek
 * for Compile: Main 1, thread 3465780):
 * - You pick your 3 protocols freely, the opponent gets 3 random ones.
 * - You only go through your deck ONCE: the moment your deck runs dry and your trash
 *   would be reshuffled into it, the run is over and you lose.
 * - Compile all 3 protocols before that happens (and before the AI does) to win.
 * Effects that deliberately shuffle your trash back (Clarity-4) are allowed: they extend the run.
 */

import { GameState } from '../../types';

export const SOLO_PROTOCOL_PICKS = 3;

/**
 * True when the transition prev -> next reshuffled the player's trash into an empty deck.
 * Checked on every state change instead of inside the many draw helpers so the core engine stays untouched.
 */
export function didPlayerReshuffle(prev: GameState, next: GameState): boolean {
    const deckGrew = next.player.deck.length > prev.player.deck.length;
    const trashShrank = next.player.discard.length < prev.player.discard.length;
    if (!deckGrew || !trashShrank) return false;

    const newLogs = next.log.slice(prev.log.length);
    const deliberateShuffle = newLogs.some(entry => /from trash into deck/i.test(entry.message));
    return !deliberateShuffle;
}
