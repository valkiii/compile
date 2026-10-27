/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Which card sets (protocol categories) are in play. Chosen on the main menu, remembered on
 * this device, and used by the protocol draft (vs AI, solo) and as the online host's default.
 */

import { loadCustomProtocols } from '../logic/customProtocols/storage';
import { isSystemProtocol } from '../screens/CustomProtocolCreator/ProtocolList';

const KEY = 'compile_card_sets';

export const CARD_SETS = ['Main 1', 'Main 2', 'Main 3', 'Aux 1', 'Aux 2', 'Fan-Content'];
const DEFAULT_SETS = ['Main 1', 'Aux 1'];

/** A draft needs 6 different protocols (3 each). */
export const MIN_PROTOCOLS = 6;

export function getCardSets(): string[] {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (Array.isArray(stored) && stored.length > 0) return stored.filter((s: unknown) => typeof s === 'string');
    } catch {
        // ignore
    }
    return DEFAULT_SETS;
}

export function setCardSets(sets: string[]) {
    try {
        localStorage.setItem(KEY, JSON.stringify(sets));
    } catch {
        // ignore
    }
}

/** Number of official protocols in the given sets. */
export function countProtocolsInSets(sets: string[]): number {
    return loadCustomProtocols().filter(p => isSystemProtocol(p) && sets.includes(p.category || '')).length;
}
