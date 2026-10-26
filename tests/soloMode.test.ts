/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../logic/game/stateManager';
import { didPlayerReshuffle } from '../logic/game/soloMode';
import { GameState } from '../types';

// Protocol JSON is not loaded in unit tests, so decks are filled with stand-in cards
const fakeCards = (n: number) => Array.from({ length: n }, (_, i) => ({ protocol: 'Fire', value: i % 6, top: '', middle: '', bottom: '' })) as GameState['player']['deck'];

const base = (): GameState => {
    const state = createInitialState(['Fire', 'Water', 'Life'], ['Death', 'Metal', 'Light'], false);
    return { ...state, player: { ...state.player, deck: fakeCards(13) }, opponent: { ...state.opponent, deck: fakeCards(13) } };
};

describe('Solo Deck Run: reshuffle detection', () => {
    it('detects the trash being reshuffled into an empty deck', () => {
        const prev = base();
        prev.player = { ...prev.player, deck: [], discard: prev.player.deck.slice(0, 6) };
        const next: GameState = { ...prev, player: { ...prev.player, deck: prev.player.discard.slice(1), discard: [] } };
        expect(didPlayerReshuffle(prev, next)).toBe(true);
    });

    it('ignores normal draws and discards', () => {
        const prev = base();
        const next: GameState = { ...prev, player: { ...prev.player, deck: prev.player.deck.slice(2) } };
        expect(didPlayerReshuffle(prev, next)).toBe(false);
    });

    it('allows a deliberate "shuffle your trash into your deck" effect (Clarity-4)', () => {
        const prev = base();
        prev.player = { ...prev.player, deck: [], discard: prev.player.deck.slice(0, 4) };
        const next: GameState = {
            ...prev,
            player: { ...prev.player, deck: prev.player.discard, discard: [] },
            log: [...prev.log, { player: 'player', message: 'Clarity-4: Shuffled 4 cards from trash into deck.' } as GameState['log'][number]],
        };
        expect(didPlayerReshuffle(prev, next)).toBe(false);
    });

    it('ignores the opponent reshuffling', () => {
        const prev = base();
        prev.opponent = { ...prev.opponent, deck: [], discard: prev.opponent.deck.slice(0, 5) };
        const next: GameState = { ...prev, opponent: { ...prev.opponent, deck: prev.opponent.discard, discard: [] } };
        expect(didPlayerReshuffle(prev, next)).toBe(false);
    });
});
