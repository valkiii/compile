/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/** Phone-sized viewport (portrait phones, or any very short landscape screen). */
export const COMPACT_QUERY = '(max-width: 640px), (max-height: 500px) and (pointer: coarse)';
/** Phone held sideways: the board does not fit, we ask the player to rotate. */
export const PHONE_LANDSCAPE_QUERY = '(max-height: 500px) and (orientation: landscape) and (pointer: coarse)';

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(query).matches
    );

    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}

export const useIsCompact = () => useMediaQuery(COMPACT_QUERY);
export const useIsPhoneLandscape = () => useMediaQuery(PHONE_LANDSCAPE_QUERY);
