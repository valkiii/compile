/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Protocol name -> colour, for cards that don't carry their protocol's colour
 * (cards dealt into a game are built without it).
 */

import { loadCustomProtocols } from '../logic/customProtocols/storage';

const builtIn: Record<string, string> = {};
const files = import.meta.glob<{ name: string; color?: string }>('../custom_protocols/*.json', { eager: true, import: 'default' });
for (const def of Object.values(files)) {
    if (def?.name && def.color) builtIn[def.name.toLowerCase()] = def.color;
}

let userColors: Record<string, string> | null = null;

export function protocolColor(protocol: string): string | undefined {
    const key = protocol.toLowerCase();
    if (builtIn[key]) return builtIn[key];
    if (!userColors) {
        userColors = {};
        for (const p of loadCustomProtocols()) {
            if (p.color) userColors[p.name.toLowerCase()] = p.color;
        }
    }
    return userColors[key];
}
