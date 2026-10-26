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
    step: number;
    hostPicks: string[];
    guestPicks: string[];
    categories: string[];
}

/** Draft order 1-2-2-1, host first (same as the vs-AI draft). */
export const ONLINE_DRAFT_STEPS: { who: 'host' | 'guest'; picks: number }[] = [
    { who: 'host', picks: 1 },
    { who: 'guest', picks: 2 },
    { who: 'host', picks: 2 },
    { who: 'guest', picks: 1 },
];

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
    | { k: 'rematch' };

export const isOnlineMessage = (data: unknown): data is OnlineMessage =>
    !!data && typeof data === 'object' && typeof (data as { k?: unknown }).k === 'string';
