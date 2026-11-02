/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Card as CardData } from '../data/cards';
import { Player, PlayerState, PlayedCard, Difficulty } from '../types';
import { CardComponent } from './Card';
import { CardDetailSheet } from './CardDetailSheet';
import { useIsCompact } from '../hooks/useIsCompact';

interface DebugModalProps {
  player: Player;
  playerState: PlayerState;
  onClose: () => void;
  difficulty?: Difficulty;
}

export function DebugModal({ player, playerState, onClose, difficulty }: DebugModalProps) {
  const playerName = player === 'player'
    ? 'Player'
    : `Opponent${difficulty ? ` (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})` : ''}`;
  const [previewCard, setPreviewCard] = useState<PlayedCard | null>(null);
  // Phones: the grid cards are small, so a tap opens the readable detail sheet instead of the side preview
  const isCompact = useIsCompact();
  // The tap that opened this panel must not also "click" the card that appears under the finger
  const [openedAt] = useState(() => Date.now());
  const justOpened = () => Date.now() - openedAt < 450;

  const handleCardHover = (card: PlayedCard | null) => {
    setPreviewCard(card);
  };

  const handleCardClick = (card: PlayedCard) => {
    // Toggle: if clicking the same card, deselect; otherwise select it
    setPreviewCard(prev => prev?.id === card.id ? null : card);
  };

  const renderCardGrid = (cards: CardData[], title: string, showFaceUp: boolean) => {
    // Adapt CardData to PlayedCard for the component
    const playedCards: PlayedCard[] = cards.map((card, index) => ({
      ...card,
      id: `${title}-${card.protocol}-${card.value}-${index}`,
      isFaceUp: showFaceUp,
    }));

    return (
      <>
        <h3>{title} ({playedCards.length})</h3>
        <div className="debug-card-grid">
          {playedCards.length > 0 ? (
            playedCards.map(card => (
              <div
                key={card.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (justOpened()) return;
                  setPreviewCard(card);
                }}
                onMouseEnter={isCompact ? undefined : () => handleCardHover(card)}
                onMouseLeave={isCompact ? undefined : () => handleCardHover(null)}
                style={{ cursor: 'pointer' }}
              >
                <CardComponent
                  card={card}
                  isFaceUp={showFaceUp}
                  additionalClassName="in-hand"
                />
              </div>
            ))
          ) : (
            <p className="no-cards">No cards in {title.toLowerCase()}.</p>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content debug-modal-content debug-modal-with-preview" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-back modal-close-btn" onClick={onClose}>X</button>
        <h2>{playerName}'s Info</h2>

        <div className="debug-content-wrapper">
          {/* Left preview area */}
          <div className="debug-preview-area">
            {previewCard && (
              <div className="debug-preview-card">
                <CardComponent
                  card={previewCard}
                  isFaceUp={previewCard.isFaceUp}
                />
              </div>
            )}
          </div>

          {/* Card grids */}
          <div className="debug-grids-area">
            {renderCardGrid(playerState.deck, 'Deck', false)}
            {renderCardGrid(playerState.discard, 'Discard Pile', true)}
          </div>
        </div>
      </div>
      {isCompact && previewCard && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardDetailSheet card={previewCard} showContents={previewCard.isFaceUp} withBackdrop={true} onClose={() => setPreviewCard(null)} />
        </div>
      )}
    </div>
  );
}