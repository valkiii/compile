/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Remembers whether the tutorial was opened (drives the "New to Compile?" nudge on the menu).
 * localStorage can be unavailable (private mode), so every access is guarded.
 */

const TUTORIAL_SEEN_KEY = 'compile_tutorial_seen';

export const hasSeenTutorial = (): boolean => {
    try {
        return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
    } catch {
        return true;
    }
};

export const markTutorialSeen = (): void => {
    try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
    } catch {
        // ignore
    }
};
