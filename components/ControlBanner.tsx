/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Big "CONTROL ACTION" banner whenever control is used (rearrange/swap when compiling or
 * refreshing), gained or lost. Driven by the game log, so it works for the AI and online too.
 */

import React, { useEffect, useRef, useState } from 'react';
import { LogEntry } from '../types';

interface Banner {
    id: number;
    title: string;
    detail: string;
    side: 'player' | 'opponent' | 'neutral';
}

function bannerFor(message: string): Omit<Banner, 'id'> | null {
    const side = (m: string): Banner['side'] => (/^Player\b/.test(m) ? 'player' : /^Opponent\b/.test(m) ? 'opponent' : 'neutral');
    let m: RegExpMatchArray | null;
    if ((m = message.match(/^(Player|Opponent) has Control and may rearrange protocols before (compiling|refreshing)/))) {
        return { title: 'CONTROL ACTION', detail: `${m[1]} uses control before ${m[2]}`, side: side(m[1]) };
    }
    if ((m = message.match(/^Control(?: Action)?: (.+)$/))) {
        return { title: 'CONTROL ACTION', detail: m[1].replace(/\.$/, ''), side: side(m[1]) };
    }
    if ((m = message.match(/^(Player|Opponent) gains (?:the Control Component|control)\./))) {
        return { title: 'CONTROL GAINED', detail: `${m[1]} has control`, side: side(m[1]) };
    }
    if ((m = message.match(/^(Player|Opponent) loses control\./))) {
        return { title: 'CONTROL LOST', detail: `${m[1]} no longer has control`, side: side(m[1]) };
    }
    return null;
}

export const ControlBanner: React.FC<{ log: LogEntry[] }> = ({ log }) => {
    const [banner, setBanner] = useState<Banner | null>(null);
    const seen = useRef(log.length);
    useEffect(() => {
        if (log.length < seen.current) seen.current = 0; // new game
        const fresh = log.slice(seen.current);
        seen.current = log.length;
        for (const entry of fresh) {
            const b = bannerFor(entry.message);
            if (b) setBanner({ ...b, id: Date.now() + Math.random() });
        }
    }, [log.length]);

    useEffect(() => {
        if (!banner) return;
        const t = setTimeout(() => setBanner(null), 2200);
        return () => clearTimeout(t);
    }, [banner?.id]);

    if (!banner) return null;
    return (
        <div key={banner.id} className={`control-banner control-banner-${banner.side}`} aria-live="polite">
            <span className="control-banner-coin">C</span>
            <span className="control-banner-title">{banner.title}</span>
            <span className="control-banner-detail">{banner.detail}</span>
        </div>
    );
};
