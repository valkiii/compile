/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player } from '../App';
import { Difficulty, GameMode, GameState } from '../types';

interface ResultsScreenProps {
  onPlayAgain: () => void;
  winner: Player | null;
  finalState: GameState | null;
  difficulty: Difficulty;
  mode?: GameMode;
  lossReason?: string | null;
  /** Online: play again in the same room */
  onRematch?: () => void;
}

export function ResultsScreen({ onPlayAgain, winner, finalState, difficulty, mode = 'standard', lossReason, onRematch }: ResultsScreenProps) {
  if (!finalState) {
    return (
      <div className="screen">
        <h1>Loading Results...</h1>
        <button className="btn" onClick={onPlayAgain}>
          Back to Menu
        </button>
      </div>
    );
  }

  const hasWon = winner === 'player';
  const getProtocolClass = (baseClass: string, isCompiled: boolean) => {
      let classes = [baseClass];
      if (isCompiled) classes.push('compiled');
      return classes.join(' ');
  }

  return (
    <div className={`screen results-screen ${hasWon ? 'victory' : 'defeat'}`}>
      <div className="results-screen-content">
        <header className="results-header">
            <h1>{hasWon ? 'VICTORY' : 'DEFEAT'}</h1>
            <p>{hasWon ? 'System compiled successfully.' : (lossReason || 'Critical error in the mainframe.')}</p>
            {mode === 'solo' && (
              <p className="results-mode-note">
                Solo Deck Run{hasWon ? ` cleared with ${finalState.player.deck.length} card${finalState.player.deck.length === 1 ? '' : 's'} left in your deck.` : '.'}
              </p>
            )}
            {mode === 'tutorial' && (
              <p className="results-mode-note">Tutorial game complete. Next: try a real draft from the main menu.</p>
            )}
        </header>

        <div className="results-body">
            <div className="final-score-section">
                <h3>Final Score</h3>
                <h4 className="results-label results-opponent-label">{mode === 'online' ? 'Rival' : `Opponent (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})`}</h4>
                <div className="protocol-bars-container">
                    <div className="protocol-bar opponent-bar">
                        {finalState.opponent.protocols.map((p, i) => 
                            <div key={`opp-proto-${p}-${i}`} className={getProtocolClass('protocol-display', finalState.opponent.compiled[i])}>
                                <span className="protocol-name">{p}</span>
                                <span className="protocol-value">{finalState.opponent.laneValues[i]}</span>
                            </div>
                        )}
                    </div>
                    <div className="protocol-bar player-bar">
                        {finalState.player.protocols.map((p, i) => 
                            <div key={`player-proto-${p}-${i}`} className={getProtocolClass('protocol-display', finalState.player.compiled[i])}>
                                <span className="protocol-name">{p}</span>
                                <span className="protocol-value">{finalState.player.laneValues[i]}</span>
                            </div>
                        )}
                    </div>
                </div>
                <h4 className="results-label results-player-label">Player</h4>
            </div>

            <div className="stats-section">
                <h3>Statistics</h3>
                <div className="stats-grid">
                    <div className="stat-item">
                        <span className="stat-item-label">Cards Played</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsPlayed}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsPlayed}</span>
                    </div>
                     <div className="stat-item">
                        <span className="stat-item-label">Cards Drawn</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsDrawn}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsDrawn}</span>
                    </div>
                     <div className="stat-item">
                        <span className="stat-item-label">Cards Discarded</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsDiscarded}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsDiscarded}</span>
                    </div>
                     <div className="stat-item">
                        <span className="stat-item-label">Cards Deleted</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsDeleted}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsDeleted}</span>
                    </div>
                     <div className="stat-item">
                        <span className="stat-item-label">Cards Flipped</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsFlipped}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsFlipped}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-item-label">Cards Shifted</span>
                        <span className="stat-item-value opponent">{finalState.stats.opponent.cardsShifted}</span>
                        <span className="stat-item-value player">{finalState.stats.player.cardsShifted}</span>
                    </div>
                </div>
            </div>
        </div>
        
        {onRematch ? (
          <div className="results-online-actions">
            <button className="btn btn-start" onClick={onRematch}>Rematch</button>
            <button className="btn" onClick={onPlayAgain}>Leave room</button>
          </div>
        ) : (
          <button className="btn" onClick={onPlayAgain}>
              Play Again
          </button>
        )}
      </div>
    </div>
  );
}