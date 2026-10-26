/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MainMenu } from './screens/MainMenu';
import { ProtocolSelection } from './screens/ProtocolSelection';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { CardLibraryScreen } from './screens/CardLibraryScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { CustomProtocolCreator } from './screens/CustomProtocolCreator';
import { RulesScreen } from './screens/RulesScreen';
import { TutorialScreen } from './screens/TutorialScreen';
import { OnlineLobby } from './screens/OnlineLobby';
import { OnlineDraft } from './screens/OnlineDraft';
import { RelayClient, Role, loadSavedSession } from './multiplayer/relayClient';
import { OnlineGameSetup, isOnlineMessage } from './multiplayer/messages';
import { clearHostGame, loadHostGame, saveHostGame } from './multiplayer/savedGame';
import { OnlineChat } from './components/OnlineChat';
import { CoinFlipModal } from './components/CoinFlipModal';
import { Difficulty, GameMode, GameState } from './types';
import { loadDefaultCustomProtocols } from './logic/customProtocols/loadDefaultProtocols';
import * as testScenarios from './utils/testScenarios';

type Screen = 'MainMenu' | 'ProtocolSelection' | 'GameScreen' | 'ResultsScreen' | 'CardLibrary' | 'Statistics' | 'CustomProtocols' | 'Rules' | 'Tutorial' | 'OnlineLobby' | 'OnlineDraft';

type OnlineConnection = { client: RelayClient; role: Role };

// Simple, low-interaction protocols for the guided first game
const TUTORIAL_PLAYER_PROTOCOLS = ['Life', 'Light', 'Fire'];
const TUTORIAL_OPPONENT_PROTOCOLS = ['Water', 'Metal', 'Death'];
export type Player = 'player' | 'opponent';

export function App() {
  const [screen, setScreen] = useState<Screen>('MainMenu');
  const [playerProtocols, setPlayerProtocols] = useState<string[]>([]);
  const [opponentProtocols, setOpponentProtocols] = useState<string[]>([]);
  const [winner, setWinner] = useState<Player | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [gameMode, setGameMode] = useState<GameMode>('standard');
  const [lossReason, setLossReason] = useState<string | null>(null);
  const [finalGameState, setFinalGameState] = useState<GameState | null>(null);
  const [useControl, setUseControl] = useState(true);
  const [startingPlayer, setStartingPlayer] = useState<Player>('player');
  const [initialScenarioSetup, setInitialScenarioSetup] = useState<((state: GameState) => GameState) | null>(null);

  // Online multiplayer
  const [online, setOnline] = useState<OnlineConnection | null>(null);
  const [onlineSetup, setOnlineSetup] = useState<OnlineGameSetup | null>(null);
  const [onlineResumeState, setOnlineResumeState] = useState<GameState | null>(null);
  const [joinCode] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('join');
    } catch {
      return null;
    }
  });
  const [savedSession, setSavedSession] = useState(() => loadSavedSession());
  const screenRef = React.useRef(screen);
  screenRef.current = screen;
  const onlineSetupRef = React.useRef(onlineSetup);
  onlineSetupRef.current = onlineSetup;

  // Invite links open the lobby straight away
  useEffect(() => {
    if (joinCode) {
      setScreen('OnlineLobby');
      // Drop ?join= so a reload doesn't try to join the same room again (keep other params)
      const params = new URLSearchParams(window.location.search);
      params.delete('join');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, [joinCode]);

  // Load default custom protocols on app start (Anarchy_custom for testing)
  useEffect(() => {
    loadDefaultCustomProtocols();
  }, []);

  // E2E TEST SUPPORT: Load test scenario from URL parameter
  // Usage: http://localhost:3000/?testScenario=basic-game (JSON file)
  // Usage: http://localhost:3000/?scenario=scenario1_Psychic3Uncover (from testScenarios.ts)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jsonScenario = params.get('testScenario');
    const tsScenario = params.get('scenario');

    // Option 1: Load from JSON file (simple scenarios)
    if (jsonScenario) {
      console.log(`[E2E] Loading JSON test scenario: ${jsonScenario}`);
      fetch(`/e2e/scenarios/${jsonScenario}.json`)
        .then(res => {
          if (!res.ok) throw new Error(`Scenario not found: ${jsonScenario}`);
          return res.json();
        })
        .then((scenario: {
          playerProtocols: string[];
          opponentProtocols: string[];
          difficulty: Difficulty;
          useControlMechanic: boolean;
          startingPlayer: Player;
        }) => {
          console.log('[E2E] Scenario loaded:', scenario);
          setDifficulty(scenario.difficulty);
          setUseControl(scenario.useControlMechanic);
          setPlayerProtocols(scenario.playerProtocols);
          setOpponentProtocols(scenario.opponentProtocols);
          setStartingPlayer(scenario.startingPlayer);
          setScreen('GameScreen');
        })
        .catch(err => {
          console.error('[E2E] Failed to load scenario:', err);
        });
    }

    // Option 2: Load from testScenarios.ts (complex scenarios with board setup)
    if (tsScenario) {
      console.log(`[E2E] Loading complex scenario: ${tsScenario}`);
      const scenario = (testScenarios as any)[tsScenario] as testScenarios.TestScenario | undefined;

      if (scenario) {
        console.log('[E2E] Complex scenario found:', scenario.name);
        // Store the setup function to be called after game initializes
        setInitialScenarioSetup(() => scenario.setup);
        // Set default protocols (will be overwritten by setup)
        setPlayerProtocols(['Fire', 'Water', 'Speed']);
        setOpponentProtocols(['Death', 'Life', 'Light']);
        setDifficulty('easy');
        setUseControl(false);
        setScreen('GameScreen');
      } else {
        console.error(`[E2E] Scenario not found: ${tsScenario}`);
        console.log('[E2E] Available scenarios:', Object.keys(testScenarios).filter(k => k.startsWith('scenario')));
      }
    }
  }, []);

  const handleBackToMenu = useCallback(() => {
    setScreen('MainMenu');
    setPlayerProtocols([]);
    setOpponentProtocols([]);
    setWinner(null);
    setFinalGameState(null);
    setLossReason(null);
    setGameMode(mode => mode === 'tutorial' ? 'standard' : mode);
  }, []);

  const leaveOnline = useCallback(() => {
    online?.client.leave();
    clearHostGame();
    setOnline(null);
    setOnlineSetup(null);
    setOnlineResumeState(null);
    setSavedSession(null);
    setGameMode('standard');
    handleBackToMenu();
  }, [online, handleBackToMenu]);

  const startOnlineGame = useCallback((setup: OnlineGameSetup, role: Role) => {
    setOnlineSetup(setup);
    setOnlineResumeState(null);
    setPlayerProtocols(role === 'host' ? setup.hostProtocols : setup.guestProtocols);
    setOpponentProtocols(role === 'host' ? setup.guestProtocols : setup.hostProtocols);
    setUseControl(setup.useControl);
    setWinner(null);
    setFinalGameState(null);
    setLossReason(null);
    setGameMode('online');
    setScreen('GameScreen');
  }, []);

  const handleOnlineReady = useCallback((client: RelayClient, role: Role) => {
    setOnline({ client, role });
    setGameMode('online');
    setScreen('OnlineDraft');
  }, []);

  // Rejoin after the page was reloaded (Safari discarded the tab, phone restarted, ...)
  const resumeOnline = useCallback(() => {
    const session = loadSavedSession();
    if (!session) return;
    const client = new RelayClient();
    client.resume(session);
    setOnline({ client, role: session.role });
    setGameMode('online');
    const saved = session.role === 'host' ? loadHostGame(session.room) : null;
    if (saved) {
      setOnlineSetup(saved.setup);
      setOnlineResumeState(saved.state);
      setPlayerProtocols(saved.setup.hostProtocols);
      setOpponentProtocols(saved.setup.guestProtocols);
      setUseControl(saved.setup.useControl);
      setScreen('GameScreen');
    } else {
      // Host without a saved game restarts the draft; the guest is routed by the host's messages
      // (the guest's draft screen asks the host for the current draft or game)
      setScreen('OnlineDraft');
    }
  }, []);

  // App-level online routing (screen changes driven by the other player)
  useEffect(() => {
    if (!online) return;
    const { client, role } = online;
    return client.on(event => {
      if (event.type === 'error' && (event.code === 'taken' || event.code === 'no_room')) {
        setSavedSession(null);
      }
      if (event.type !== 'message' || !isOnlineMessage(event.data)) return;
      const msg = event.data;
      if (role === 'guest') {
        if (msg.k === 'start' && msg.game.gameId !== onlineSetupRef.current?.gameId) {
          startOnlineGame(msg.game, 'guest');
        } else if (msg.k === 'draft' && screenRef.current !== 'OnlineDraft' && msg.draft.step < 4) {
          setScreen('OnlineDraft');
        }
      } else {
        if (msg.k === 'sync' && screenRef.current === 'GameScreen' && onlineSetupRef.current) {
          client.send({ k: 'start', game: onlineSetupRef.current });
        } else if (msg.k === 'rematch' && screenRef.current === 'ResultsScreen') {
          setOnlineSetup(null);
          setScreen('OnlineDraft');
        }
      }
    });
  }, [online, startOnlineGame]);

  const requestRematch = useCallback(() => {
    if (!online) return;
    if (online.role === 'host') {
      setOnlineSetup(null);
      setScreen('OnlineDraft');
    } else {
      online.client.send({ k: 'rematch' });
    }
  }, [online]);

  const startTutorialGame = useCallback(() => {
    setGameMode('tutorial');
    setDifficulty('easy');
    setPlayerProtocols(TUTORIAL_PLAYER_PROTOCOLS);
    setOpponentProtocols(TUTORIAL_OPPONENT_PROTOCOLS);
    setWinner(null);
    setFinalGameState(null);
    setLossReason(null);
    setScreen('GameScreen');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape must not silently abandon an online game
      if (event.key === 'Escape' && !online) {
        handleBackToMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleBackToMenu, online]);

  const startGame = useCallback((playerProtos: string[], opponentProtos: string[]) => {
    setPlayerProtocols(playerProtos);
    setOpponentProtocols(opponentProtos);
    setWinner(null);
    setFinalGameState(null);
    setStartingPlayer('player'); // Reset, will be set by coin flip
    setScreen('GameScreen'); // Go directly to game, coin flip will show as overlay
  }, []);

  const handleEndGame = useCallback((winner: Player, finalState: GameState, reason?: string) => {
    setWinner(winner);
    setLossReason(reason ?? null);
    setFinalGameState(finalState);
    setScreen('ResultsScreen');
  }, []);

  const renderScreen = () => {
    switch (screen) {
      case 'MainMenu':
        return (
          <MainMenu
            onNavigate={(target) => setScreen(target)}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            useControl={useControl}
            onUseControlChange={setUseControl}
            gameMode={gameMode}
            setGameMode={setGameMode}
            resumableOnlineRoom={savedSession?.room ?? null}
            onResumeOnline={resumeOnline}
          />
        );
      case 'OnlineLobby':
        return (
          <OnlineLobby
            initialJoinCode={joinCode}
            onReady={handleOnlineReady}
            onBack={online ? leaveOnline : handleBackToMenu}
          />
        );
      case 'OnlineDraft':
        return online ? (
          <OnlineDraft
            key={`draft-${onlineSetup?.gameId ?? 'new'}-${online.role}`}
            client={online.client}
            role={online.role}
            useControl={useControl}
            onStart={setup => startOnlineGame(setup, online.role)}
            onLeave={leaveOnline}
          />
        ) : null;
      case 'ProtocolSelection':
        return (
          <ProtocolSelection
            mode={gameMode}
            onBack={handleBackToMenu}
            onStartGame={startGame}
          />
        );
      case 'GameScreen':
        return (
          <GameScreen
            key={onlineSetup?.gameId ?? 'local'}
            onBack={gameMode === 'online' ? leaveOnline : handleBackToMenu}
            onEndGame={handleEndGame}
            playerProtocols={playerProtocols}
            opponentProtocols={opponentProtocols}
            difficulty={difficulty}
            useControlMechanic={useControl}
            mode={gameMode}
            startingPlayer={startingPlayer}
            initialScenarioSetup={initialScenarioSetup}
            online={gameMode === 'online' && online && onlineSetup ? {
              client: online.client,
              role: online.role,
              setup: onlineSetup,
              initialState: onlineResumeState ?? undefined,
              onHostStateChange: online.role === 'host'
                ? state => saveHostGame(online.client.session?.room ?? '', onlineSetup, state)
                : undefined,
            } : undefined}
          />
        );
      case 'ResultsScreen':
        return (
          <ResultsScreen
            onPlayAgain={gameMode === 'online' ? leaveOnline : handleBackToMenu}
            onRematch={gameMode === 'online' ? requestRematch : undefined}
            winner={winner}
            finalState={finalGameState}
            difficulty={difficulty}
            mode={gameMode}
            lossReason={lossReason}
          />
        );
      case 'CardLibrary':
        return <CardLibraryScreen onBack={handleBackToMenu} />;
      case 'Statistics':
        return <StatisticsScreen onBack={handleBackToMenu} />;
      case 'CustomProtocols':
        return <CustomProtocolCreator onBack={handleBackToMenu} />;
      case 'Rules':
        return <RulesScreen onBack={handleBackToMenu} />;
      case 'Tutorial':
        return <TutorialScreen onBack={handleBackToMenu} onStartTutorialGame={startTutorialGame} />;
      default:
        return <MainMenu onNavigate={(target) => setScreen(target)} difficulty={difficulty} setDifficulty={setDifficulty} useControl={useControl} onUseControlChange={setUseControl} gameMode={gameMode} setGameMode={setGameMode} resumableOnlineRoom={savedSession?.room ?? null} onResumeOnline={resumeOnline} />;
    }
  };

  const chatRoom = online?.client.session?.room;
  const showChat = !!online && !!chatRoom && (screen === 'OnlineDraft' || screen === 'GameScreen' || screen === 'ResultsScreen');

  return (
    <>
      {renderScreen()}
      {showChat && <OnlineChat key={chatRoom} client={online!.client} room={chatRoom!} inGame={screen === 'GameScreen'} />}
    </>
  );
}