/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phone-only card inspector. Cards on a phone board are too small to read, so tapping one
 * opens this readable, wide panel instead of the desktop sidebar preview.
 */

import React from 'react';
import { PlayedCard } from '../types';
import { cardArtUrl } from '../data/cardArt';

interface CardDetailSheetProps {
    card: PlayedCard;
    showContents: boolean;
    onClose: () => void;
}

const SECTIONS: { key: 'top' | 'middle' | 'bottom'; label: string; hint: string }[] = [
    { key: 'top', label: 'Top', hint: 'Persistent while face-up' },
    { key: 'middle', label: 'Middle', hint: 'When played / flipped / uncovered' },
    { key: 'bottom', label: 'Bottom', hint: 'Only while uncovered' },
];

export const CardDetailSheet: React.FC<CardDetailSheetProps> = ({ card, showContents, onClose }) => {
    const style = card.color ? ({ '--card-custom-color': card.color } as React.CSSProperties) : undefined;

    return (
        <div className="card-detail-sheet" onPointerDown={onClose} role="dialog" aria-label="Card details">
            <div className={`card-detail-panel card-protocol-${card.protocol.toLowerCase()}`} style={style}>
                {showContents ? (
                    <>
                        {cardArtUrl(card.protocol, card.value) && (
                            <div className="card-detail-art" style={{ backgroundImage: `url(${cardArtUrl(card.protocol, card.value)})` }} aria-hidden="true" />
                        )}
                        <div className="card-detail-header">
                            <span className="card-detail-protocol">{card.protocol}</span>
                            {!card.isFaceUp && <span className="card-detail-tag">face-down · counts as 2</span>}
                            <span className="card-detail-value">{card.value}</span>
                        </div>
                        <div className="card-detail-body">
                            {SECTIONS.map(({ key, label, hint }) => (
                                <div key={key} className={`card-detail-row ${card[key] ? '' : 'is-empty'}`}>
                                    <span className="card-detail-label" title={hint}>{label}</span>
                                    {card[key]
                                        ? <span className="card-detail-text" dangerouslySetInnerHTML={{ __html: card[key] }} />
                                        : <span className="card-detail-text">—</span>}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="card-detail-hidden">
                        <span className="card-detail-protocol">Face-down card</span>
                        <span>Hidden from you. It counts as value 2 in its line (unless a card says otherwise).</span>
                    </div>
                )}
                <span className="card-detail-dismiss">tap to close</span>
            </div>
        </div>
    );
};
