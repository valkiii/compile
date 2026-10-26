/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The host's copy of a running online game. iOS Safari may discard a background tab;
 * with this the host reopens the page and the game continues where it was.
 */

import { GameState } from '../types';
import { OnlineGameSetup } from './messages';

const KEY = 'compile_online_host_game';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface SavedHostGame {
    room: string;
    setup: OnlineGameSetup;
    state: GameState;
    savedAt: number;
}

let pending: SavedHostGame | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Throttled: game states change many times per second during animations. */
export function saveHostGame(room: string, setup: OnlineGameSetup, state: GameState) {
    pending = { room, setup, state, savedAt: Date.now() };
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        try {
            if (pending) localStorage.setItem(KEY, JSON.stringify(pending));
        } catch {
            // storage full / unavailable: resume just won't be offered
        }
    }, 800);
}

export function loadHostGame(room: string): SavedHostGame | null {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as SavedHostGame | null;
        if (!saved || saved.room !== room || Date.now() - saved.savedAt > MAX_AGE_MS || saved.state.winner) return null;
        return saved;
    } catch {
        return null;
    }
}

export function clearHostGame() {
    pending = null;
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}
