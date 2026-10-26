/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visual identity per protocol: accent colour + background motif + symbol, chosen so
 * protocols that share a colour family still look clearly different (e.g. Death = red
 * crosshatch with a skull, Diversity = rainbow header with flower dots).
 */

export type Motif =
    | 'diag' | 'rdiag' | 'vlines' | 'hlines' | 'grid' | 'dots' | 'checker' | 'rings'
    | 'chevron' | 'waves' | 'cross' | 'rays' | 'zigzag' | 'bubbles' | 'rainbow';

export interface ProtocolStyle {
    accent: string;
    motif: Motif;
    glyph: string;
}

// ︎ asks iOS to draw symbols as text glyphs (tinted), not colour emoji
const T = '︎';

const STYLES: Record<string, ProtocolStyle> = {
    anarchy:      { accent: 'hsl(18 95% 58%)',  motif: 'zigzag',  glyph: 'Ⓐ' },
    apathy:       { accent: 'hsl(220 10% 68%)', motif: 'hlines',  glyph: '○' },
    assimilation: { accent: 'hsl(292 62% 60%)', motif: 'rings',   glyph: '◎' },
    chaos:        { accent: 'hsl(318 88% 62%)', motif: 'checker', glyph: '✺' },
    clarity:      { accent: 'hsl(192 92% 74%)', motif: 'grid',    glyph: '◇' },
    corruption:   { accent: 'hsl(268 78% 64%)', motif: 'waves',   glyph: '☣' + T },
    courage:      { accent: 'hsl(46 88% 56%)',  motif: 'chevron', glyph: '⚑' + T },
    darkness:     { accent: 'hsl(252 70% 62%)', motif: 'dots',    glyph: '☾' + T },
    death:        { accent: 'hsl(0 78% 54%)',   motif: 'cross',   glyph: '☠' + T },
    diversity:    { accent: 'hsl(165 72% 50%)', motif: 'rainbow', glyph: '✿' + T },
    fear:         { accent: 'hsl(336 72% 52%)', motif: 'chevron', glyph: '⚠' + T },
    fire:         { accent: 'hsl(24 96% 56%)',  motif: 'rays',    glyph: '▲' },
    frost:        { accent: 'hsl(202 88% 80%)', motif: 'grid',    glyph: '❄' + T },
    gravity:      { accent: 'hsl(226 78% 66%)', motif: 'rings',   glyph: '⊙' },
    hate:         { accent: 'hsl(354 85% 68%)', motif: 'diag',    glyph: '✖' + T },
    ice:          { accent: 'hsl(184 72% 76%)', motif: 'checker', glyph: '❅' + T },
    life:         { accent: 'hsl(140 72% 52%)', motif: 'dots',    glyph: '✚' + T },
    light:        { accent: 'hsl(52 96% 60%)',  motif: 'rays',    glyph: '☀' + T },
    love:         { accent: 'hsl(326 84% 76%)', motif: 'bubbles', glyph: '♥' + T },
    luck:         { accent: 'hsl(70 85% 52%)',  motif: 'checker', glyph: '♣' + T },
    metal:        { accent: 'hsl(210 16% 72%)', motif: 'grid',    glyph: '⚙' + T },
    mirror:       { accent: 'hsl(240 14% 86%)', motif: 'vlines',  glyph: '◐' },
    peace:        { accent: 'hsl(178 58% 70%)', motif: 'waves',   glyph: '☮' + T },
    plague:       { accent: 'hsl(86 68% 48%)',  motif: 'bubbles', glyph: '☣' + T },
    psychic:      { accent: 'hsl(282 64% 74%)', motif: 'rings',   glyph: '◉' },
    smoke:        { accent: 'hsl(0 0% 62%)',    motif: 'waves',   glyph: '≋' },
    speed:        { accent: 'hsl(180 88% 50%)', motif: 'chevron', glyph: '»' },
    spirit:       { accent: 'hsl(158 66% 62%)', motif: 'rdiag',   glyph: '✧' },
    time:         { accent: 'hsl(30 64% 48%)',  motif: 'rings',   glyph: '⌛' + T },
    unity:        { accent: 'hsl(122 56% 46%)', motif: 'cross',   glyph: '◈' },
    war:          { accent: 'hsl(8 84% 46%)',   motif: 'checker', glyph: '✠' },
    water:        { accent: 'hsl(206 82% 60%)', motif: 'waves',   glyph: '≈' },
};

export function protocolStyle(protocol: string): ProtocolStyle | null {
    return STYLES[protocol.toLowerCase()] ?? null;
}
