/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Card illustrations from the publisher's Compile press kit (public/card-art/*.webp).
 * Per-card art exists for Main 1 + Aux 1 (values 1-6); value 0 and protocols with a single
 * illustration use the protocol artwork ("<protocol>-0.webp").
 *
 * The images are NOT part of the public site: they live on the owner's relay server and are
 * only handed out to the two players of a live online room (room code + player token).
 * Outside online games cards show no art.
 */

interface ArtSource {
    base: string;   // relay HTTP base for this player's door
    room: string;
    token: string;
}

let source: ArtSource | null = null;

/** Set while in an online room; null everywhere else. */
export function setCardArtSource(next: ArtSource | null) {
    source = next;
}

const artUrl = (file: string) =>
    source ? `${source.base}/art/${file}?room=${encodeURIComponent(source.room)}&token=${encodeURIComponent(source.token)}` : null;

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
    // Main 3: one protocol illustration per protocol (from the publisher's toolkit)
    ambush: [0], envy: [0], fulcrum: [0], gluttony: [0], greed: [0], lust: [0],
    momentum: [0], nova: [0], overwhelm: [0], pride: [0], sloth: [0], wrath: [0],
};

/** URL of a card's illustration, or null when the protocol has no art (Main 2 / Aux 2 / fan protocols). */
export function cardArtUrl(protocol: string, value: number): string | null {
    const values = CARD_ART[protocol.toLowerCase()];
    if (!source || !values) return null;
    const v = values.includes(value) ? value : 0;
    return artUrl(`${protocol.toLowerCase()}-${v}.webp`);
}

/**
 * Wide crop of the protocol illustration for protocol picker tiles (absolute URL: it goes
 * through a CSS variable, where relative URLs would resolve against the stylesheet).
 */
export function protocolTileUrl(protocol: string): string | null {
    if (!source || !CARD_ART[protocol.toLowerCase()]) return null;
    return artUrl(`${protocol.toLowerCase()}-tile.webp`);
}
