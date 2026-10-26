/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WebRTC servers. STUN finds each phone's public address; TURN relays the traffic when the
 * two networks can't connect directly (mobile data, strict routers). PeerJS's own free TURN
 * servers no longer exist, so we use a free Metered (metered.ca) TURN account.
 *
 * TURN credentials in a web page are necessarily public; the free quota is far more than
 * card-game traffic needs. Leave username empty to run STUN-only.
 */

const METERED_USERNAME = '';
const METERED_CREDENTIAL = '';

export function iceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
    ];
    if (METERED_USERNAME) {
        servers.push({
            urls: [
                'turn:global.relay.metered.ca:80',
                'turn:global.relay.metered.ca:80?transport=tcp',
                'turn:global.relay.metered.ca:443',
                'turns:global.relay.metered.ca:443?transport=tcp',
            ],
            username: METERED_USERNAME,
            credential: METERED_CREDENTIAL,
        });
    }
    return servers;
}
