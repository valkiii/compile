/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra visual punch on top of the card animations: a lightning strike when a protocol
 * compiles, a burst of sparks where a card is deleted, and a glow ring when a card flips.
 * Driven by the animation queue, so an online guest sees the host's effects too.
 */

import React, { useEffect, useState } from 'react';
import { useAnimationQueue } from '../contexts/AnimationQueueContext';
import { CardPosition } from '../types/animation';

type Effect =
    | { id: string; kind: 'bolt'; x: number; top: number; bottom: number; width: number }
    | { id: string; kind: 'burst'; x: number; y: number; color: string }
    | { id: string; kind: 'flip'; rect: DOMRect };

function cardRect(pos: CardPosition | undefined): DOMRect | null {
    if (!pos || pos.type !== 'lane') return null;
    const side = document.querySelector(pos.owner === 'opponent' ? '.game-board .opponent-side' : '.game-board .player-side:not(.opponent-side)');
    const lane = side?.querySelectorAll('.lane-stack')[pos.laneIndex];
    const card = lane?.querySelectorAll('.card-component')[pos.cardIndex] as HTMLElement | undefined;
    return card ? card.getBoundingClientRect() : (lane as HTMLElement | undefined)?.getBoundingClientRect() ?? null;
}

const BOLT_PATH = 'M30 0 L12 46 L26 46 L8 100 L44 38 L28 38 L42 0 Z';

export const EffectsOverlay: React.FC = () => {
    const { currentAnimation } = useAnimationQueue();
    const [effects, setEffects] = useState<Effect[]>([]);

    useEffect(() => {
        const anim = currentAnimation;
        if (!anim) return;
        const add = (e: Effect, ms: number) => {
            setEffects(prev => [...prev, e]);
            setTimeout(() => setEffects(prev => prev.filter(x => x.id !== e.id)), ms);
        };
        const id = anim.id;

        if (anim.compile === 'start' && anim.laneIndex !== undefined) {
            // Strike the compiled line's protocol, from the top of the board
            const board = document.querySelector('.game-board')?.getBoundingClientRect();
            const owner = anim.animatingCard?.fromPosition.type === 'lane' ? anim.animatingCard.fromPosition.owner : 'player';
            const bar = document.querySelector(owner === 'opponent' ? '.game-board .protocol-bar.opponent-bar' : '.game-board .protocol-bar.player-bar');
            const cell = bar?.querySelectorAll('.protocol-display')[anim.laneIndex]?.getBoundingClientRect();
            if (board && cell) {
                add({ id: `${id}-bolt`, kind: 'bolt', x: cell.left + cell.width / 2, top: board.top, bottom: cell.top + cell.height / 2, width: Math.min(120, cell.width * 0.6) }, 900);
            }
            return;
        }

        if (anim.type === 'delete' && anim.animatingCard) {
            const rect = cardRect(anim.animatingCard.fromPosition);
            if (rect) {
                const color = getComputedStyle(document.documentElement).getPropertyValue('--danger-color') || '#ff5555';
                add({ id: `${id}-burst`, kind: 'burst', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color }, 750);
            }
            return;
        }

        if (anim.type === 'flip' && anim.animatingCard) {
            const rect = cardRect(anim.animatingCard.fromPosition);
            if (rect) add({ id: `${id}-flip`, kind: 'flip', rect }, 700);
        }
    }, [currentAnimation?.id]);

    if (effects.length === 0) return null;

    return (
        <div className="effects-overlay" aria-hidden="true">
            {effects.map(e => {
                if (e.kind === 'bolt') {
                    const height = Math.max(60, e.bottom - e.top);
                    return (
                        <React.Fragment key={e.id}>
                            <div className="fx-flash" />
                            <svg className="fx-bolt" viewBox="0 0 50 100" preserveAspectRatio="none"
                                style={{ left: e.x - e.width / 2, top: e.top, width: e.width, height }}>
                                <path d={BOLT_PATH} />
                            </svg>
                            <div className="fx-impact" style={{ left: e.x, top: e.bottom }} />
                        </React.Fragment>
                    );
                }
                if (e.kind === 'burst') {
                    return (
                        <div key={e.id} className="fx-burst" style={{ left: e.x, top: e.y, '--fx-color': e.color } as React.CSSProperties}>
                            {Array.from({ length: 12 }, (_, i) => (
                                <span key={i} style={{ '--a': `${i * 30 + (i % 2) * 12}deg`, '--d': `${38 + (i % 3) * 16}px` } as React.CSSProperties} />
                            ))}
                        </div>
                    );
                }
                return (
                    <div key={e.id} className="fx-flip" style={{ left: e.rect.left, top: e.rect.top, width: e.rect.width, height: e.rect.height }} />
                );
            })}
        </div>
    );
};
