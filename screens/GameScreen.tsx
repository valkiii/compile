/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import useState and useEffect from React, and fix malformed import.
import { needsControlMechanic } from '../logic/customProtocols/main3Rules';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CardComponent } from '../components/Card';
import { useGameState } from '../hooks/useGameState';
import { GameBoard } from '../components/GameBoard';
import { PhaseController } from '../components/PhaseController';
import { GameState, Player, PlayedCard, Difficulty, ActionRequired, GamePhase, GameMode } from '../types';
import { GameInfoPanel } from '../components/GameInfoPanel';
import { LogModal } from '../components/LogModal';
import { isCardTargetable } from '../utils/targeting';
import { Toaster } from '../components/Toaster';
import { RearrangeProtocolsModal } from '../components/RearrangeProtocolsModal';
import { SwapProtocolsModal } from '../components/SwapProtocolsModal';
import { StateNumberModal } from '../components/StateNumberModal';
import { StateProtocolModal } from '../components/StateProtocolModal';
import { SelectFromDrawnModal } from '../components/SelectFromDrawnModal';
import { RevealedDeckModal } from '../components/RevealedDeckModal';
import { RevealedDeckTopModal } from '../components/RevealedDeckTopModal';
import { DeckDiscardModal } from '../components/DeckDiscardModal';
import { DeckPlayPreviewModal } from '../components/DeckPlayPreviewModal';
import { TrashSelectionModal } from '../components/TrashSelectionModal';
import { DebugModal } from '../components/DebugModal';
import { CoinFlipModal } from '../components/CoinFlipModal';
import { useStatistics } from '../hooks/useStatistics';
import { DebugPanel } from '../components/DebugPanel';
import { hasRequireNonMatchingProtocolRule, hasAnyProtocolPlayRule, hasPlayOnOpponentSideRule, canPlayFaceUpDueToSameProtocolRule } from '../logic/game/passiveRuleChecker';
import { AnimationQueueProvider, useAnimationQueue } from '../contexts/AnimationQueueContext';
import { AnimationOverlay } from '../components/AnimationOverlay';
import { snapshotToGameState } from '../utils/snapshotUtils';
import { useIsCompact, useIsPhoneLandscape } from '../hooks/useIsCompact';
import { CardDetailSheet } from '../components/CardDetailSheet';
import { MobileTopBar, MiniPile } from '../components/MobileGameHud';
import { CoachHints } from '../components/CoachHints';
import { TutorialSlides } from '../components/TutorialSlides';
import { didPlayerReshuffle } from '../logic/game/soloMode';
import { RelayClient } from '../multiplayer/relayClient';
import { HostChannel } from '../multiplayer/hostChannel';
import { OnlineGameSetup, isOnlineMessage } from '../multiplayer/messages';
import { useGuestGame } from '../multiplayer/useGuestGame';
import { OnlineStatusBar } from '../components/OnlineStatusBar';
import type { CoinToss } from './ProtocolSelection';
import { playSound, soundForAnimation } from '../utils/sound';
import { SoundToggle } from '../components/SoundToggle';
import { EffectsOverlay } from '../components/EffectsOverlay';
import { ZoomControls, loadZoom, saveZoom, useZoomGestures } from '../components/ZoomControls';
import { ConfirmMove, PendingMove, confirmMovesEnabled } from '../components/ConfirmMove';
import { haptic } from '../utils/haptics';
import '../styles/layouts/tutorial.css';

const SOLO_DECK_OUT_REASON = 'Your deck ran dry. In a Solo Deck Run your trash is never reshuffled.';
const SOLO_LOW_DECK_WARNING = 3;


interface GameScreenProps {
  onBack: () => void;
  // FIX: Updated onEndGame prop type to match the expected signature from App.tsx and useGameState hook.
  onEndGame: (winner: Player, finalState: GameState, reason?: string) => void;
  playerProtocols: string[];
  opponentProtocols: string[];
  difficulty: Difficulty;
  useControlMechanic: boolean;
  mode?: GameMode;
  startingPlayer?: Player;
  // E2E Testing: Setup function for complex test scenarios
  initialScenarioSetup?: ((state: GameState) => GameState) | null;
  // Online multiplayer (mode 'online')
  online?: OnlineGameProps;
  /** Coin toss done before the draft (its winner picks first and starts): no toss in the game */
  coinToss?: CoinToss | null;
}

export interface OnlineGameProps {
  client: RelayClient;
  role: 'host' | 'guest';
  setup: OnlineGameSetup;
  /** Host only: resume a saved game */
  initialState?: GameState;
  /** Host only: persist the game so it survives Safari reloading the tab */
  onHostStateChange?: (state: GameState) => void;
}

// Prompts answered by choosing a lane (tapping anywhere in that lane, cards included)
const LANE_SELECTION_ACTIONS = new Set<string>(['select_lane_custom', 'select_lane_for_shift', 'select_lane_for_shift_all', 'shift_flipped_card_optional', 'select_lane_for_play', 'select_lane_for_delete', 'select_lane_for_death_2', 'select_lane_for_life_3_play', 'select_lane_to_shift_revealed_card_for_light_2', 'select_lane_to_shift_revealed_board_card_custom', 'select_lane_to_shift_cards_for_light_3', 'select_lane_for_water_3', 'select_lane_for_metal_3_delete', 'select_lane_for_delete_all', 'select_lane_for_return', 'select_lanes_for_swap_stacks']);

type PreviewState = {
  card: PlayedCard;
  showContents: boolean;
} | null;

const findCardOnBoard = (state: GameState, cardId: string | undefined): { card: PlayedCard, owner: Player } | null => {
    if (!cardId) return null;
    for (const p of ['player', 'opponent'] as Player[]) {
        for (const lane of state[p].lanes) {
            const card = lane.find(c => c.id === cardId);
            if (card) return { card, owner: p };
        }
    }
    return null;
}

const ACTIONS_REQUIRING_HAND_INTERACTION = new Set<ActionRequired['type']>([
  'discard',
  'select_card_from_hand_to_play',
  'select_card_from_hand_to_give',
  'select_card_from_hand_to_reveal',
  'plague_2_player_discard',
  'select_cards_from_hand_to_discard_for_fire_4',
  'select_cards_from_hand_to_discard_for_hate_1',
]);


/**
 * GameScreen - Wrapper that provides AnimationQueueContext
 */
export function GameScreen(props: GameScreenProps) {
  // Online host: one channel per game, shared by the engine (moves) and the animation queue (replays)
  const { online } = props;
  const hostChannel = useMemo(
    () => (online?.role === 'host' ? new HostChannel(online.client, online.setup.gameId) : null),
    [online?.role, online?.client, online?.setup.gameId]
  );
  return (
    <AnimationQueueProvider onEnqueue={hostChannel ? items => hostChannel.forwardAnimations(items) : undefined}>
      <GameScreenContent {...props} hostChannel={hostChannel} />
    </AnimationQueueProvider>
  );
}

/**
 * GameScreenContent - Main game screen content
 */
function GameScreenContent({ onBack, onEndGame, playerProtocols, opponentProtocols, difficulty, useControlMechanic, mode = 'standard', startingPlayer = 'player', initialScenarioSetup, online, hostChannel, coinToss }: GameScreenProps & { hostChannel: HostChannel | null }) {
  // Main 3 protocols need the control mechanic
  useControlMechanic = useControlMechanic || needsControlMechanic([...playerProtocols, ...opponentProtocols]);
  const isOnline = mode === 'online' && !!online;
  const isGuest = isOnline && online!.role === 'guest';
  const isCompact = useIsCompact();
  const isPhoneLandscape = useIsPhoneLandscape();
  const [showHelp, setShowHelp] = useState(false);
  // Board zoom (buttons, pinch, Ctrl/⌘ + wheel), remembered on this device
  const [zoom, setZoomState] = useState(loadZoom);
  const setZoom = useCallback((z: number) => {
    setZoomState(z);
    saveZoom(z);
  }, []);
  useZoomGestures(zoom, setZoom);
  // Animation queue context for the new animation system
  const { isAnimating, currentAnimation, enqueueAnimation, enqueueAnimations, getIsAnimatingSync, getAnimationSync } = useAnimationQueue();
  // Determine starting player via coin flip on first mount
  // Online: the host already decided who starts (setup is in the host's frame)
  const onlineStarter: Player | null = isOnline
    ? (isGuest ? (online!.setup.startingPlayer === 'player' ? 'opponent' : 'player') : online!.setup.startingPlayer)
    : null;
  const [actualStartingPlayer, setActualStartingPlayer] = useState<Player | null>(onlineStarter ?? coinToss?.starter ?? null);
  const [showCoinFlip, setShowCoinFlip] = useState(!isOnline && !coinToss);

  // Statistics tracking
  const {
    startGame: startGameTracking,
    endGame,
    trackPlayerCardPlayed,
    trackPlayerCardDeleted,
    trackPlayerCoinFlip,
    trackPlayerRearrange,
  } = useStatistics(playerProtocols, difficulty, useControlMechanic);

  const handleCoinFlipComplete = useCallback((starter: Player, choice: 'heads' | 'tails', won: boolean) => {
    setActualStartingPlayer(starter);
    setShowCoinFlip(false);
    trackPlayerCoinFlip(choice, won);
  }, [trackPlayerCoinFlip]);

  // The toss that happened before the draft still counts in the statistics
  const tossTrackedRef = useRef(false);
  useEffect(() => {
    if (coinToss && !tossTrackedRef.current) {
      tossTrackedRef.current = true;
      trackPlayerCoinFlip(coinToss.choice, coinToss.won);
    }
  }, [coinToss, trackPlayerCoinFlip]);

  // Debug: Skip coin flip for test scenarios
  const handleSkipCoinFlip = useCallback(() => {
    setActualStartingPlayer('player');
    setShowCoinFlip(false);
    startGameTracking();
  }, [startGameTracking]);

  // Auto-skip coin flip when loading a test scenario
  useEffect(() => {
    if (initialScenarioSetup && showCoinFlip) {
      console.log('[E2E] Auto-skipping coin flip for scenario');
      setActualStartingPlayer('player');
      setShowCoinFlip(false);
    }
  }, [initialScenarioSetup, showCoinFlip]);

  // Start tracking when coin flip completes
  useEffect(() => {
    if (!showCoinFlip && actualStartingPlayer && !isOnline) {
      startGameTracking();
    }
  }, [showCoinFlip, actualStartingPlayer, startGameTracking, isOnline]);

  // Wrap onEndGame to track statistics
  const wrappedOnEndGame = useCallback((winner: Player, finalState: GameState, reason?: string) => {
    // Online games don't count towards the vs-AI statistics
    if (isOnline) {
      hostChannel?.announceEnd(winner);
      onEndGame(winner, finalState, reason);
      return;
    }
    // Count compiles
    const compilesCount = finalState.player.compiled.filter(c => c).length;

    // Pass both player and opponent stats, plus detailed game stats if available
    endGame(
      winner,
      finalState.stats.player,
      compilesCount,
      finalState.stats.opponent,
      finalState.detailedGameStats
    );
    onEndGame(winner, finalState, reason);
  }, [endGame, onEndGame, isOnline, hostChannel]);

  // Initialize game state - will use 'player' initially, but that's ok because we don't show the game until coin flip is done
  // Online host: the guest's moves come through the channel instead of the AI
  const [remoteVersion, setRemoteVersion] = useState(0);
  useEffect(() => {
    if (!hostChannel || !online) return;
    hostChannel.onRemoteAction = () => setRemoteVersion(v => v + 1);
    const off = online.client.on(event => {
      if (event.type === 'message' && isOnlineMessage(event.data)) hostChannel.handleMessage(event.data);
    });
    return off;
  }, [hostChannel, online]);

  const guestGameOptions = isGuest ? {
    client: online!.client,
    gameId: online!.setup.gameId,
    playerProtocols,
    opponentProtocols,
    useControlMechanic,
    onEndGame: (winner: Player, finalState: GameState) => onEndGame(winner, finalState),
    enqueueAnimations,
  } : null;

  // isGuest never changes while this screen is mounted (App remounts it per game), so the hook order is stable
  const engine = guestGameOptions
    ? useGuestGame(guestGameOptions)
    : useGameState(
    playerProtocols,
    opponentProtocols,
    wrappedOnEndGame,
    difficulty,
    useControlMechanic,
    actualStartingPlayer ?? 'player',
    trackPlayerRearrange,
    // NEW: Pass animation queue functions for the new animation system
    enqueueAnimation,
    enqueueAnimations,
    // NEW: Pass animation state so AI waits for phase transitions
    isAnimating,
      hostChannel ? { decide: hostChannel.decide, remoteVersion, initialState: online?.initialState } : undefined
    );
  const {
    gameState,
    selectedCard,
    setSelectedCard,
    playSelectedCard,
    fillHand,
    discardCardFromHand,
    compileLane,
    resolveActionWithCard,
    resolveActionWithLane,
    resolveActionWithLaneFaceDown,
    selectHandCardForAction,
    resolveActionWithHandCard,
    skipAction,
    resolveOptionalDrawPrompt,
    resolveOptionalDiscardCustomPrompt,
    resolveOptionalEffectPrompt,
    resolveVariableDiscard,
    resolveRevealBoardCardPrompt,
    resolveRearrangeProtocols,
    resolveSwapProtocols,
    resolveControlMechanicPrompt,
    resolveCustomChoice,
    resolveSelectRevealedDeckCard,
    resolveRevealDeckDrawProtocol,
    resolveStateNumber,
    resolveStateProtocol,
    resolveSelectFromDrawnToReveal,
    resolveConfirmDeckDiscard,
    resolveConfirmDeckPlayPreview,
    resolveSelectTrashCardToPlay,
    resolveSelectTrashCardToReveal,
    setupTestScenario,
  } = engine;


  // CRITICAL: Track the last valid animation state to prevent flashing gameState during transitions
  // When animation A completes and animation B starts, there's a brief gap where refs are stale
  // This ref persists through that gap to prevent showing the real gameState
  const lastValidAnimationRef = useRef<{
    snapshot: ReturnType<typeof getAnimationSync> extends { snapshot: infer S } ? S : never;
    cardIds: Set<string>;
  } | null>(null);

  // Compute the visual game state - uses snapshot data during animation
  // This allows the SAME GameBoard to render both real state and animation snapshots
  // CRITICAL: Check synchronous refs FIRST to handle race conditions
  // When animation is enqueued, refs are set immediately but React state lags behind
  const visualGameState = useMemo(() => {
    // FIRST: Check synchronous animation state (handles race conditions)
    const syncAnimation = getAnimationSync();
    const isSyncAnimating = getIsAnimatingSync();

    // SPECIAL CASE: ALL flip animations use the REAL gameState (not snapshot)
    // because the card stays in place and we want the board's CSS transition to animate it.
    // This provides a cleaner in-place 3D flip animation (the "old" style that looks better).
    const activeAnim = syncAnimation || currentAnimation;
    const isFlipAnimation = activeAnim?.type === 'flip';
    if (isFlipAnimation) {
      lastValidAnimationRef.current = null;
      return gameState;
    }

    if (isSyncAnimating && syncAnimation?.snapshot) {
      // Update last valid state
      const cardIds = new Set<string>();
      if (syncAnimation.animatingCard) cardIds.add(syncAnimation.animatingCard.card.id);
      if (syncAnimation.animatingCards) syncAnimation.animatingCards.forEach(item => cardIds.add(item.card.id));
      lastValidAnimationRef.current = { snapshot: syncAnimation.snapshot, cardIds };
      return snapshotToGameState(syncAnimation.snapshot, useControlMechanic);
    }

    // Check React state
    if (isAnimating && currentAnimation?.snapshot) {
      // Update last valid state
      const cardIds = new Set<string>();
      if (currentAnimation.animatingCard) cardIds.add(currentAnimation.animatingCard.card.id);
      if (currentAnimation.animatingCards) currentAnimation.animatingCards.forEach(item => cardIds.add(item.card.id));
      lastValidAnimationRef.current = { snapshot: currentAnimation.snapshot, cardIds };
      return snapshotToGameState(currentAnimation.snapshot, useControlMechanic);
    }

    // CRITICAL FALLBACK: If we think we're animating but don't have a current snapshot,
    // use the last valid snapshot to prevent flashing the real gameState during transitions
    if ((isSyncAnimating || isAnimating) && lastValidAnimationRef.current?.snapshot) {
      return snapshotToGameState(lastValidAnimationRef.current.snapshot, useControlMechanic);
    }

    // Truly not animating - clear the last valid state and show real gameState
    lastValidAnimationRef.current = null;
    return gameState;
  }, [isAnimating, currentAnimation, gameState, useControlMechanic, getAnimationSync, getIsAnimatingSync]);

  // Track which cards are currently being animated - used to hide them via CSS
  // This handles both single-card animations (animatingCard) and multi-card animations (animatingCards)
  // CRITICAL: Check sync refs FIRST to handle race condition where React state hasn't updated yet
  const animatingCardIds = useMemo(() => {
    const ids = new Set<string>();

    // FIRST: Check synchronous animation state (handles race conditions)
    const isSyncAnimating = getIsAnimatingSync();
    const syncAnimation = getAnimationSync();

    // SPECIAL CASE: ALL flip animations do NOT hide the card
    // The card stays in place and flips via its own CSS transition.
    // AnimatedCard is not used for flip animations - the board's CSS handles the flip.
    const activeAnimForIds = syncAnimation || currentAnimation;
    const isFlipAnimationForIds = activeAnimForIds?.type === 'flip';
    if (isFlipAnimationForIds) {
      return ids; // Return empty set - don't hide any cards
    }

    if (isSyncAnimating && syncAnimation) {
      if (syncAnimation.animatingCard) {
        ids.add(syncAnimation.animatingCard.card.id);
      }
      if (syncAnimation.animatingCards) {
        syncAnimation.animatingCards.forEach(item => ids.add(item.card.id));
      }
      if (ids.size > 0) return ids;
    }

    // Check React state
    if (isAnimating && currentAnimation) {
      if (currentAnimation.animatingCard) {
        ids.add(currentAnimation.animatingCard.card.id);
      }
      if (currentAnimation.animatingCards) {
        currentAnimation.animatingCards.forEach(item => ids.add(item.card.id));
      }
      if (ids.size > 0) return ids;
    }

    // CRITICAL FALLBACK: Use last valid card IDs during animation transitions
    // This prevents cards from briefly appearing when transitioning between animations
    if ((isSyncAnimating || isAnimating) && lastValidAnimationRef.current?.cardIds) {
      return lastValidAnimationRef.current.cardIds;
    }

    return ids;
  }, [isAnimating, currentAnimation, getIsAnimatingSync, getAnimationSync]);

  // Extended animation info for correct hiding during shift animations
  const animatingCardInfo = useMemo(() => {
    if (isAnimating && currentAnimation?.animatingCard) {
      const { card, fromPosition } = currentAnimation.animatingCard;
      return { cardId: card.id, fromPosition };
    }
    return null;
  }, [isAnimating, currentAnimation]);

  // Extract phase transition animation data for GameInfoPanel
  const phaseTransitionAnimation = useMemo(() => {
    if (currentAnimation?.type === 'phaseTransition' && currentAnimation.phaseTransitionData) {
      return {
        phaseSequence: currentAnimation.phaseTransitionData.phaseSequence,
        duration: currentAnimation.duration,
      };
    }
    return null;
  }, [currentAnimation]);

  // Extract override phase/turn for non-phaseTransition animations
  // During ANY animation (except phaseTransition), use snapshot's phase/turn
  // This prevents the phase display from jumping to the final state during animations
  const { overridePhase, overrideTurn } = useMemo(() => {
    // During phaseTransition: let the animated sequence handle it (don't override)
    if (currentAnimation?.type === 'phaseTransition') {
      return { overridePhase: undefined, overrideTurn: undefined };
    }

    // During ANY other animation: use snapshot phase (static display)
    if (currentAnimation?.snapshot) {
      return {
        overridePhase: currentAnimation.snapshot.phase as GamePhase,
        overrideTurn: currentAnimation.snapshot.turn as Player,
      };
    }

    // No animation: don't override (use gameState defaults)
    return { overridePhase: undefined, overrideTurn: undefined };
  }, [currentAnimation]);

  const [hoveredCard, setHoveredCard] = useState<PreviewState>(null);
  const [multiSelectedCardIds, setMultiSelectedCardIds] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [toasts, setToasts] = useState<{ message: string; player: Player; id: string }[]>([]);
  const lastLogLengthRef = useRef(gameState.log.length);
  const [showRearrangeModal, setShowRearrangeModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [debugModalPlayer, setDebugModalPlayer] = useState<Player | null>(null);
  const [showDebugButton, setShowDebugButton] = useState(false);
  const [mainframeClickCount, setMainframeClickCount] = useState(0);
  const mainframeResetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const gameStateRef = useRef(gameState);
  useEffect(() => {
      gameStateRef.current = gameState;
      // ?debug exposes the live state for automated tests
      if (window.location.search.includes('debug')) (window as unknown as { __gameState: GameState }).__gameState = gameState;
  }, [gameState]);

  // Online host: stream every state to the guest and keep a resumable copy
  useEffect(() => {
    if (!hostChannel) return;
    hostChannel.publish(gameState);
    online?.onHostStateChange?.(gameState);
  }, [gameState, hostChannel]);

  // Solo Deck Run: the run ends the moment the player's trash would be reshuffled into their deck
  const soloPrevStateRef = useRef(gameState);
  const soloEndedRef = useRef(false);
  useEffect(() => {
    const prev = soloPrevStateRef.current;
    soloPrevStateRef.current = gameState;
    if (mode !== 'solo' || soloEndedRef.current || gameState.winner) return;
    if (didPlayerReshuffle(prev, gameState)) {
      soloEndedRef.current = true;
      const finalState = gameState;
      setTimeout(() => wrappedOnEndGame('opponent', finalState, SOLO_DECK_OUT_REASON), 1200);
    }
  }, [gameState, mode, wrappedOnEndGame]);

  // E2E Testing: Apply initial scenario setup if provided
  const scenarioAppliedRef = useRef(false);
  useEffect(() => {
    if (initialScenarioSetup && !scenarioAppliedRef.current) {
      console.log('[E2E] Applying initial scenario setup...');
      scenarioAppliedRef.current = true;
      // Small delay to ensure game is fully initialized
      setTimeout(() => {
        setupTestScenario(initialScenarioSetup);
        console.log('[E2E] Scenario setup complete');
      }, 100);
    }
  }, [initialScenarioSetup, setupTestScenario]);

  // Mainframe Debug Toggle: 5 clicks to toggle debug mode
  const handleMainframeClick = () => {
    const newCount = mainframeClickCount + 1;
    setMainframeClickCount(newCount);

    if (newCount >= 5) {
      setShowDebugButton(prev => !prev);
      setMainframeClickCount(0); // Reset counter
      if (mainframeResetTimerRef.current) {
        clearTimeout(mainframeResetTimerRef.current);
        mainframeResetTimerRef.current = null;
      }
      return;
    }

    // Reset counter after 2 seconds of inactivity
    if (mainframeResetTimerRef.current) {
      clearTimeout(mainframeResetTimerRef.current);
    }
    mainframeResetTimerRef.current = setTimeout(() => {
      setMainframeClickCount(0);
      mainframeResetTimerRef.current = null;
    }, 2000);
  };

  // Debug: Force Win/Lose handlers for DebugPanel
  const handleForceWin = useCallback(() => {
    console.log('Debug: Forcing player win via DebugPanel.');
    wrappedOnEndGame('player', gameState);
  }, [wrappedOnEndGame, gameState]);

  const handleForceLose = useCallback(() => {
    console.log('Debug: Forcing player loss via DebugPanel.');
    wrappedOnEndGame('opponent', gameState);
  }, [wrappedOnEndGame, gameState]);

  const lastPlayedCardInfo = useMemo(() => {
    if (gameState.lastPlayedCardId) {
        const cardInfo = findCardOnBoard(gameState, gameState.lastPlayedCardId);
        if (cardInfo) {
            // A card's contents are visible if it's the player's or if it's face-up.
            const showContents = cardInfo.owner === 'player' || cardInfo.card.isFaceUp;
            return { card: cardInfo.card, showContents };
        }
    }
    return null;
  }, [gameState.lastPlayedCardId, gameState.player.lanes, gameState.opponent.lanes]);

  // Auto-preview the source card when an effect is active (highlighted with golden border)
  const sourceCardInfo = useMemo(() => {
    const sourceId = gameState.actionRequired?.sourceCardId;
    if (sourceId) {
        const cardInfo = findCardOnBoard(gameState, sourceId);
        if (cardInfo) {
            const showContents = cardInfo.owner === 'player' || cardInfo.card.isFaceUp;
            return { card: cardInfo.card, showContents };
        }
    }
    return null;
  }, [gameState.actionRequired?.sourceCardId, gameState.player.lanes, gameState.opponent.lanes]);

  // Clear hoveredCard when sourceCardId changes so the active effect's card is shown in preview
  useEffect(() => {
    if (gameState.actionRequired?.sourceCardId) {
      setHoveredCard(null);
    }
  }, [gameState.actionRequired?.sourceCardId]);

  // Priority: 1) User hover, 2) Effect source card, 3) Last played card
  const previewState = hoveredCard || sourceCardInfo || lastPlayedCardInfo;

  // Phone: the detail sheet only shows what the player tapped, and closes once the game moves on
  useEffect(() => {
    if (isCompact && !selectedCard) {
      setHoveredCard(null);
    }
  }, [isCompact, gameState.log.length]);

  // Sound effects follow the animation queue (so an online guest hears the host's moves too)
  useEffect(() => {
    if (!currentAnimation) return;
    // Compiles are a chain of delete animations: thunder on the first, quiet after
    if (currentAnimation.compile === 'start') {
      playSound('compile');
      haptic('strong');
      return;
    }
    if (currentAnimation.compile === 'continue') return;
    const sound = soundForAnimation(currentAnimation.type);
    if (!sound) return;
    // A played card thumps when it lands on the mat, not when it starts flying
    if (sound === 'place') {
      const t = setTimeout(() => playSound('place'), Math.max(0, (currentAnimation.duration ?? 400) - 60));
      return () => clearTimeout(t);
    }
    playSound(sound);
  }, [currentAnimation?.id]);

  // Highlight the card whose effect just fired (log entries carry their source card, e.g. "Fire-3")
  const [triggeredCardIds, setTriggeredCardIds] = useState<Set<string>>(new Set());
  const triggerLogLengthRef = useRef(gameState.log.length);
  useEffect(() => {
    const fresh = gameState.log.slice(triggerLogLengthRef.current);
    triggerLogLengthRef.current = gameState.log.length;
    const names = new Set(fresh.map(e => e.sourceCard).filter((n): n is string => !!n));
    if (names.size === 0) return;
    const ids = new Set<string>();
    for (const owner of ['player', 'opponent'] as Player[]) {
      for (const lane of gameState[owner].lanes) {
        for (const c of lane) if (c.isFaceUp && names.has(`${c.protocol}-${c.value}`)) ids.add(c.id);
      }
    }
    if (ids.size === 0) return;
    setTriggeredCardIds(prev => new Set([...prev, ...ids]));
    const t = setTimeout(() => setTriggeredCardIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    }), 1600);
    return () => clearTimeout(t);
  }, [gameState.log.length]);

  // NEW TOAST SYSTEM: Synchronized with animations
  // Effect 1: Show toast when animation with logMessage starts
  useEffect(() => {
    if (currentAnimation?.logMessage) {
        const { message, player } = currentAnimation.logMessage;
        const newToast = { message, player, id: uuidv4() };
        setToasts(currentToasts => [...currentToasts, newToast]);

        // Remove after 5 seconds
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(t => t.id !== newToast.id));
        }, 5000);
    }
  }, [currentAnimation?.id]); // Trigger when animation changes

  // Effect 2: For log entries WITHOUT animation - show immediately when NOT animating
  useEffect(() => {
    if (gameState.log.length > lastLogLengthRef.current) {
        const newLogs = gameState.log.slice(lastLogLengthRef.current);

        // Only show immediately if NOT animating
        // If animating, log messages should be attached to animations via logMessage property
        if (!getIsAnimatingSync()) {
            newLogs.forEach(logEntry => {
                if (logEntry.message !== 'Game Started.') {
                    const newToast = { message: logEntry.message, player: logEntry.player, id: uuidv4() };
                    setToasts(currentToasts => [...currentToasts, newToast]);

                    setTimeout(() => {
                        setToasts(currentToasts => currentToasts.filter(t => t.id !== newToast.id));
                    }, 5000);
                }
            });
        }
    }
    lastLogLengthRef.current = gameState.log.length;
  }, [gameState.log, getIsAnimatingSync]);

  useEffect(() => {
    const isVariableDiscard = gameState.actionRequired?.type === 'discard' && gameState.actionRequired?.variableCount;
    if (!isVariableDiscard && gameState.actionRequired?.type !== 'plague_2_player_discard' && gameState.actionRequired?.type !== 'select_cards_from_hand_to_discard_for_fire_4' && gameState.actionRequired?.type !== 'select_cards_from_hand_to_discard_for_hate_1') {
        setMultiSelectedCardIds([]);
    }
  }, [gameState.actionRequired]);

  useEffect(() => {
    setShowRearrangeModal(gameState.actionRequired?.type === 'prompt_rearrange_protocols' && gameState.actionRequired.actor === 'player');
    setShowSwapModal(gameState.actionRequired?.type === 'prompt_swap_protocols' && gameState.actionRequired.actor === 'player');
  }, [gameState.actionRequired]);

  useEffect(() => {
    const handleDebugKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            if (event.key.toLowerCase() === 'd') {
                console.log('Debug: Toggling debug button visibility.');
                setShowDebugButton(prev => !prev);
            } else if (event.key.toLowerCase() === 'w') {
                console.log('Debug: Forcing player win.');
                onEndGame('player', gameState);
            } else if (event.key.toLowerCase() === 'o') {
                console.log('Debug: Forcing opponent win.');
                onEndGame('opponent', gameState);
            } else if (event.key.toLowerCase() === 'p') {
                console.log('Debug: Setting up Speed-0 interrupt scenario.');
                setupTestScenario('speed-0-interrupt');
            } else if (event.key.toLowerCase() === 'l') {
                console.log('Debug: Setting up Speed-1 discard trigger scenario.');
                setupTestScenario('speed-1-trigger');
            } else if (event.key.toLowerCase() === 'f') {
                console.log('Debug: Setting up Fire On-Cover test scenario.');
                setupTestScenario('fire-oncover-test');
            } else if (event.key.toLowerCase() === 's') {
                console.log('Debug: Setting up Speed-2 + Control test scenario.');
                setupTestScenario('speed-2-control-test');
            } else if (event.key.toLowerCase() === 'u') {
                console.log('Debug: Setting up Death-1 Uncover test scenario.');
                // Import the scenario and use it as a setup function
                import('../utils/testScenarios').then(module => {
                    setupTestScenario(module.scenario14_Death1UncoverTest.setup);
                });
            }
        }
    };

    window.addEventListener('keydown', handleDebugKeyDown);
    return () => {
        window.removeEventListener('keydown', handleDebugKeyDown);
    };
  }, [gameState, onEndGame, setupTestScenario]);

  // Mis-tap protection: moves wait for a confirmation (unless switched off)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const confirmMove = (text: string, run: () => void) => {
    if (!confirmMovesEnabled()) {
      run();
      return;
    }
    setPendingMove({ text, run });
  };
  useEffect(() => setPendingMove(null), [gameState.turn, gameState.actionRequired?.type]);
  const cardLabel = (card: PlayedCard | undefined, owner: Player) =>
    !card ? 'that card' : (card.isFaceUp || owner === 'player') ? `${card.protocol} ${card.value}${card.isFaceUp ? '' : ' (face-down)'}` : 'a face-down card';
  const lineName = (laneIndex: number) => `the ${gameStateRef.current.player.protocols[laneIndex]} line`;
  const actionVerb = (type: string | undefined) =>
    !type ? 'Choose' : /flip/.test(type) ? 'Flip' : /delete/.test(type) ? 'Delete' : /return/.test(type) ? 'Return' : /shift/.test(type) ? 'Shift' : /discard/.test(type) ? 'Discard' : 'Choose';

  const handleLanePointerDown = (laneIndex: number, owner: Player) => {
    const currentState = gameStateRef.current;
    // Block input during animations (old system OR new queue system)
    if (isAnimating) return;

    const { actionRequired, turn, phase, compilableLanes, player, opponent } = currentState;

    // Highest priority: Compiling (only on player's lanes)
    if (owner === 'player' && turn === 'player' && phase === 'compile' && compilableLanes.includes(laneIndex)) {
        if (actionRequired) {
            console.warn("Compile click blocked by pending action:", actionRequired);
            // Don't proceed, but also don't do anything else that could change state
            return;
        }
        confirmMove(`Compile ${player.protocols[laneIndex]}?`, () => compileLane(laneIndex));
        return;
    }

    // Second priority: Resolving a required action that targets a lane
    // FIX: Check actionRequired.actor instead of turn, because during interrupt scenarios
    // (e.g., Spirit-3 triggering during opponent's end phase), the player needs to act
    // even though turn might still be set to 'opponent'.
    if (actionRequired && actionRequired.actor === 'player' &&
        LANE_SELECTION_ACTIONS.has(actionRequired.type)) {
        confirmMove(`${actionVerb(actionRequired.type) === 'Choose' ? 'Choose' : actionVerb(actionRequired.type) + ' to'} ${lineName(laneIndex)}?`, () => resolveActionWithLane(laneIndex));
        return;
    }

    // Third priority: Playing a card from hand
    const opponentHasPsychic1 = opponent.lanes.flat().some(c => c.isFaceUp && c.protocol === 'Psychic' && c.value === 1);
    const oppLane = opponent.lanes[laneIndex];
    const isLaneBlockedByPlague0 = oppLane.length > 0 &&
                                   oppLane[oppLane.length - 1].isFaceUp &&
                                   oppLane[oppLane.length - 1].protocol === 'Plague' &&
                                   oppLane[oppLane.length - 1].value === 0;

    const isPlayTarget = selectedCard && phase === 'action' && !actionRequired && player.hand.some(c => c.id === selectedCard) &&
        !isLaneBlockedByPlague0;

    if (isPlayTarget) {
        const cardInHand = player.hand.find(c => c.id === selectedCard)!;

        // Handle playing on opponent's side (cards with allow_play_on_opponent_side)
        if (owner === 'opponent') {
            // Check if card can be played on opponent's side
            if (!hasPlayOnOpponentSideRule(currentState, cardInHand)) {
                // Card can't be played on opponent's side
                setSelectedCard(null);
                setHoveredCard(null);
                return;
            }
            // Cards with allow_play_on_opponent_side can play on ANY opponent lane (face-up only)
            // Psychic-1 still blocks face-up plays
            if (opponentHasPsychic1) {
                setSelectedCard(null);
                setHoveredCard(null);
                return;
            }
            // Play on opponent's side (always face-up)
            confirmMove(`Play ${cardLabel(cardInHand, 'player')} face-up on your opponent's ${opponent.protocols[laneIndex]} line?`, () => playSelectedCard(laneIndex, true, 'opponent'));
            setHoveredCard(null);
            return;
        }

        // Normal play on player's side
        const playerHasSpiritOne = player.lanes.flat().some(c => c.isFaceUp && c.protocol === 'Spirit' && c.value === 1);

        // Check if the card being played has ignore_protocol_matching card_property (generic check)
        const thisCardIgnoresMatching = (cardInHand as any).customEffects?.bottomEffects?.some(
            (e: any) => e.params?.action === 'card_property' && e.params?.property === 'ignore_protocol_matching'
        ) || (cardInHand as any).customEffects?.topEffects?.some(
            (e: any) => e.params?.action === 'card_property' && e.params?.property === 'ignore_protocol_matching'
        ) || (cardInHand as any).customEffects?.middleEffects?.some(
            (e: any) => e.params?.action === 'card_property' && e.params?.property === 'ignore_protocol_matching'
        );

        // Check for Anarchy-1 on ANY player's field (affects both players)
        const anyPlayerHasAnarchy1 = [...player.lanes.flat(), ...opponent.lanes.flat()]
            .some(c => c.isFaceUp && c.protocol === 'Anarchy' && c.value === 1);

        // Check for custom cards with require_non_matching_protocol passive rule
        const hasCustomNonMatchingRule = hasRequireNonMatchingProtocolRule(currentState);

        // NEW: Check for custom cards with allow_any_protocol_play passive rule (Spirit_custom-1)
        const hasCustomAllowAnyProtocol = hasAnyProtocolPlayRule(currentState, 'player', laneIndex);

        // Check if card can play on any lane (allow_play_on_opponent_side passive rule)
        const canPlayAnywhere = hasPlayOnOpponentSideRule(currentState, cardInHand);

        // NEW: Check for Unity-1 same-protocol face-up play rule
        const hasSameProtocolFaceUpRule = canPlayFaceUpDueToSameProtocolRule(currentState, 'player', laneIndex, cardInHand.protocol);

        let canPlayFaceUp: boolean;
        if (canPlayAnywhere) {
            // Can play face-up on ANY lane (ignores protocol matching)
            canPlayFaceUp = !opponentHasPsychic1;
        } else if (anyPlayerHasAnarchy1 || hasCustomNonMatchingRule) {
            // Anarchy-1 OR custom require_non_matching_protocol: INVERTED rule - can only play face-up if protocol does NOT match
            const doesNotMatch = cardInHand.protocol !== player.protocols[laneIndex] && cardInHand.protocol !== opponent.protocols[laneIndex];
            canPlayFaceUp = doesNotMatch && !opponentHasPsychic1;
        } else {
            // Normal rule: can play face-up if protocol DOES match (or Spirit-1/custom override)
            // OR if THIS CARD ignores protocol matching (Chaos-3 or custom cards with ignore_protocol_matching)
            // OR if Unity-1 same-protocol face-up rule allows it
            canPlayFaceUp = (
                playerHasSpiritOne ||
                hasCustomAllowAnyProtocol ||
                thisCardIgnoresMatching ||
                hasSameProtocolFaceUpRule ||
                cardInHand.protocol === player.protocols[laneIndex] ||
                cardInHand.protocol === opponent.protocols[laneIndex]
            ) && !opponentHasPsychic1;
        }
        confirmMove(`Play ${cardInHand.protocol} ${cardInHand.value} ${canPlayFaceUp ? 'face-up' : 'face-down'} in ${lineName(laneIndex)}?`, () => playSelectedCard(laneIndex, canPlayFaceUp));
        setHoveredCard(null);
        return;
    }

    // Fallback: Deselect card if clicking an invalid target
    if (selectedCard) {
        setSelectedCard(null);
        setHoveredCard(null);
    }
  };

  const handlePlayFaceDown = (laneIndex: number) => {
    const currentState = gameStateRef.current;
    // Block input during animations (old system OR new queue system)
    if (isAnimating) return;

    const { phase, actionRequired, player } = currentState;

    // Handle face-down during select_lane_for_play with player orientation choice
    if (actionRequired?.type === 'select_lane_for_play' &&
        (actionRequired as any).ignoreProtocolMatching &&
        (actionRequired as any).isFaceDown === undefined) {
      const validLanes = (actionRequired as any).validLanes;
      if (validLanes && !validLanes.includes(laneIndex)) return;
      resolveActionWithLaneFaceDown(laneIndex);
      return;
    }

    // Normal face-down from hand
    if (!selectedCard) return;
    if (phase !== 'action' || actionRequired || !player.hand.some(c => c.id === selectedCard)) return;

    const handCard = player.hand.find(c => c.id === selectedCard);
    confirmMove(`Play ${handCard ? `${handCard.protocol} ${handCard.value}` : 'this card'} face-down in ${lineName(laneIndex)}?`, () => playSelectedCard(laneIndex, false));
    setHoveredCard(null);
  };


  const handleHandCardPointerDown = (card: PlayedCard) => {
    haptic('tap');
    const currentState = gameStateRef.current;
    // Block input during animations (old system OR new queue system)
    if (isAnimating) return;

    if (currentState.actionRequired) {
      // Hand prompts belong to whoever must act: never answer the opponent's prompt with our cards
      if ('actor' in currentState.actionRequired && currentState.actionRequired.actor !== 'player') return;

      // Check for discard action
      if (currentState.actionRequired.type === 'discard' && currentState.actionRequired.actor === 'player') {
        const discardCount = currentState.actionRequired.count;
        // Multi-select mode when count > 1 OR variableCount (select all, then confirm)
        if (discardCount > 1 || currentState.actionRequired.variableCount) {
          setMultiSelectedCardIds(prev => {
            if (prev.includes(card.id)) {
              return prev.filter(id => id !== card.id);
            }
            // For fixed count, limit selection to exactly count cards
            if (!currentState.actionRequired.variableCount && prev.length >= discardCount) {
              return prev; // Don't add more than required
            }
            return [...prev, card.id];
          });
          return;
        } else {
          // Single discard (count === 1)
          confirmMove(`Discard ${card.protocol} ${card.value}?`, () => discardCardFromHand(card.id));
          return;
        }
      }
      if (currentState.actionRequired.type === 'select_card_from_hand_to_play') {
        selectHandCardForAction(card.id);
        return;
      }
      if (currentState.actionRequired.type === 'select_card_from_hand_to_give' || currentState.actionRequired.type === 'select_card_from_hand_to_reveal') {
        resolveActionWithHandCard(card.id);
        return;
      }
      if (currentState.actionRequired.type === 'plague_2_player_discard' || currentState.actionRequired.type === 'select_cards_from_hand_to_discard_for_fire_4' || currentState.actionRequired.type === 'select_cards_from_hand_to_discard_for_hate_1') {
        setMultiSelectedCardIds(prev => {
            if (prev.includes(card.id)) {
                return prev.filter(id => id !== card.id);
            }
            return [...prev, card.id];
        });
        return;
      }
      return;
    }
    
    if (currentState.turn !== 'player' || (currentState.phase !== 'action' && currentState.phase !== 'compile')) return;

    if (card.id === selectedCard) {
      setSelectedCard(null);
      setHoveredCard(null);
    } else {
      setSelectedCard(card.id);
      setHoveredCard({ card, showContents: true });
    }
  };

  const handleBoardCardPointerDown = (card: PlayedCard, owner: Player, laneIndex: number) => {
      haptic('tap');
      const currentState = gameStateRef.current;
      // Block input during animations (old system OR new queue system)
      if (isAnimating) return;

      const { actionRequired, turn, phase, compilableLanes } = currentState;

      // Proxy click to lane if in compile phase
      if (turn === 'player' && phase === 'compile' && compilableLanes.includes(laneIndex)) {
          handleLanePointerDown(laneIndex, owner);
          return;
      }

      // Proxy click to lane if playing a card from hand
      if (turn === 'player' && !actionRequired && selectedCard && phase === 'action') {
          handleLanePointerDown(laneIndex, owner);
          return;
      }

      // Handle Hate-2 selections
      if (actionRequired && actionRequired.actor === 'player') {
          if (actionRequired.type === 'select_own_highest_card_to_delete_for_hate_2' ||
              actionRequired.type === 'select_opponent_highest_card_to_delete_for_hate_2') {
              if (isCardTargetable(card, currentState)) {
                  confirmMove(`${actionVerb(actionRequired.type)} ${cardLabel(card, owner)}?`, () => resolveActionWithCard(card.id));
                  return;
              }
          }
      }

      // A lane is being chosen: a tap on a card counts as a tap on its lane (cards cover most of a lane on phones)
      if (actionRequired && actionRequired.actor === 'player' && LANE_SELECTION_ACTIONS.has(actionRequired.type)) {
          handleLanePointerDown(laneIndex, owner);
          return;
      }

      // If it's not a proxy, it's a card-specific interaction.
      if (isCardTargetable(card, currentState)) {
          confirmMove(`${actionVerb(actionRequired?.type)} ${cardLabel(card, owner)}?`, () => resolveActionWithCard(card.id));
      } else {
          // If a hand card was selected, but the click was on an invalid target card, deselect.
          if (selectedCard) {
              setSelectedCard(null);
              setHoveredCard(null);
          } else {
              // No hand card was selected. Just preview the board card.
              const showContents = owner === 'player' || card.isFaceUp;
              setHoveredCard({ card, showContents });
          }
      }
  };
  
  const handleHandCardPointerEnter = (card: PlayedCard) => {
    if (!selectedCard) {
      setHoveredCard({ card, showContents: true });
    }
  };
  
  const handleHandCardPointerLeave = () => {
    if (!selectedCard) {
      setHoveredCard(null);
    }
  };

  const handleBoardCardPointerEnter = (card: PlayedCard, owner: Player) => {
    if (!selectedCard) {
        const showContents = owner === 'player' || card.isFaceUp;
        setHoveredCard({ card, showContents });
    }
  };

  const handleBoardCardPointerLeave = () => {
      if (!selectedCard) {
          setHoveredCard(null);
      }
  };

  const handleOpponentHandCardPointerEnter = (card: PlayedCard) => {
    if (!selectedCard && !gameState.actionRequired) {
      setHoveredCard({ card, showContents: card.isRevealed || false });
    }
  };


  const renderPreview = () => {
    if (!previewState) return null;
    const { card, showContents } = previewState;
    return (
        <CardComponent
            card={card}
            isFaceUp={showContents}
        />
    );
  };

  const isCompilePromptVisible = gameState.turn === 'player' && 
                               !gameState.actionRequired && 
                               gameState.phase === 'compile' && 
                               gameState.compilableLanes.length > 0;

  // FIX: Safely access sourceCardId, as not all actions have it (e.g., control mechanic).
  const sourceCardId = gameState.actionRequired?.sourceCardId ?? null;

  const actionRequiredClass = useMemo(() => {
    if (gameState.actionRequired?.actor) {
        return gameState.actionRequired.actor === 'player'
            ? 'action-required-player'
            : 'action-required-opponent';
    }
    return '';
  }, [gameState.actionRequired]);

  const handBackgroundClass = useMemo(() => {
    const action = gameState.actionRequired;
    if (action && action.actor === 'player') {
      // If the action requires interacting with hand cards, DON'T put it in the background.
      if (ACTIONS_REQUIRING_HAND_INTERACTION.has(action.type)) {
        return '';
      }
      // Otherwise, it's a button-based action, so put the hand in the background.
      return 'hand-in-background';
    }
    // No action, or action is for opponent, hand is normal.
    return '';
  }, [gameState.actionRequired]);


  const phaseController = (
    <PhaseController
      gameState={gameState}
      onFillHand={() => confirmMove('Refresh (draw up to 5 cards)? This uses your turn.', fillHand)}
      onSkipAction={skipAction}
      onResolveOptionalDrawPrompt={resolveOptionalDrawPrompt}
      onResolveOptionalDiscardCustomPrompt={resolveOptionalDiscardCustomPrompt}
      onResolveOptionalEffectPrompt={resolveOptionalEffectPrompt}
      onResolveVariableDiscard={resolveVariableDiscard}
      onResolveRevealBoardCardPrompt={resolveRevealBoardCardPrompt}
      onResolveControlMechanicPrompt={resolveControlMechanicPrompt}
      onResolveCustomChoice={resolveCustomChoice}
      selectedCardId={selectedCard}
      multiSelectedCardIds={multiSelectedCardIds}
      actionRequiredClass={actionRequiredClass}
      isAnimating={isAnimating}
      snapshotTurn={visualGameState.turn}
      snapshotPhase={visualGameState.phase}
    />
  );

  const displayedTurn = isAnimating ? visualGameState.turn : (gameState.actionRequired?.actor || visualGameState.turn);

  return (
    <div className={`screen game-screen ${isCompact ? 'compact' : ''}`} style={{ '--zoom': zoom } as React.CSSProperties}>
        {debugModalPlayer && (
            <DebugModal
                player={debugModalPlayer}
                playerState={gameState[debugModalPlayer]}
                onClose={() => setDebugModalPlayer(null)}
                difficulty={difficulty}
            />
        )}
        {/* Hide modals during animation */}
        {!isAnimating && showRearrangeModal && gameState.actionRequired?.type === 'prompt_rearrange_protocols' && (
            <RearrangeProtocolsModal
                gameState={gameState}
                targetPlayer={gameState.actionRequired.target}
                onConfirm={(newOrder: string[]) => {
                    // Track rearrange in statistics ONLY if from Control Mechanic (not Psychic-2 etc.)
                    if (gameState.actionRequired?.sourceCardId === 'CONTROL_MECHANIC' && gameState.actionRequired?.actor) {
                        trackPlayerRearrange(gameState.actionRequired.actor);
                    }
                    resolveRearrangeProtocols(newOrder);
                    setShowRearrangeModal(false);
                }}
            />
        )}
        {!isAnimating && showSwapModal && gameState.actionRequired?.type === 'prompt_swap_protocols' && (
            <SwapProtocolsModal
                gameState={gameState}
                targetPlayer={gameState.actionRequired.target}
                onConfirm={(indices) => {
                    resolveSwapProtocols(indices);
                    setShowSwapModal(false);
                }}
            />
        )}
        {!isAnimating && (gameState.actionRequired?.type === 'select_card_from_revealed_deck' || gameState.actionRequired?.type === 'reveal_deck_draw_protocol') && gameState.actionRequired.actor === 'player' && (
            <RevealedDeckModal
                gameState={gameState}
                onSelectCard={(cardId) => {
                    resolveSelectRevealedDeckCard(cardId);
                }}
                onConfirmProtocolDraw={() => {
                    resolveRevealDeckDrawProtocol();
                }}
            />
        )}
        {/* Time Protocol: Trash selection modals */}
        {!isAnimating && gameState.actionRequired?.type === 'select_card_from_trash_to_play' && gameState.actionRequired.actor === 'player' && (
            <TrashSelectionModal
                gameState={gameState}
                onSelectCard={(cardIndex) => {
                    resolveSelectTrashCardToPlay(cardIndex);
                }}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'select_card_from_trash_to_reveal' && gameState.actionRequired.actor === 'player' && (
            <TrashSelectionModal
                gameState={gameState}
                onSelectCard={(cardIndex) => {
                    resolveSelectTrashCardToReveal(cardIndex);
                }}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'prompt_optional_effect' && gameState.actionRequired.actor === 'player' && (
            <RevealedDeckTopModal
                gameState={gameState}
                onAccept={() => resolveOptionalEffectPrompt(true)}
                onDecline={() => resolveOptionalEffectPrompt(false)}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'state_number' && gameState.actionRequired.actor === 'player' && (
            <StateNumberModal
                gameState={gameState}
                onConfirm={(number) => resolveStateNumber(number)}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'state_protocol' && gameState.actionRequired.actor === 'player' && (
            <StateProtocolModal
                gameState={gameState}
                availableProtocols={(gameState.actionRequired as any).availableProtocols || []}
                onConfirm={(protocol) => resolveStateProtocol(protocol)}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'select_from_drawn_to_reveal' && gameState.actionRequired.actor === 'player' && (
            <SelectFromDrawnModal
                gameState={gameState}
                allDrawnCardIds={(gameState.actionRequired as any).allDrawnCardIds || []}
                eligibleCardIds={(gameState.actionRequired as any).eligibleCardIds || []}
                statedNumber={(gameState.actionRequired as any).statedNumber}
                revealCount={(gameState.actionRequired as any).revealCount}
                onConfirm={(cardId) => resolveSelectFromDrawnToReveal(cardId)}
                onClose={() => {
                    // No eligible cards - call resolver with empty string to clear action
                    resolveSelectFromDrawnToReveal('');
                }}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'confirm_deck_discard' && gameState.actionRequired.actor === 'player' && (
            <DeckDiscardModal
                discardedCard={(gameState.actionRequired as any).discardedCard}
                deckOwner={(gameState.actionRequired as any).deckOwner}
                onConfirm={() => resolveConfirmDeckDiscard()}
            />
        )}
        {!isAnimating && gameState.actionRequired?.type === 'confirm_deck_play_preview' && gameState.actionRequired.actor === 'player' && (
            <DeckPlayPreviewModal
                card={(gameState.actionRequired as any).drawnCard}
                isFaceDown={(gameState.actionRequired as any).isFaceDown}
                onConfirm={() => resolveConfirmDeckPlayPreview()}
            />
        )}
        {/* Toasts are now synchronized with animations - always show */}
        <div className="toaster-container">
            {toasts.map((toast) => (
                <Toaster key={toast.id} message={toast.message} player={toast.player} />
            ))}
        </div>
        {showLog && <LogModal log={gameState.log} onClose={() => setShowLog(false)} />}
        {showHelp && (
            <div className="modal-overlay help-overlay">
                <div className="modal-content help-modal">
                    <TutorialSlides onClose={() => setShowHelp(false)} />
                </div>
            </div>
        )}
        {!isCompact && <button className="btn log-button" onClick={() => setShowLog(true)}>Log</button>}
        <div className="game-screen-layout">
            {!isCompact && (
            <div className="game-preview-container">
                <h2 onClick={handleMainframeClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click 5 times to toggle debug mode">Mainframe</h2>
                <GameInfoPanel
                    gameState={visualGameState}
                    turn={displayedTurn}
                    difficulty={difficulty}
                    phaseTransitionAnimation={phaseTransitionAnimation}
                    overridePhase={overridePhase}
                    overrideTurn={overrideTurn}
                    onPlayerClick={() => setDebugModalPlayer('player')}
                    onOpponentClick={() => setDebugModalPlayer('opponent')}
                />
                <div className="preview-card-area">
                    {renderPreview()}
                </div>
                <ZoomControls zoom={zoom} setZoom={setZoom} variant="sidebar" />
                <SoundToggle className="btn btn-back" withLabel />
                <button className="btn btn-back" onClick={() => setShowHelp(true)}>
                    How to play
                </button>
                <button className="btn btn-back" onClick={onBack}>
                    Back
                </button>
            </div>
            )}

            <div className="game-main-area">
                {isCompact && (
                  <MobileTopBar
                    opponent={visualGameState.opponent}
                    opponentName={isOnline ? 'Rival' : 'AI'}
                    difficultyLabel={isOnline ? 'online' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                    turn={displayedTurn}
                    phase={overridePhase ?? visualGameState.phase}
                    onQuit={onBack}
                    onShowLog={() => setShowLog(true)}
                    onShowHelp={() => setShowHelp(true)}
                    onPileClick={(owner) => setDebugModalPlayer(owner)}
                  />
                )}
                {isCompact && <ZoomControls zoom={zoom} setZoom={setZoom} variant="floating" />}
                {isCompact && hoveredCard && (
                  <CardDetailSheet
                    card={hoveredCard.card}
                    showContents={hoveredCard.showContents}
                    onClose={() => setHoveredCard(null)}
                  />
                )}
                {isCompilePromptVisible && (
                  <div className="compile-prompt-container">
                    <h3>Select a Protocol to Compile</h3>
                  </div>
                )}
                <GameBoard
                  gameState={visualGameState}
                  compact={isCompact}
                  triggeredCardIds={triggeredCardIds}
                  onLanePointerDown={handleLanePointerDown}
                  onPlayFaceDown={handlePlayFaceDown}
                  selectedCardId={isAnimating ? null : selectedCard}
                  onCardPointerDown={handleBoardCardPointerDown}
                  onCardPointerEnter={handleBoardCardPointerEnter}
                  onCardPointerLeave={handleBoardCardPointerLeave}
                  onOpponentHandCardPointerEnter={handleOpponentHandCardPointerEnter}
                  onOpponentHandCardPointerLeave={handleBoardCardPointerLeave}
                  sourceCardId={isAnimating ? null : sourceCardId}
                  animatingCardIds={animatingCardIds}
                  animatingCardInfo={animatingCardInfo}
                  onDeckClick={(owner) => setDebugModalPlayer(owner)}
                  onTrashClick={(owner) => setDebugModalPlayer(owner)}
                  onTrashCardHover={(card, owner) => {
                    if (!selectedCard) {
                      setHoveredCard({ card, showContents: true });
                    }
                  }}
                  onTrashCardLeave={() => {
                    if (!selectedCard) {
                      setHoveredCard(null);
                    }
                  }}
                />
                
                <div className="player-action-area">
                  {pendingMove && <ConfirmMove move={pendingMove} onDone={() => setPendingMove(null)} />}
                  {mode === 'tutorial' && !pendingMove && (
                    <CoachHints gameState={gameState} selectedCardId={selectedCard} isAnimating={isAnimating || showCoinFlip} />
                  )}
                  {isCompact ? (
                    <div className="mobile-controls-row">
                      <div className="mobile-player-piles">
                        <MiniPile owner="player" kind="deck" count={visualGameState.player.deck.length} warn={mode === 'solo' && visualGameState.player.deck.length <= SOLO_LOW_DECK_WARNING} onClick={() => setDebugModalPlayer('player')} />
                        <MiniPile owner="player" kind="trash" count={visualGameState.player.discard.length} onClick={() => setDebugModalPlayer('player')} />
                      </div>
                      {phaseController}
                    </div>
                  ) : phaseController}
                  <div
                    className={`player-hand-area ${isAnimating ? '' : handBackgroundClass}`}
                    style={{ '--hand-count': visualGameState.player.hand.length } as React.CSSProperties}
                  >
                    {(() => {
                      // DEFENSIVE: Deduplicate hand cards to prevent React key errors
                      // This handles edge cases where snapshot hand might contain duplicate IDs
                      const seenIds = new Set<string>();
                      const deduplicatedHand = visualGameState.player.hand.filter(card => {
                        if (seenIds.has(card.id)) {
                          console.warn('[GameScreen] Duplicate card ID in hand:', card.id, card.protocol, card.value);
                          return false;
                        }
                        seenIds.add(card.id);
                        return true;
                      });

                      return deduplicatedHand
                        .filter((card) => {
                          // During animation, show all cards from the snapshot
                          if (isAnimating) return true;
                          // When there's a selectableCardIds filter (Clarity-2 play effect),
                          // only show selectable cards - others stay hidden behind the banner
                          const action = gameState.actionRequired as any;
                          const hasSelectableFilter = action?.type === 'select_card_from_hand_to_play' && action?.selectableCardIds;
                          if (hasSelectableFilter) {
                            return action.selectableCardIds.includes(card.id);
                          }
                          return true; // Show all cards normally
                        })
                        .map((card, index) => {
                        // During animation: hide the animating card via CSS (visibility: hidden)
                        // We keep it in DOM for position detection, just invisible
                        const isBeingAnimated = animatingCardIds.has(card.id);
                        if (isAnimating) {
                          return (
                            <CardComponent
                              key={`hand-${card.id}-${index}`}
                              card={card}
                              isFaceUp={true}
                              additionalClassName={`in-hand ${isBeingAnimated ? 'animating-hidden' : ''}`}
                            />
                          );
                        }
                        // CRITICAL: When select_lane_for_play is active, only the cardInHandId should be selected
                        const isSelectedForPlay = gameState.actionRequired?.type === 'select_lane_for_play'
                          ? card.id === (gameState.actionRequired as any).cardInHandId
                          : card.id === selectedCard;

                        return (
                          <CardComponent
                            key={`hand-${card.id}-${index}`}
                            card={card}
                            isFaceUp={true}
                            onPointerDown={() => handleHandCardPointerDown(card)}
                            onPointerEnter={() => handleHandCardPointerEnter(card)}
                            isSelected={isSelectedForPlay}
                            isMultiSelected={multiSelectedCardIds.includes(card.id)}
                            additionalClassName="in-hand"
                          />
                        );
                      });
                    })()}
                  </div>
                </div>
            </div>
        </div>
        {showCoinFlip && <CoinFlipModal onComplete={handleCoinFlipComplete} />}
        {isOnline && (
            <OnlineStatusBar
                client={online!.client}
                waitingForHost={isGuest && !(engine as { hasHostState?: boolean }).hasHostState}
            />
        )}
        {isPhoneLandscape && (
            <div className="rotate-overlay">
                <div className="rotate-icon">⟲</div>
                <p>Turn your phone upright.<br />The board is laid out for portrait.</p>
            </div>
        )}
        {showDebugButton && <DebugPanel onLoadScenario={setupTestScenario} onSkipCoinFlip={handleSkipCoinFlip} onForceWin={handleForceWin} onForceLose={handleForceLose} />}

        {/* Animation Overlay - renders above game during animation queue playback */}
        <AnimationOverlay />
        <EffectsOverlay />
    </div>
  );
}