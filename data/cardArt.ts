/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Card illustrations from the publisher's Compile press kit (public/card-art/*.webp).
 * Per-card art exists for Main 1 + Aux 1 (values 1-6); value 0 and protocols with a single
 * illustration use the protocol artwork ("<protocol>-0.webp").
 *
 * Switched off for now: the images are kept outside the repo (~/Research/compile-card-art).
 * To re-enable, copy card-art/ back into public/ and set ART_ENABLED to true.
 */

const ART_ENABLED = false;

const CARD_ART: Record<string, number[]> = {
    apathy: [0, 1, 2, 3, 4, 5, 6],
    assimilation: [0],
    darkness: [0, 1, 2, 3, 4, 5, 6],
    death: [0, 1, 2, 3, 4, 5, 6],
    diversity: [0],
    fire: [0, 1, 2, 3, 4, 5, 6],
    gravity: [0, 1, 2, 3, 4, 5, 6],
    hate: [0, 1, 2, 3, 4, 5, 6],
    life: [0, 1, 2, 3, 4, 5, 6],
    light: [0, 1, 2, 3, 4, 5, 6],
    love: [0, 1, 2, 3, 4, 5, 6],
    metal: [0, 1, 2, 3, 4, 5, 6],
    plague: [0, 1, 2, 3, 4, 5, 6],
    psychic: [0, 1, 2, 3, 4, 5, 6],
    speed: [0, 1, 2, 3, 4, 5, 6],
    spirit: [0, 1, 2, 3, 4, 5, 6],
    unity: [0],
    water: [0, 1, 2, 3, 4, 5, 6],
};

/** URL of a card's illustration, or null when the protocol has no art (Main 2 / fan protocols). */
export function cardArtUrl(protocol: string, value: number): string | null {
    const values = CARD_ART[protocol.toLowerCase()];
    if (!ART_ENABLED || !values) return null;
    const v = values.includes(value) ? value : 0;
    return `card-art/${protocol.toLowerCase()}-${v}.webp`;
}

/**
 * Wide crop of the protocol illustration for protocol picker tiles.
 * Absolute: it goes through a CSS variable, where relative URLs resolve against the stylesheet.
 */
export function protocolTileUrl(protocol: string): string | null {
    if (!ART_ENABLED || !CARD_ART[protocol.toLowerCase()]) return null;
    return new URL(`card-art/${protocol.toLowerCase()}-tile.webp`, document.baseURI).href;
}
