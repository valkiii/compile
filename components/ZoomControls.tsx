/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Board zoom: − / + buttons, two-finger pinch on the board (phones) and Ctrl/⌘ + wheel
 * (computers). The value scales the card-size CSS variables of the game screen.
 */

import React, { useEffect, useRef } from 'react';

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.5;
const KEY = 'compile_board_zoom';

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function loadZoom(): number {
    try {
        const v = parseFloat(localStorage.getItem(KEY) || '1');
        return Number.isFinite(v) ? clampZoom(v) : 1;
    } catch {
        return 1;
    }
}

export function saveZoom(z: number) {
    try {
        localStorage.setItem(KEY, String(z));
    } catch {
        // ignore
    }
}

/** Pinch + Ctrl/⌘-wheel on the element matched by `selector`. */
export function useZoomGestures(zoom: number, setZoom: (z: number) => void, selector = '.game-board') {
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    useEffect(() => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return;
        let startDist = 0;
        let startZoom = 1;
        const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const onStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                startDist = dist(e.touches);
                startZoom = zoomRef.current;
            }
        };
        const onMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && startDist > 0) {
                e.preventDefault(); // zoom the board, not the page
                setZoom(clampZoom(startZoom * (dist(e.touches) / startDist)));
            }
        };
        const onEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) startDist = 0;
        };
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom(clampZoom(zoomRef.current * (e.deltaY < 0 ? 1.05 : 0.95)));
        };
        // iOS Safari's own pinch gesture would zoom the whole page
        const stopGesture = (e: Event) => e.preventDefault();
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('gesturestart', stopGesture);
        el.addEventListener('gesturechange', stopGesture);
        return () => {
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('gesturestart', stopGesture);
            el.removeEventListener('gesturechange', stopGesture);
        };
    }, [selector, setZoom]);
}

interface ZoomControlsProps {
    zoom: number;
    setZoom: (z: number) => void;
    variant: 'floating' | 'sidebar';
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, setZoom, variant }) => (
    <div className={`zoom-controls zoom-${variant}`} role="group" aria-label="Board zoom">
        <button onClick={() => setZoom(clampZoom(zoom - 0.1))} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">−</button>
        <button className="zoom-reset" onClick={() => setZoom(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoom(clampZoom(zoom + 0.1))} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">+</button>
    </div>
);
