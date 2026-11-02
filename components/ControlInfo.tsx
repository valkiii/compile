/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tap the control coin ("C"): who holds control, how it is won and what it does.
 */

import React from 'react';
import { GameState } from '../types';

interface ControlInfoProps {
    gameState: GameState;
    onClose: () => void;
}

export const ControlInfo: React.FC<ControlInfoProps> = ({ gameState, onClose }) => {
    const { controlCardHolder, player, opponent } = gameState;
    const leads = (a: number[], b: number[]) => a.filter((v, i) => v > b[i]).length;
    const youLead = leads(player.laneValues, opponent.laneValues);
    const theyLead = leads(opponent.laneValues, player.laneValues);
    const holder = controlCardHolder === 'player' ? 'You have control.'
        : controlCardHolder === 'opponent' ? 'Your opponent has control.'
        : 'Nobody has control right now (neutral).';

    return (
        <div className="modal-overlay control-info-overlay" onClick={onClose}>
            <div className="modal-content control-info-panel" role="dialog" aria-label="About control">
                <h2><span className={`control-coin small ${controlCardHolder ? `${controlCardHolder}-controlled` : 'neutral'}`}>C</span> Control</h2>
                <p className="control-info-holder">{holder}</p>
                <p className="control-info-lines">
                    Lines you lead: <b>{youLead}</b> of 3 · lines your opponent leads: <b>{theyLead}</b> of 3
                </p>
                <h3>How you get it</h3>
                <p>In the <b>control phase</b> of your turn (right after the start phase), you take control if you have a
                    higher total value than your opponent in <b>at least 2 of the 3 lines</b>. Some cards (Main 3) also make
                    a player gain or lose control.</p>
                <h3>What it does</h3>
                <p>When you <b>compile</b> or <b>refresh</b> while you have control, you may first <b>rearrange protocols</b>
                    (yours or your opponent's). Control then goes back to neutral. Cards can also check it, like
                    "If you have control, ...".</p>
                <p className="control-info-hint">tap to close</p>
            </div>
        </div>
    );
};
