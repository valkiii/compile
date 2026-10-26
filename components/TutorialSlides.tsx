/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step-by-step "How to play" walkthrough. Used by the Tutorial screen and by the in-game "?" button.
 */

import React, { useMemo, useRef, useState } from 'react';
import { CardComponent } from './Card';
import { cards } from '../data/cards';

type MiniCard = { label: string; value: number; faceDown?: boolean; tone?: 'player' | 'opponent' };

const MiniStack: React.FC<{ stack: MiniCard[]; owner: 'player' | 'opponent' }> = ({ stack, owner }) => (
    <div className={`tut-stack ${owner}`}>
        {stack.map((c, i) => (
            <div key={i} className={`tut-card ${c.faceDown ? 'face-down' : ''} ${i === stack.length - 1 ? 'uncovered' : 'covered'}`} style={{ '--i': i } as React.CSSProperties}>
                {c.faceDown ? <span className="tut-card-value">2</span> : <><span className="tut-card-name">{c.label}</span><span className="tut-card-value">{c.value}</span></>}
            </div>
        ))}
    </div>
);

const MiniBoard: React.FC<{ opp: MiniCard[][]; me: MiniCard[][]; oppProtocols: string[]; myProtocols: string[]; highlight?: number; compiled?: number }> = ({ opp, me, oppProtocols, myProtocols, highlight, compiled }) => {
    const sum = (s: MiniCard[]) => s.reduce((t, c) => t + (c.faceDown ? 2 : c.value), 0);
    return (
        <div className="tut-board">
            <div className="tut-lanes opponent">
                {opp.map((s, i) => <div key={i} className="tut-lane"><MiniStack stack={s} owner="opponent" /></div>)}
            </div>
            <div className="tut-protocols">
                <div className="tut-proto-row opponent">
                    {oppProtocols.map((p, i) => <span key={p}>{p}<b>{sum(opp[i])}</b></span>)}
                </div>
                <div className="tut-proto-row player">
                    {myProtocols.map((p, i) => <span key={p} className={`${highlight === i ? 'highlight' : ''} ${compiled === i ? 'compiled' : ''}`}>{p}<b>{sum(me[i])}</b></span>)}
                </div>
            </div>
            <div className="tut-lanes player">
                {me.map((s, i) => <div key={i} className={`tut-lane ${highlight === i ? 'highlight' : ''}`}><MiniStack stack={s} owner="player" /></div>)}
            </div>
        </div>
    );
};

const SampleCard: React.FC = () => {
    const sample = useMemo(() => cards.find(c => c.top && c.middle && c.bottom) ?? cards[0], []);
    if (!sample) return null;
    return (
        <div className="tut-anatomy">
            <div className="tut-anatomy-card">
                <CardComponent card={{ ...sample, id: 'tut-sample', isFaceUp: true }} isFaceUp={true} />
            </div>
            <ul className="tut-anatomy-legend">
                <li><b>Protocol + value</b> The name matches one of the lines; the number is what it adds to the line.</li>
                <li><b>Top</b> Always on while face-up, even when covered.</li>
                <li><b>Middle</b> Happens once when the card is played face-up, flipped face-up or uncovered.</li>
                <li><b>Bottom</b> Only works while the card is uncovered (on top of its stack).</li>
            </ul>
        </div>
    );
};

type Slide = { title: string; body: React.ReactNode; visual?: React.ReactNode };

const SLIDES: Slide[] = [
    {
        title: 'The goal',
        body: <>You and the AI are rival programs. Each of you runs <b>3 protocols</b>. <b>Compile all 3</b> of yours before the AI compiles its 3 and you win.</>,
        visual: <MiniBoard opp={[[], [], []]} me={[[], [], []]} oppProtocols={['Water', 'Metal', 'Death']} myProtocols={['Life', 'Light', 'Fire']} compiled={0} />,
    },
    {
        title: 'Three lines',
        body: <>The board has <b>3 lines</b>. Each line pairs one of your protocols with one of the AI's. Cards you play stack on <b>your side</b> of a line. The number under each protocol is the <b>sum of your cards</b> in that line.</>,
        visual: <MiniBoard opp={[[{ label: 'Water', value: 3 }], [{ label: '', value: 2, faceDown: true }], []]} me={[[{ label: 'Life', value: 4 }, { label: 'Life', value: 2 }], [], [{ label: '', value: 2, faceDown: true }]]} oppProtocols={['Water', 'Metal', 'Death']} myProtocols={['Life', 'Light', 'Fire']} />,
    },
    {
        title: 'Reading a card',
        body: <>Every card has a protocol, a value (0–6) and up to three commands.</>,
        visual: <SampleCard />,
    },
    {
        title: 'Your turn: play OR refresh',
        body: <>
            On your turn you do exactly <b>one</b> thing:
            <ul>
                <li><b>Play face-up</b>: only into the line of the <b>same protocol</b>. Its middle command fires.</li>
                <li><b>Play face-down</b>: into <b>any</b> line. No effect, but it always counts as <b>2</b>.</li>
                <li><b>Refresh</b>: draw until you hold 5 cards.</li>
            </ul>
        </>,
        visual: <div className="tut-row">
            <MiniStack owner="player" stack={[{ label: 'Fire', value: 4 }]} />
            <span className="tut-or">or</span>
            <MiniStack owner="player" stack={[{ label: '', value: 2, faceDown: true }]} />
        </div>,
    },
    {
        title: 'Covered and uncovered',
        body: <>A new card <b>covers</b> the one below it. Effects usually target only <b>uncovered</b> cards (the top of a stack). If the card on top leaves, the card below is <b>uncovered</b> and its middle command fires again. That can set off chain reactions.</>,
        visual: <div className="tut-row"><MiniStack owner="player" stack={[{ label: 'Light', value: 1 }, { label: 'Light', value: 3 }, { label: '', value: 2, faceDown: true }]} /><span className="tut-note">bottom two: covered<br />top: uncovered</span></div>,
    },
    {
        title: 'Compile!',
        body: <>At the start of your turn, a line where you have <b>10 or more</b> and <b>more than the AI</b> <b>must be compiled</b>. Every card in that line (both sides!) is deleted and your protocol flips to <b>Compiled</b>. That uses your whole turn. Compile it again later and you steal the top card of the AI's deck instead.</>,
        visual: <MiniBoard opp={[[{ label: 'Water', value: 3 }], [], []]} me={[[{ label: 'Life', value: 4 }, { label: 'Life', value: 5 }, { label: '', value: 2, faceDown: true }], [], []]} oppProtocols={['Water', 'Metal', 'Death']} myProtocols={['Life', 'Light', 'Fire']} highlight={0} />,
    },
    {
        title: 'Turn order',
        body: <ol className="tut-phases">
            <li><b>Start</b>: "Start:" commands trigger.</li>
            <li><b>Control</b>: lead in 2+ lines and you take the Control component.</li>
            <li><b>Compile</b>: compile a line if you can (you must).</li>
            <li><b>Action</b>: play 1 card or refresh.</li>
            <li><b>Hand limit</b>: discard down to 5.</li>
            <li><b>End</b>: "End:" commands trigger.</li>
        </ol>,
    },
    {
        title: 'Control (optional rule)',
        body: <>Whoever leads in <b>2 or more lines</b> at the start of their turn takes the <b>C</b> coin. The next time they compile or refresh, they return it and <b>may rearrange</b> either player's protocols. Swap a nearly-full line under a protocol you still need!</>,
        visual: <div className="tut-row"><div className="control-coin player-controlled tut-coin">C</div></div>,
    },
    {
        title: 'Keywords',
        body: <dl className="tut-keywords">
            <dt>Flip</dt><dd>Turn a card face-up ↔ face-down (face-up triggers its middle).</dd>
            <dt>Shift</dt><dd>Move a card to another line on the same side.</dd>
            <dt>Delete</dt><dd>Send a card from the board to its owner's trash.</dd>
            <dt>Return</dt><dd>Put a card from the board back into its owner's hand.</dd>
            <dt>Discard</dt><dd>Put a card from your hand into your trash.</dd>
            <dt>Draw</dt><dd>Take cards from your deck. An empty deck reshuffles your trash.</dd>
        </dl>,
    },
    {
        title: 'Playing on your phone',
        body: <ul>
            <li><b>Tap a card in your hand</b> to select it and read it.</li>
            <li><b>Tap a glowing line</b> to play it. The matching line plays it face-up; other lines play it face-down.</li>
            <li>Want it face-down in the matching line? Use the <b>Face-down</b> button on that line.</li>
            <li><b>Tap any card on the board</b> to read it. Tap the panel to close it.</li>
            <li>The top bar shows the AI's hand ✋, deck and trash. <b>Log</b> has the full history and <b>?</b> brings this guide back.</li>
        </ul>,
    },
    {
        title: 'Play a friend online',
        body: <ul>
            <li>Tap <b>Play a Friend Online</b> → <b>Create room</b> and send the invite link (or the 4-letter code).</li>
            <li>Your friend opens the link and you draft protocols together: 1-2-2-1.</li>
            <li>Tap <b>💬</b> to chat. Quick replies like "Nice move!" are one tap away.</li>
            <li>The room creator's phone runs the game, so <b>keep it open in the foreground</b>. If a phone sleeps or switches networks, the game reconnects by itself. If the page reloads, use <b>Rejoin</b> on the menu.</li>
        </ul>,
    },
    {
        title: 'Solo Deck Run',
        body: <>A solo challenge adapted from a fan variant on BoardGameGeek. Pick <b>any 3 protocols</b>. The AI gets <b>3 random</b> ones. Your deck is <b>never reshuffled</b>: the moment it runs dry and you'd need to draw, the run is over. Compile all 3 first. Drawing extra cards is now a real cost.</>,
    },
];

interface TutorialSlidesProps {
    onClose: () => void;
    finalAction?: { label: string; onClick: () => void };
}

export const TutorialSlides: React.FC<TutorialSlidesProps> = ({ onClose, finalAction }) => {
    const [index, setIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const slide = SLIDES[index];
    const isLast = index === SLIDES.length - 1;

    const go = (delta: number) => setIndex(i => Math.min(SLIDES.length - 1, Math.max(0, i + delta)));

    return (
        <div
            className="tutorial-slides"
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
                if (touchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
                touchStartX.current = null;
            }}
        >
            <div className="tutorial-progress">
                {SLIDES.map((s, i) => (
                    <button key={s.title} className={`tutorial-dot ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}`} onClick={() => setIndex(i)} aria-label={`Step ${i + 1}: ${s.title}`} />
                ))}
            </div>
            <div className="tutorial-slide" key={index}>
                <span className="tutorial-step">Step {index + 1} / {SLIDES.length}</span>
                <h2>{slide.title}</h2>
                {slide.visual && <div className="tutorial-visual">{slide.visual}</div>}
                <div className="tutorial-body">{slide.body}</div>
            </div>
            <div className="tutorial-nav">
                <button className="btn" onClick={() => (index === 0 ? onClose() : go(-1))}>{index === 0 ? 'Close' : 'Back'}</button>
                {isLast
                    ? (finalAction
                        ? <button className="btn btn-start" onClick={finalAction.onClick}>{finalAction.label}</button>
                        : <button className="btn btn-start" onClick={onClose}>Done</button>)
                    : <button className="btn btn-start" onClick={() => go(1)}>Next</button>}
            </div>
        </div>
    );
};
