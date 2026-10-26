/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Messages exchanged between host and guest through the relay. The host runs the game;
 * everything in GameState / animations is sent already mirrored to the guest's perspective.
 */

import { AIAction, GameState, Player } from '../types';
import { AnimationQueueItem } from '../types/animation';

export interface DraftState {
    /** Coin toss (done by the host at the start): this player picks first and starts the game */
    first: 'host' | 'guest';
    step: number;
    hostPicks: string[];
    guestPicks: string[];
    categories: string[];
}

/** Draft order 1-2-2-1; the coin toss winner picks first (same as the vs-AI draft). */
export function onlineDraftSteps(first: 'host' | 'guest'): { who: 'host' | 'guest'; picks: number }[] {
    const second = first === 'host' ? 'guest' : 'host';
    return [
        { who: first, picks: 1 },
        { who: second, picks: 2 },
        { who: first, picks: 2 },
        { who: second, picks: 1 },
    ];
}

export interface OnlineGameSetup {
    gameId: string;
    hostProtocols: string[];
    guestProtocols: string[];
    /** In the host's frame ('player' = host). */
    startingPlayer: Player;
    useControl: boolean;
}

export type OnlineMessage =
    | { k: 'hello' }
    | { k: 'draft'; draft: DraftState }
    | { k: 'draftPick'; protocols: string[] }
    | { k: 'start'; game: OnlineGameSetup }
    | { k: 'state'; gameId: string; state: GameState; awaitKey: string | null }
    | { k: 'anim'; gameId: string; items: Omit<AnimationQueueItem, 'id'>[] }
    | { k: 'action'; gameId: string; key: string; action: AIAction }
    | { k: 'sync' }
    | { k: 'end'; gameId: string; winner: Player }
    | { k: 'rematch' }
    | { k: 'chat'; id: string; text: string; at: number };

export const isOnlineMessage = (data: unknown): data is OnlineMessage =>
    !!data && typeof data === 'object' && typeof (data as { k?: unknown }).k === 'string';
