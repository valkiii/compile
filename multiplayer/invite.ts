/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Invite links and codes. Secrets travel in the URL fragment (#...), which browsers never
 * send to the web server, so they don't end up in GitHub Pages' logs.
 *   invite link:  https://…/compile/#join=K7QX&invite=8F3KM2PQ
 *   owner link:   https://…/compile/#owner=<owner key>   (opened once per owner device)
 */

const CODE_CHARS = /[^A-Z0-9]/g;

export function inviteLink(room: string, invite: string): string {
    return `${window.location.origin}${window.location.pathname}#join=${room}&invite=${invite}`;
}

export const formatInviteCode = (room: string, invite: string) => `${room}-${invite}`;

/** Accepts a full invite link, "K7QX-8F3KM2PQ", or "K7QX 8F3KM2PQ". */
export function parseInvite(value: string): { room: string; invite: string } | null {
    const text = value.trim();
    const fromLink = text.match(/join=([A-Za-z0-9]{4}).*?invite=([A-Za-z0-9]{6,12})/);
    if (fromLink) return { room: fromLink[1].toUpperCase(), invite: fromLink[2].toUpperCase() };
    const compact = text.toUpperCase().replace(CODE_CHARS, '');
    if (compact.length >= 10 && compact.length <= 16) return { room: compact.slice(0, 4), invite: compact.slice(4) };
    return null;
}

/** Reads #join/#invite and #owner from the address bar, then removes them from it. */
export function takeFragmentParams(): { invite: { room: string; invite: string } | null; ownerKey: string | null } {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const room = params.get('join');
    const invite = params.get('invite');
    const ownerKey = params.get('owner');
    if (room || invite || ownerKey) {
        // Don't leave secrets in the address bar / history
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return {
        invite: room && invite ? { room: room.toUpperCase(), invite: invite.toUpperCase() } : null,
        ownerKey: ownerKey && ownerKey.length >= 24 ? ownerKey : null,
    };
}
