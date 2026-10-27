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
    /** Second colour: pattern, header blend and inner ring (contrasts with accent) */
    accent2: string;
    motif: Motif;
    glyph: string;
}

// ︎ asks iOS to draw symbols as text glyphs (tinted), not colour emoji
const T = '︎';

const STYLES: Record<string, ProtocolStyle> = {
    anarchy:      { accent: 'hsl(18 95% 58%)',  accent2: 'hsl(50 95% 60%)', motif: 'zigzag',  glyph: 'Ⓐ' },
    apathy:       { accent: 'hsl(220 10% 68%)', accent2: 'hsl(200 22% 48%)', motif: 'hlines',  glyph: '○' },
    assimilation: { accent: 'hsl(292 62% 60%)', accent2: 'hsl(150 62% 55%)', motif: 'rings',   glyph: '◎' },
    chaos:        { accent: 'hsl(318 88% 62%)', accent2: 'hsl(55 95% 60%)', motif: 'checker', glyph: '✺' },
    clarity:      { accent: 'hsl(192 92% 74%)', accent2: 'hsl(0 0% 97%)', motif: 'grid',    glyph: '◇' },
    corruption:   { accent: 'hsl(268 78% 64%)', accent2: 'hsl(95 72% 48%)', motif: 'waves',   glyph: '☣' + T },
    courage:      { accent: 'hsl(46 88% 56%)',  accent2: 'hsl(0 72% 52%)', motif: 'chevron', glyph: '⚑' + T },
    darkness:     { accent: 'hsl(252 70% 62%)', accent2: 'hsl(205 85% 55%)', motif: 'dots',    glyph: '☾' + T },
    death:        { accent: 'hsl(0 78% 54%)',   accent2: 'hsl(40 25% 88%)', motif: 'cross',   glyph: '☠' + T },
    diversity:    { accent: 'hsl(165 72% 50%)', accent2: 'hsl(45 95% 58%)', motif: 'rainbow', glyph: '✿' + T },
    fear:         { accent: 'hsl(336 72% 52%)', accent2: 'hsl(40 92% 60%)', motif: 'chevron', glyph: '⚠' + T },
    fire:         { accent: 'hsl(24 96% 56%)',  accent2: 'hsl(50 100% 60%)', motif: 'rays',    glyph: '▲' },
    frost:        { accent: 'hsl(202 88% 80%)', accent2: 'hsl(0 0% 98%)', motif: 'grid',    glyph: '❄' + T },
    gravity:      { accent: 'hsl(226 78% 66%)', accent2: 'hsl(276 62% 64%)', motif: 'rings',   glyph: '⊙' },
    hate:         { accent: 'hsl(354 85% 68%)', accent2: 'hsl(330 82% 48%)', motif: 'diag',    glyph: '✖' + T },
    ice:          { accent: 'hsl(184 72% 76%)', accent2: 'hsl(212 82% 58%)', motif: 'checker', glyph: '❅' + T },
    life:         { accent: 'hsl(140 72% 52%)', accent2: 'hsl(55 92% 60%)', motif: 'dots',    glyph: '✚' + T },
    light:        { accent: 'hsl(52 96% 60%)',  accent2: 'hsl(0 0% 98%)', motif: 'rays',    glyph: '☀' + T },
    love:         { accent: 'hsl(326 84% 76%)', accent2: 'hsl(0 85% 60%)', motif: 'bubbles', glyph: '♥' + T },
    luck:         { accent: 'hsl(70 85% 52%)',  accent2: 'hsl(142 62% 42%)', motif: 'checker', glyph: '♣' + T },
    metal:        { accent: 'hsl(210 16% 72%)', accent2: 'hsl(28 62% 52%)', motif: 'grid',    glyph: '⚙' + T },
    mirror:       { accent: 'hsl(240 14% 86%)', accent2: 'hsl(198 64% 60%)', motif: 'vlines',  glyph: '◐' },
    peace:        { accent: 'hsl(178 58% 70%)', accent2: 'hsl(0 0% 97%)', motif: 'waves',   glyph: '☮' + T },
    plague:       { accent: 'hsl(86 68% 48%)',  accent2: 'hsl(282 52% 56%)', motif: 'bubbles', glyph: '☣' + T },
    psychic:      { accent: 'hsl(282 64% 74%)', accent2: 'hsl(320 72% 62%)', motif: 'rings',   glyph: '◉' },
    smoke:        { accent: 'hsl(0 0% 62%)',    accent2: 'hsl(30 24% 46%)', motif: 'waves',   glyph: '≋' },
    speed:        { accent: 'hsl(180 88% 50%)', accent2: 'hsl(60 100% 60%)', motif: 'chevron', glyph: '»' },
    spirit:       { accent: 'hsl(158 66% 62%)', accent2: 'hsl(250 64% 72%)', motif: 'rdiag',   glyph: '✧' },
    time:         { accent: 'hsl(30 64% 48%)',  accent2: 'hsl(45 92% 56%)', motif: 'rings',   glyph: '⌛' + T },
    unity:        { accent: 'hsl(122 56% 46%)', accent2: 'hsl(200 82% 56%)', motif: 'cross',   glyph: '◈' },
    war:          { accent: 'hsl(8 84% 46%)',   accent2: 'hsl(45 42% 58%)', motif: 'checker', glyph: '✠' },
    water:        { accent: 'hsl(206 82% 60%)', accent2: 'hsl(188 82% 86%)', motif: 'waves',   glyph: '≈' },
    // Main 3
    envy:         { accent: 'hsl(170 70% 46%)', accent2: 'hsl(205 85% 58%)', motif: 'rings',   glyph: '◆' },
    gluttony:     { accent: 'hsl(42 88% 52%)',  accent2: 'hsl(20 80% 50%)', motif: 'bubbles', glyph: '☾' + T },
    greed:        { accent: 'hsl(285 62% 58%)', accent2: 'hsl(165 60% 50%)', motif: 'grid',    glyph: '♛' + T },
    lust:         { accent: 'hsl(356 78% 54%)', accent2: 'hsl(330 85% 70%)', motif: 'waves',   glyph: '❦' + T },
    pride:        { accent: 'hsl(40 92% 58%)',  accent2: 'hsl(0 0% 98%)', motif: 'rays',    glyph: '♔' + T },
    sloth:        { accent: 'hsl(215 8% 60%)',  accent2: 'hsl(12 70% 55%)', motif: 'hlines',  glyph: '◒' },
    wrath:        { accent: 'hsl(356 80% 46%)', accent2: 'hsl(190 70% 55%)', motif: 'zigzag',  glyph: 'ϟ' },
    ambush:       { accent: 'hsl(138 35% 50%)', accent2: 'hsl(48 70% 60%)', motif: 'checker', glyph: '◘' },
    fulcrum:      { accent: 'hsl(208 40% 58%)', accent2: 'hsl(0 0% 95%)', motif: 'diag',    glyph: '⚖' + T },
    overwhelm:    { accent: 'hsl(252 38% 68%)', accent2: 'hsl(320 60% 72%)', motif: 'grid',    glyph: '▦' },
    momentum:     { accent: 'hsl(24 88% 56%)',  accent2: 'hsl(300 45% 72%)', motif: 'chevron', glyph: '➤' + T },
    nova:         { accent: 'hsl(34 100% 56%)', accent2: 'hsl(8 85% 52%)', motif: 'rays',    glyph: '✹' },
};

export function protocolStyle(protocol: string): ProtocolStyle | null {
    return STYLES[protocol.toLowerCase()] ?? null;
}
