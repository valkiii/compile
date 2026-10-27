/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CardComponent } from '../components/Card';
import { cards, Card as CardData } from '../data/cards';
import { shuffleDeck } from '../utils/gameLogic';
import { Difficulty, GameMode } from '../types';
import { isCustomProtocolEnabled, setCustomProtocolEnabled } from '../utils/customProtocolSettings';
import { hasSeenTutorial } from '../utils/tutorialProgress';
import { checkOwnerNetwork } from '../multiplayer/ownerNetwork';
import { confirmMovesEnabled, setConfirmMoves } from '../components/ConfirmMove';
import { haptic, hapticsEnabled, setHaptics } from '../utils/haptics';
import { CARD_SETS, MIN_PROTOCOLS, countProtocolsInSets, getCardSets, setCardSets } from '../utils/cardSets';

interface MainMenuProps {
  onNavigate: (screen: 'ProtocolSelection' | 'CardLibrary' | 'Statistics' | 'CustomProtocols' | 'Rules' | 'Tutorial' | 'OnlineLobby') => void;
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
  useControl: boolean;
  onUseControlChange: (enabled: boolean) => void;
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
  /** Room of an online game this device can rejoin (after a reload) */
  resumableOnlineRoom?: string | null;
  onResumeOnline?: () => void;
}


export function MainMenu({ onNavigate, difficulty, setDifficulty, useControl, onUseControlChange, gameMode, setGameMode, resumableOnlineRoom, onResumeOnline }: MainMenuProps) {
  const [showTutorialNudge] = useState(() => !hasSeenTutorial());
  const [confirmMoves, setConfirmMovesState] = useState(confirmMovesEnabled);
  const [vibration, setVibration] = useState(hapticsEnabled);
  const [cardSets, setCardSetsState] = useState<string[]>(getCardSets);
  const protocolCount = countProtocolsInSets(cardSets);
  const tooFewProtocols = protocolCount < MIN_PROTOCOLS;
  const toggleCardSet = (set: string) => {
    const next = cardSets.includes(set) ? cardSets.filter(s => s !== set) : [...cardSets, set];
    if (next.length === 0) return;
    setCardSetsState(next);
    setCardSets(next);
  };
  // Online play is only offered on the owner's own devices (on the tailnet); guests use invite links
  const [onOwnerNetwork, setOnOwnerNetwork] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => checkOwnerNetwork().then(ok => alive && setOnOwnerNetwork(ok));
    check();
    // Re-check when the app comes back (e.g. after switching Tailscale on)
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, []);
  const isSolo = gameMode === 'solo';
  const [decorativeCardRight, setDecorativeCardRight] = useState<CardData | null>(null);
  const [previewCard, setPreviewCard] = useState<CardData | null>(null);
  const [initialPreviewCard, setInitialPreviewCard] = useState<CardData | null>(null);
  const [shuffledTickerCards, setShuffledTickerCards] = useState<CardData[]>([]);
  const [customProtocolsVisible, setCustomProtocolsVisible] = useState(true);
  const [developedClickCount, setDevelopedClickCount] = useState(0);

  useEffect(() => {
    // A stable way to get two different random cards
    const indices = new Set<number>();
    while(indices.size < 2 && indices.size < cards.length) {
        indices.add(Math.floor(Math.random() * cards.length));
    }
    const randomCards = Array.from(indices).map(i => cards[i]);

    // Set up the preview card and the right decorative card
    if (randomCards.length > 0) {
      setInitialPreviewCard(randomCards[0]);
      setPreviewCard(randomCards[0]);
    }
    if (randomCards.length > 1) {
      setDecorativeCardRight(randomCards[1]);
    }

    // Shuffle all cards for the bottom ticker animation
    setShuffledTickerCards(shuffleDeck(cards));
  }, []);

  const handleDevelopedClick = () => {
    const newCount = developedClickCount + 1;
    setDevelopedClickCount(newCount);

    if (newCount >= 5) {
      const newState = !customProtocolsVisible;
      setCustomProtocolsVisible(newState);
      setCustomProtocolEnabled(newState);
      setDevelopedClickCount(0);
    }
  };

  return (
    <div className="screen main-menu">
      <h1>COMPILE: MAIN 1 & 2</h1>
      <div className="main-menu-attribution">
        <p>
          based on the card game <a href="https://boardgamegeek.com/boardgame/406652/compile-main-1" target="_blank" rel="noopener noreferrer">Compile: Main 1</a> designed by <a href="https://justgravyllc.com/" target="_blank" rel="noopener noreferrer">Michael Yang</a>
        </p>
        <p>
          <span onClick={handleDevelopedClick} style={{ cursor: 'default', userSelect: 'none' }}>developed</span> by <a href="https://apo-games.de/" target="_blank" rel="noopener noreferrer">Dirk Aporius</a>
        </p>
      </div>
      
      <div className="main-menu-layout">
        <div className="main-menu-preview decorative-card">
            {previewCard && 
                <CardComponent 
                    card={{...previewCard, id: 'preview', isFaceUp: true}} 
                    isFaceUp={true} 
                />
            }
        </div>

        <div className="main-menu-actions-container">
          <div className="main-menu-start-group">
            {resumableOnlineRoom && onResumeOnline && (
              <button className="tutorial-nudge online-resume" onClick={onResumeOnline}>
                <span className="tutorial-nudge-title">Online game in progress</span>
                <span>Rejoin room {resumableOnlineRoom} →</span>
              </button>
            )}
            {showTutorialNudge && (
              <button className="tutorial-nudge" onClick={() => onNavigate('Tutorial')}>
                <span className="tutorial-nudge-title">New to Compile?</span>
                <span>Take the 2-minute tutorial →</span>
              </button>
            )}
            <div className="difficulty-selector mode-selector">
              <h3 className="difficulty-title">Mode</h3>
              <div className="difficulty-options">
                <button className={`btn ${!isSolo ? 'active' : ''}`} onClick={() => setGameMode('standard')}>Versus AI</button>
                <button className={`btn ${isSolo ? 'active' : ''}`} onClick={() => setGameMode('solo')}>Solo Deck Run</button>
              </div>
              <p className="mode-description">
                {isSolo
                  ? 'Pick any 3 protocols, the AI gets 3 random ones. Your deck is never reshuffled: compile all 3 before it runs dry.'
                  : 'Draft protocols against the AI (1-2-2-1). First to compile all 3 protocols wins.'}
              </p>
            </div>
            <div className="difficulty-selector card-set-selector">
              <h3 className="difficulty-title">Card sets</h3>
              <div className="difficulty-options card-set-options">
                {CARD_SETS.map(set => (
                  <button key={set} className={`btn ${cardSets.includes(set) ? 'active' : ''}`} aria-pressed={cardSets.includes(set)} onClick={() => toggleCardSet(set)}>
                    {set === 'Fan-Content' ? 'Fan' : set}
                  </button>
                ))}
              </div>
              <p className={`mode-description ${tooFewProtocols ? 'card-set-warning' : ''}`}>
                {tooFewProtocols
                  ? `Only ${protocolCount} protocols in these sets: pick sets with at least ${MIN_PROTOCOLS}.`
                  : `${protocolCount} protocols to draft from.`}
              </p>
            </div>
            <div className="difficulty-selector">
              <h3 className="difficulty-title">Difficulty</h3>
              <div className="difficulty-options">
                <button className={`btn ${difficulty === 'easy' ? 'active' : ''}`} onClick={() => setDifficulty('easy')}>Easy</button>
                <button className={`btn ${difficulty === 'normal' ? 'active' : ''}`} onClick={() => setDifficulty('normal')}>Normal</button>
                <button className={`btn ${difficulty === 'hard' ? 'active' : ''}`} onClick={() => setDifficulty('hard')}>Hard</button>
              </div>
            </div>
            <div className="control-mechanic-selector">
                <input
                    type="checkbox"
                    id="control-mechanic"
                    checked={useControl}
                    onChange={(e) => onUseControlChange(e.target.checked)}
                />
                <label htmlFor="control-mechanic">Use Control Mechanic</label>
            </div>
            {!useControl && cardSets.includes('Main 3') && (
              <p className="mode-description control-note">Games with Main 3 protocols always use Control: their cards gain, lose and check it.</p>
            )}
            <div className="control-mechanic-selector">
                <input type="checkbox" id="confirm-moves" checked={confirmMoves} onChange={e => { setConfirmMovesState(e.target.checked); setConfirmMoves(e.target.checked); }} />
                <label htmlFor="confirm-moves">Confirm moves</label>
            </div>
            <div className="control-mechanic-selector">
                <input type="checkbox" id="haptics" checked={vibration} onChange={e => { setVibration(e.target.checked); setHaptics(e.target.checked); if (e.target.checked) haptic(); }} />
                <label htmlFor="haptics">Vibration</label>
            </div>
            <button className="btn btn-start" disabled={tooFewProtocols} onClick={() => onNavigate('ProtocolSelection')}>
              {isSolo ? 'Start Solo Run' : 'Start Game'}
            </button>
            {onOwnerNetwork && (
              <button className="btn btn-online" onClick={() => onNavigate('OnlineLobby')}>
                Play a Friend Online
              </button>
            )}
          </div>
          <div className="main-menu-other-actions">
            <button className="btn" onClick={() => onNavigate('Tutorial')}>
              Tutorial
            </button>
            <button className="btn" onClick={() => onNavigate('CardLibrary')}>
              Cards
            </button>
            <button className="btn" onClick={() => onNavigate('Statistics')}>
              Statistics
            </button>
            {customProtocolsVisible && (
              <button className="btn" onClick={() => onNavigate('CustomProtocols')}>
                Custom Protocols
              </button>
            )}
            <button className="btn" onClick={() => onNavigate('Rules')}>
              Rules
            </button>
            <p className="version-info">Version 0.30</p>
          </div>
        </div>
        
        <div className="decorative-card decorative-card-right">
          {decorativeCardRight && 
              <CardComponent 
                  card={{...decorativeCardRight, id: 'deco-2', isFaceUp: true}} 
                  isFaceUp={true} 
              />
          }
        </div>
      </div>
      
      <div className="card-ticker-container" onPointerLeave={() => setPreviewCard(initialPreviewCard)}>
        <div className="card-ticker-track">
            {/* Render the list twice for a seamless loop */}
            {shuffledTickerCards.map((card, index) => (
                <CardComponent 
                    key={`ticker-1-${index}`}
                    card={{...card, id: `ticker-1-${index}`, isFaceUp: true}} 
                    isFaceUp={true}
                    additionalClassName="in-hand"
                    onPointerEnter={() => setPreviewCard(card)}
                />
            ))}
            {shuffledTickerCards.map((card, index) => (
                <CardComponent 
                    key={`ticker-2-${index}`}
                    card={{...card, id: `ticker-2-${index}`, isFaceUp: true}} 
                    isFaceUp={true}
                    additionalClassName="in-hand"
                    onPointerEnter={() => setPreviewCard(card)}
                />
            ))}
        </div>
      </div>
    </div>
  );
}