/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asks before a move is carried out, to catch mis-taps. Can be switched off ("Don't ask
 * again", or the menu checkbox) and back on.
 */

import React from 'react';
import { haptic } from '../utils/haptics';

const KEY = 'compile_confirm_moves';
let enabled = (() => {
    try {
        return localStorage.getItem(KEY) !== '0';
    } catch {
        return true;
    }
})();

export const confirmMovesEnabled = () => enabled;

export function setConfirmMoves(value: boolean) {
    enabled = value;
    try {
        localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
        // ignore
    }
}

export interface PendingMove {
    text: string;
    run: () => void;
}

interface ConfirmMoveProps {
    move: PendingMove;
    onDone: () => void;
}

export const ConfirmMove: React.FC<ConfirmMoveProps> = ({ move, onDone }) => (
    <div className="confirm-move" role="dialog" aria-label="Confirm move">
        <div className="confirm-move-text">{move.text}</div>
        <div className="confirm-move-actions">
            <button className="btn confirm-yes" onClick={() => { haptic(/compile/i.test(move.text) ? 'strong' : 'tap'); onDone(); move.run(); }}>✓ Confirm</button>
            <button className="btn confirm-no" onClick={onDone}>Cancel</button>
        </div>
        <button
            className="confirm-move-off"
            onClick={() => { setConfirmMoves(false); onDone(); move.run(); }}
        >
            Confirm and don&apos;t ask again
        </button>
    </div>
);
