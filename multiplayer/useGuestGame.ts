/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Guest side of an online game. Exposes the same API as useGameState so GameScreen works
 * unchanged, but runs no engine: the state comes from the host (already mirrored, so the
 * guest is "player"), and every action is sent to the host as the move the AI would make.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AIAction, GameState, Player } from '../types';
import { AnimationQueueItem } from '../types/animation';
import * as stateManager from '../logic/game/stateManager';
import * as resolvers from '../logic/game/resolvers';
import { RelayClient } from './relayClient';
import { isOnlineMessage } from './messages';
import { flipPlayer } from './mirror';

export interface GuestGameOptions {
    client: RelayClient;
    gameId: string;
    playerProtocols: string[];
    opponentProtocols: string[];
    useControlMechanic: boolean;
    onEndGame: (winner: Player, finalState: GameState) => void;
    enqueueAnimations?: (items: Omit<AnimationQueueItem, 'id'>[]) => void;
}

/** Which card decision the AI would send for the pending prompt. */
function cardDecision(state: GameState, cardId: string): AIAction {
    const type = state.actionRequired?.type ?? '';
    if (/flip/.test(type)) return { type: 'flipCard', cardId };
    if (/delete/.test(type)) return { type: 'deleteCard', cardId };
    if (/return/.test(type)) return { type: 'returnCard', cardId };
    if (/shift/.test(type)) return { type: 'shiftCard', cardId };
    return { type: 'selectCard', cardId };
}

export function useGuestGame({ client, gameId, playerProtocols, opponentProtocols, useControlMechanic, onEndGame, enqueueAnimations }: GuestGameOptions) {
    const [hostState, setHostState] = useState<GameState>(() =>
        stateManager.recalculateAllLaneValues(stateManager.createInitialState(playerProtocols, opponentProtocols, useControlMechanic, 'opponent'))
    );
    const [awaitKey, setAwaitKey] = useState<string | null>(null);
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    // "Play a card from your hand" effects pick the card first, then the lane: kept locally
    const [localPlay, setLocalPlay] = useState<GameState | null>(null);
    const [hasState, setHasState] = useState(false);

    const stateRef = useRef(hostState);
    stateRef.current = hostState;
    const awaitKeyRef = useRef(awaitKey);
    awaitKeyRef.current = awaitKey;
    const endedRef = useRef(false);
    const onEndGameRef = useRef(onEndGame);
    onEndGameRef.current = onEndGame;
    const enqueueRef = useRef(enqueueAnimations);
    enqueueRef.current = enqueueAnimations;

    useEffect(() => {
        const off = client.on(event => {
            if (event.type === 'session' || (event.type === 'peer' && event.connected)) {
                client.send({ k: 'sync' });
                return;
            }
            if (event.type !== 'message' || !isOnlineMessage(event.data)) return;
            const msg = event.data;
            if ('gameId' in msg && msg.gameId !== gameId) return;
            if (msg.k === 'state') {
                setHostState(msg.state);
                setAwaitKey(msg.awaitKey);
                setLocalPlay(null);
                setHasState(true);
            } else if (msg.k === 'anim') {
                enqueueRef.current?.(msg.items);
            } else if (msg.k === 'end' && !endedRef.current) {
                endedRef.current = true;
                // Let the final animations play before switching screens
                setTimeout(() => onEndGameRef.current(flipPlayer(msg.winner), stateRef.current), 1500);
            }
        });
        client.send({ k: 'sync' });
        return off;
    }, [client, gameId]);

    const send = useCallback((action: AIAction) => {
        const key = awaitKeyRef.current;
        if (!key) return; // not our move (yet)
        client.send({ k: 'action', gameId, key, action });
        setAwaitKey(null); // one move per prompt; the host answers with fresh state
        setSelectedCard(null);
        setLocalPlay(null);
    }, [client, gameId]);

    const gameState = localPlay ?? hostState;

    const playSelectedCard = (laneIndex: number, isFaceUp: boolean) => {
        if (!selectedCard) return;
        send({ type: 'playCard', cardId: selectedCard, laneIndex, isFaceUp });
    };

    const playFromLocalSelection = (laneIndex: number, forceFaceDown: boolean) => {
        const pending = localPlay?.actionRequired as { cardInHandId?: string; isFaceDown?: boolean; ignoreProtocolMatching?: boolean } | null;
        if (!localPlay || !pending?.cardInHandId) return false;
        const card = localPlay.player.hand.find(c => c.id === pending.cardInHandId);
        const matches = !!card && (card.protocol === localPlay.player.protocols[laneIndex] || card.protocol === localPlay.opponent.protocols[laneIndex]);
        const isFaceUp = !forceFaceDown && pending.isFaceDown !== true && (matches || !!pending.ignoreProtocolMatching);
        send({ type: 'playCard', cardId: pending.cardInHandId, laneIndex, isFaceUp });
        return true;
    };

    const selectHandCardForAction = (cardId: string) => {
        if (!awaitKeyRef.current) return;
        const next = resolvers.selectHandCardForAction(hostState, cardId);
        const pending = next.actionRequired as { type?: string; preSelectedLane?: number; targetLaneIndex?: number; forcedLaneIndex?: number; isFaceDown?: boolean; faceDown?: boolean } | null;
        if (pending?.type === 'select_lane_for_play') {
            setLocalPlay(next);
            return;
        }
        // Effect fixed lane and orientation: play right away
        const lane = pending?.preSelectedLane ?? pending?.forcedLaneIndex ?? pending?.targetLaneIndex ?? 0;
        send({ type: 'playCard', cardId, laneIndex: lane, isFaceUp: !(pending?.isFaceDown ?? pending?.faceDown) });
    };

    const noop = () => {};

    return {
        gameState,
        selectedCard,
        setSelectedCard,
        playSelectedCard,
        fillHand: () => send({ type: 'fillHand' }),
        discardCardFromHand: (cardId: string) => send({ type: 'discardCards', cardIds: [cardId] }),
        compileLane: (laneIndex: number) => send({ type: 'compile', laneIndex }),
        resolveActionWithCard: (cardId: string) => send(cardDecision(stateRef.current, cardId)),
        resolveActionWithLane: (laneIndex: number) => {
            if (!playFromLocalSelection(laneIndex, false)) send({ type: 'selectLane', laneIndex });
        },
        resolveActionWithLaneFaceDown: (laneIndex: number) => {
            if (!playFromLocalSelection(laneIndex, true)) send({ type: 'selectLane', laneIndex });
        },
        selectHandCardForAction,
        skipAction: () => send({ type: 'skip' }),
        resolveActionWithHandCard: (cardId: string) =>
            send(stateRef.current.actionRequired?.type === 'select_card_from_hand_to_give' ? { type: 'giveCard', cardId } : { type: 'revealCard', cardId }),
        resolveOptionalDiscardCustomPrompt: (accept: boolean) => send({ type: 'resolveOptionalDiscardCustomPrompt', accept }),
        resolveOptionalEffectPrompt: (accept: boolean) => {
            if (stateRef.current.actionRequired?.type === 'prompt_optional_shuffle_trash') {
                send(accept ? { type: 'resolvePrompt', accept } : { type: 'skip' });
            } else {
                send({ type: 'resolveOptionalEffectPrompt', accept });
            }
        },
        resolveVariableDiscard: (cardIds: string[]) => send({ type: 'discardCards', cardIds }),
        resolveRevealBoardCardPrompt: (choice: 'shift' | 'flip' | 'skip') => send({ type: 'resolveRevealBoardCardPrompt', choice }),
        resolveRearrangeProtocols: (newOrder: string[]) => send({ type: 'rearrangeProtocols', newOrder }),
        resolveOptionalDrawPrompt: (accept: boolean) => send({ type: 'resolveOptionalEffectPrompt', accept }),
        resolveSwapProtocols: (indices: [number, number]) => send({ type: 'resolveSwapProtocols', indices }),
        resolveControlMechanicPrompt: (choice: 'player' | 'opponent' | 'skip') => send({ type: 'resolveControlMechanicPrompt', choice }),
        resolveCustomChoice: (optionIndex: number) => send({ type: 'resolveCustomChoice', optionIndex }),
        resolveSelectRevealedDeckCard: (cardId: string) => send({ type: 'selectRevealedDeckCard', cardId }),
        resolveRevealDeckDrawProtocol: () => send({ type: 'confirmRevealDeckDrawProtocol' } as unknown as AIAction),
        resolveStateNumber: (number: number) => send({ type: 'stateNumber', number }),
        resolveStateProtocol: (protocol: string) => send({ type: 'stateProtocol', protocol }),
        resolveSelectFromDrawnToReveal: (cardId: string) => send({ type: 'selectFromDrawnToReveal', cardId }),
        resolveConfirmDeckDiscard: () => send({ type: 'confirmDeckDiscard' }),
        resolveConfirmDeckPlayPreview: () => send({ type: 'confirmDeckPlayPreview' }),
        resolveSelectTrashCardToPlay: (cardIndex: number) => send({ type: 'selectTrashCard', cardIndex }),
        resolveSelectTrashCardToReveal: (cardIndex: number) => send({ type: 'selectTrashCard', cardIndex }),
        setupTestScenario: noop as (s: unknown) => void,
        // Online-only extras
        isMyMove: !!awaitKey,
        hasHostState: hasState,
    };
}
