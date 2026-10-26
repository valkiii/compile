/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { isMuted, onMuteChange, setMuted, unlockAudio } from '../utils/sound';

export const SoundToggle: React.FC<{ className?: string; withLabel?: boolean }> = ({ className = 'hud-btn', withLabel = false }) => {
    const [muted, setMutedState] = useState(isMuted());
    useEffect(() => onMuteChange(setMutedState), []);
    return (
        <button
            className={className}
            onClick={() => {
                unlockAudio();
                setMuted(!muted);
            }}
            aria-label={muted ? 'Sound off (tap to turn on)' : 'Sound on (tap to mute)'}
            title={muted ? 'Sound off' : 'Sound on'}
        >
            {muted ? '🔇' : '🔊'}{withLabel ? (muted ? ' Sound off' : ' Sound on') : ''}
        </button>
    );
};
