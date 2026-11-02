/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shows the cards the opponent has revealed from their hand (e.g. Lust-4 "Reveal your hand").
 * On a phone the opponent's hand is only a thin strip, so revealed cards would go unseen.
 */

import React from 'react';
import { PlayedCard } from '../types';
import { CardComponent } from './Card';

interface RevealedHandProps {
    cards: PlayedCard[];
    onClose: () => void;
}

export const RevealedHand: React.FC<RevealedHandProps> = ({ cards, onClose }) => (
    <div className="modal-overlay revealed-hand-overlay" onClick={onClose}>
        <div className="modal-content revealed-hand-panel" role="dialog" aria-label="Opponent's revealed cards">
            <h2>Opponent reveals {cards.length === 1 ? 'a card' : `${cards.length} cards`}</h2>
            <div className="revealed-hand-cards">
                {cards.map(card => (
                    <CardComponent key={card.id} card={card} isFaceUp={true} additionalClassName="in-hand" />
                ))}
            </div>
            <p className="revealed-hand-hint">They stay visible in the opponent's hand · tap to close</p>
        </div>
    </div>
);
