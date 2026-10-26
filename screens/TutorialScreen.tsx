/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { TutorialSlides } from '../components/TutorialSlides';
import { markTutorialSeen } from '../utils/tutorialProgress';
import '../styles/layouts/tutorial.css';

interface TutorialScreenProps {
    onBack: () => void;
    onStartTutorialGame: () => void;
}

export function TutorialScreen({ onBack, onStartTutorialGame }: TutorialScreenProps) {
    useEffect(() => {
        markTutorialSeen();
    }, []);

    return (
        <div className="screen tutorial-screen">
            <TutorialSlides
                onClose={onBack}
                finalAction={{ label: 'Play a guided game', onClick: onStartTutorialGame }}
            />
        </div>
    );
}
