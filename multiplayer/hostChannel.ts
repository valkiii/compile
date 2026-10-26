/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Host side of an online game. The host's engine treats the guest as the "opponent":
 * - decide(): hands the engine the guest's queued move (or null = keep waiting)
 * - publish(): streams the game state, mirrored and with host secrets hidden, to the guest
 * - forwardAnimations(): replays the host's card animations on the guest's screen
 */

import { AIAction, GameState, Player } from '../types';
import { AnimatingCard, AnimationQueueItem } from '../types/animation';
import { RelayClient } from './relayClient';
import { OnlineMessage } from './messages';
import { actionFromGuest, decisionKey, hideCard, isDecisionValidFor, mirror, stateForGuest, swapWords } from './mirror';

/** Does this animated card come out of the host's private hand/deck without being revealed? */
const isHostSecret = (a: AnimatingCard): boolean => {
    const from = a.fromPosition;
    const fromPrivate = (from.type === 'hand' || from.type === 'deck') && from.owner === 'player';
    if (!fromPrivate) return false;
    const to = a.toPosition;
    if (to.type === 'trash') return false;                       // discarded cards are public
    if (to.type === 'lane' && a.targetIsFaceUp) return false;    // played face-up: public
    return true;
};

const DEBUG = typeof window !== 'undefined' && window.location.search.includes('debug');

export class HostChannel {
    private queue: { key: string; action: AIAction }[] = [];
    private awaitKey: string | null = null;
    private lastState: GameState | null = null;
    private lastSent: GameState | null = null;
    private sendScheduled = false;
    /** Called when a guest move arrives so the engine re-runs the paused opponent logic. */
    onRemoteAction: () => void = () => {};

    constructor(private client: RelayClient, readonly gameId: string) {}

    decide = (state: GameState): AIAction | null => {
        const key = decisionKey(state);
        while (this.queue.length > 0) {
            const next = this.queue.shift()!;
            if (next.key !== key) continue; // stale move for an earlier prompt
            const action = actionFromGuest(next.action);
            if (isDecisionValidFor(state, action)) {
                if (DEBUG) console.info('[online] host applies', JSON.stringify(action), 'for', state.actionRequired?.type ?? state.phase);
                this.awaitKey = null;
                return action;
            }
            console.warn('[online] guest move rejected for this prompt', action, state.actionRequired?.type);
        }
        if (this.awaitKey !== key) {
            this.awaitKey = key;
            this.lastState = state;
            // Tell the guest it's their move (the engine may not commit a new state for this pause)
            queueMicrotask(() => this.publish(state, true));
        }
        return null;
    };

    handleMessage(msg: OnlineMessage) {
        if (msg.k === 'action' && msg.gameId === this.gameId) {
            this.queue.push({ key: msg.key, action: msg.action });
            this.onRemoteAction();
        } else if (msg.k === 'sync' && this.lastState) {
            this.publish(this.lastState, true);
        }
    }

    publish(state: GameState, force = false) {
        this.lastState = state;
        if (!force && state === this.lastSent) return;
        if (this.sendScheduled) return;
        this.sendScheduled = true;
        // Coalesce bursts of state changes into one message
        setTimeout(() => {
            this.sendScheduled = false;
            const latest = this.lastState!;
            this.lastSent = latest;
            const awaitKey = this.awaitKey && this.awaitKey === decisionKey(latest) ? this.awaitKey : null;
            this.send({ k: 'state', gameId: this.gameId, state: stateForGuest(latest), awaitKey });
        }, 30);
    }

    forwardAnimations(items: Omit<AnimationQueueItem, 'id'>[]) {
        const forGuest = items.map(item => {
            const hostHand = item.snapshot?.player?.hand;
            const safe: Omit<AnimationQueueItem, 'id'> = {
                ...item,
                snapshot: item.snapshot && { ...item.snapshot, player: { ...item.snapshot.player, hand: (hostHand ?? []).map(hideCard) } },
                animatingCard: item.animatingCard && (isHostSecret(item.animatingCard) ? { ...item.animatingCard, card: hideCard(item.animatingCard.card) } : item.animatingCard),
                multiAnimatingCards: item.multiAnimatingCards?.map(c => (isHostSecret(c) ? { ...c, card: hideCard(c.card) } : c)),
            };
            const mirrored = mirror(safe);
            if (mirrored.logMessage) mirrored.logMessage = { ...mirrored.logMessage, message: swapWords(mirrored.logMessage.message) };
            return mirrored;
        });
        this.send({ k: 'anim', gameId: this.gameId, items: forGuest });
    }

    announceEnd(winner: Player) {
        this.send({ k: 'end', gameId: this.gameId, winner });
    }

    private send(msg: OnlineMessage) {
        this.client.send(msg);
    }
}
