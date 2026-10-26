#!/usr/bin/env python3
"""
Compile online relay (invite-only), meant to run on a home server behind Tailscale Funnel.

Pairs two browsers in a room and forwards messages between them. The game itself runs in
the host's browser; this server only knows rooms, roles and tokens.

Access control:
  - Two listeners: the PUBLIC port (exposed with Tailscale Funnel) only lets guests join/rejoin;
    the PRIVATE port (Tailscale Serve, tailnet-only) is the only place rooms can be created.
  - Creating a room also needs OWNER_KEY (set in the environment).
  - Every room has its own random invite key; joining needs room code + invite key
    (both are in the invite link). Failed joins are rate-limited per client address.
  - Reconnecting uses per-role tokens handed out on create/join.
  - Only the game's own origin(s) may connect.

Protocol (JSON text frames):
  -> {"t":"create","ownerKey":"..."}                <- {"t":"created","room","invite","role":"host","token"}
  -> {"t":"join","room":"K7QX","invite":"8F3K2M"}   <- {"t":"joined","room","role":"guest","token"}
  -> {"t":"rejoin","room","role","token"}           <- {"t":"rejoined",...}
  -> {"t":"msg","data":{...}}                        (forwarded to the other side as {"t":"msg","data":...})
  -> {"t":"leave"}                                   (room closed, other side told)
  <- {"t":"peer","connected":bool,"left"?:true}
  <- {"t":"error","code":"not_allowed|no_room|bad_invite|taken|rate_limited|full|rejoin_failed"}
"""

import asyncio
import json
import logging
import os
import secrets
import time
from collections import defaultdict, deque

import re
from urllib.parse import parse_qs, urlsplit

import websockets
from websockets.datastructures import Headers
from websockets.http11 import Response

HOST = os.environ.get("RELAY_HOST", "127.0.0.1")
PORT = int(os.environ.get("RELAY_PORT", "8795"))                  # public (Funnel): join only
PRIVATE_PORT = int(os.environ.get("RELAY_PRIVATE_PORT", "8796"))  # tailnet only: may create rooms
OWNER_KEY = os.environ.get("OWNER_KEY", "")
STATE_FILE = os.environ.get("RELAY_STATE", "")
ART_DIR = os.environ.get("RELAY_ART_DIR", "")   # card art, served only to players of a live room
ART_NAME = re.compile(r"/art/([a-z]+-(?:[0-6]|tile)\.webp)$")
ALLOWED_ORIGINS = {
    o.strip() for o in os.environ.get(
        "RELAY_ORIGINS",
        "https://valkiii.github.io,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",") if o.strip()
}
MAX_ROOMS = 20
MAX_CONNECTIONS = 40
MAX_MESSAGE = 1024 * 1024            # full game snapshots are well below this
MSG_RATE = 60                        # messages per second per connection (bursts of animations)
HELLO_TIMEOUT = 15                   # seconds to create/join/rejoin before being dropped
ROOM_IDLE_SECONDS = 12 * 3600        # rooms survive phone sleeps / reloads for hours
INVITE_LENGTH = 8                    # 31^8 ~ 8.5e11 combinations, with the limits below
FAILED_JOIN_LIMIT = 8                # per client address ...
FAILED_GLOBAL_LIMIT = 40             # ... and for everyone together (addresses can be faked)
FAILED_JOIN_WINDOW = 600             # ... per 10 minutes
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L

log = logging.getLogger("relay")


def random_code(n):
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


class Room:
    def __init__(self, code, invite, tokens=None, touched=None):
        self.code = code
        self.invite = invite
        self.tokens = tokens or {"host": secrets.token_urlsafe(16), "guest": None}
        self.sockets = {"host": None, "guest": None}
        self.touched = touched or time.time()

    def to_json(self):
        return {"code": self.code, "invite": self.invite, "tokens": self.tokens, "touched": self.touched}


rooms: dict[str, Room] = {}
failed_joins: dict[str, deque] = defaultdict(deque)
failed_global: deque = deque()
connections = 0


def save_state():
    """Rooms survive a relay restart, so running games can reconnect."""
    if not STATE_FILE:
        return
    try:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump([r.to_json() for r in rooms.values()], f)
        os.replace(tmp, STATE_FILE)
    except OSError as e:
        log.warning("could not save state: %s", e)


def load_state():
    if not STATE_FILE or not os.path.exists(STATE_FILE):
        return
    try:
        with open(STATE_FILE) as f:
            for r in json.load(f):
                if time.time() - r["touched"] < ROOM_IDLE_SECONDS:
                    rooms[r["code"]] = Room(r["code"], r["invite"], r["tokens"], r["touched"])
        log.info("restored %d rooms", len(rooms))
    except (OSError, ValueError, KeyError) as e:
        log.warning("could not load state: %s", e)


def other(role):
    return "guest" if role == "host" else "host"


def client_address(ws, request=None):
    # Behind Tailscale Funnel the proxy appends the real client address: trust the LAST entry
    # (earlier entries can be forged by the client)
    forwarded = (request or ws.request).headers.get("X-Forwarded-For", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    return parts[-1] if parts else (ws.remote_address or ("?",))[0]


def _trim(q, now):
    while q and now - q[0] > FAILED_JOIN_WINDOW:
        q.popleft()


def rate_limited(addr):
    now = time.time()
    _trim(failed_joins[addr], now)
    _trim(failed_global, now)
    return len(failed_joins[addr]) >= FAILED_JOIN_LIMIT or len(failed_global) >= FAILED_GLOBAL_LIMIT


def record_failure(addr):
    now = time.time()
    failed_joins[addr].append(now)
    failed_global.append(now)


async def send(ws, obj):
    if ws is None:
        return
    try:
        await ws.send(json.dumps(obj, separators=(",", ":")))
    except websockets.ConnectionClosed:
        pass


async def attach(room, role, ws):
    """Bind ws to a room role, replacing a stale connection (phone reconnects)."""
    old = room.sockets[role]
    room.sockets[role] = ws
    room.touched = time.time()
    if old is not None and old is not ws:
        await old.close(code=4000, reason="replaced")
    peer = room.sockets[other(role)]
    await send(ws, {"t": "peer", "connected": peer is not None})
    await send(peer, {"t": "peer", "connected": True})


async def drop_if_silent(ws, state):
    await asyncio.sleep(HELLO_TIMEOUT)
    if state["room"] is None:
        await ws.close(code=4008, reason="timeout")


def _http(status, reason, body=b"", content_type="text/plain", cache="no-store"):
    headers = Headers([
        ("Content-Type", content_type),
        ("Content-Length", str(len(body))),
        ("Cache-Control", cache),
        ("X-Content-Type-Options", "nosniff"),
        ("Cross-Origin-Resource-Policy", "cross-origin"),
    ])
    return Response(status, reason, headers, body)


def serve_art(connection, request):
    """GET .../art/<protocol>-<value>.webp?room=…&token=… for the two players of a live room.
    Anything that isn't an art request continues as a normal WebSocket handshake."""
    url = urlsplit(request.path)
    m = ART_NAME.search(url.path)
    if not m:
        return None
    addr = client_address(connection, request)
    if not ART_DIR or rate_limited(addr):
        return _http(404, "Not Found")
    q = parse_qs(url.query)
    room = rooms.get((q.get("room") or [""])[0].upper())
    token = (q.get("token") or [""])[0].encode()
    if room is None or not any(t and secrets.compare_digest(token, t.encode()) for t in room.tokens.values()):
        record_failure(addr)
        return _http(403, "Forbidden")
    path = os.path.join(ART_DIR, m.group(1))  # name is whitelisted by the regex: no path tricks
    try:
        with open(path, "rb") as f:
            body = f.read()
    except OSError:
        return _http(404, "Not Found")
    return _http(200, "OK", body, "image/webp", "private, max-age=86400")


async def public_handler(ws):
    await handler(ws, private=False)


async def private_handler(ws):
    await handler(ws, private=True)


async def handler(ws, private):
    global connections
    origin = ws.request.headers.get("Origin", "")
    if ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
        await ws.close(code=4003, reason="origin")
        return
    if connections >= MAX_CONNECTIONS:
        await ws.close(code=4009, reason="busy")
        return

    connections += 1
    addr = client_address(ws)
    room, role = None, None
    state = {"room": None}
    watchdog = asyncio.create_task(drop_if_silent(ws, state))
    window_start, window_count = time.time(), 0
    try:
        async for raw in ws:
            # Flood protection
            now = time.time()
            if now - window_start >= 1:
                window_start, window_count = now, 0
            window_count += 1
            if window_count > MSG_RATE:
                await ws.close(code=4029, reason="rate")
                break
            if not isinstance(raw, str):
                continue
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if not isinstance(msg, dict):
                continue
            t = msg.get("t")

            if t == "ping":
                await send(ws, {"t": "pong"})
                continue

            if t == "msg" and room is not None:
                room.touched = time.time()
                await send(room.sockets[other(role)], {"t": "msg", "data": msg.get("data")})
                continue

            if t == "create":
                if not private:
                    # Rooms can only be opened from the owner's tailnet
                    record_failure(addr)
                    await send(ws, {"t": "error", "code": "not_allowed"})
                    continue
                if rate_limited(addr):
                    await send(ws, {"t": "error", "code": "rate_limited"})
                    continue
                if not OWNER_KEY or not secrets.compare_digest(str(msg.get("ownerKey", "")).encode(), OWNER_KEY.encode()):
                    record_failure(addr)
                    await send(ws, {"t": "error", "code": "not_allowed"})
                    continue
                if len(rooms) >= MAX_ROOMS:
                    await send(ws, {"t": "error", "code": "full"})
                    continue
                code = random_code(4)
                while code in rooms:
                    code = random_code(4)
                room, role = Room(code, random_code(INVITE_LENGTH)), "host"
                rooms[code] = room
                save_state()
                await send(ws, {"t": "created", "room": code, "invite": room.invite, "role": role, "token": room.tokens[role]})
                await attach(room, role, ws)
                log.info("room %s created", code)

            elif t == "join":
                if rate_limited(addr):
                    await send(ws, {"t": "error", "code": "rate_limited"})
                    continue
                code = str(msg.get("room", "")).upper().strip()
                target = rooms.get(code)
                invite_ok = target is not None and secrets.compare_digest(
                    str(msg.get("invite", "")).upper().strip().encode(), target.invite.encode())
                if not invite_ok:
                    record_failure(addr)
                    await send(ws, {"t": "error", "code": "bad_invite" if target else "no_room"})
                    continue
                if target.tokens["guest"] is not None:
                    await send(ws, {"t": "error", "code": "taken"})
                    continue
                room, role = target, "guest"
                room.tokens["guest"] = secrets.token_urlsafe(16)
                save_state()
                await send(ws, {"t": "joined", "room": code, "role": role, "token": room.tokens[role]})
                await attach(room, role, ws)
                log.info("room %s joined", code)

            elif t == "rejoin":
                code = str(msg.get("room", "")).upper().strip()
                want = msg.get("role")
                target = rooms.get(code)
                if rate_limited(addr):
                    await send(ws, {"t": "error", "code": "rate_limited"})
                    continue
                if target is None or want not in ("host", "guest") or not target.tokens.get(want) \
                        or not secrets.compare_digest(str(msg.get("token", "")).encode(), target.tokens[want].encode()):
                    record_failure(addr)
                    await send(ws, {"t": "error", "code": "rejoin_failed"})
                    continue
                if want == "host" and not private:
                    # The host only ever talks to the private (tailnet) listener
                    record_failure(addr)
                    await send(ws, {"t": "error", "code": "rejoin_failed"})
                    continue
                room, role = target, want
                reply = {"t": "rejoined", "room": code, "role": role, "token": room.tokens[role]}
                if role == "host":
                    reply["invite"] = room.invite
                await send(ws, reply)
                await attach(room, role, ws)

            elif t == "leave" and room is not None:
                await send(room.sockets[other(role)], {"t": "peer", "connected": False, "left": True})
                rooms.pop(room.code, None)
                save_state()
                log.info("room %s closed", room.code)
                room = None
            state["room"] = room
    except websockets.ConnectionClosed:
        pass  # phone vanished without a goodbye (sleep, network switch): normal
    finally:
        connections -= 1
        watchdog.cancel()
        if room is not None and room.sockets.get(role) is ws:
            room.sockets[role] = None
            room.touched = time.time()
            await send(room.sockets[other(role)], {"t": "peer", "connected": False})


async def reaper():
    while True:
        await asyncio.sleep(300)
        now = time.time()
        expired = [c for c, r in rooms.items()
                   if r.sockets["host"] is None and r.sockets["guest"] is None and now - r.touched > ROOM_IDLE_SECONDS]
        for code in expired:
            rooms.pop(code, None)
            log.info("room %s expired", code)
        if expired:
            save_state()
        _trim(failed_global, now)
        for addr in [a for a, q in failed_joins.items() if not q or now - q[-1] > FAILED_JOIN_WINDOW]:
            failed_joins.pop(addr, None)


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    if not OWNER_KEY:
        log.warning("OWNER_KEY is not set: nobody can create rooms")
    load_state()
    asyncio.create_task(reaper())
    opts = dict(max_size=MAX_MESSAGE, ping_interval=20, ping_timeout=40, process_request=serve_art)
    async with websockets.serve(public_handler, HOST, PORT, **opts), \
            websockets.serve(private_handler, HOST, PRIVATE_PORT, **opts):
        log.info("relay listening on %s:%d (public, join only) and %s:%d (tailnet, create)", HOST, PORT, HOST, PRIVATE_PORT)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
