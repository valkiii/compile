# Compile online relay (invite-only)

Tiny WebSocket relay that pairs two players. Runs on the owner's home server behind
Tailscale Funnel. The game runs in the host's browser; the relay only forwards messages
between the two players of a room and never stores game or chat content.

Security model
- Two doors: a tailnet-only port 8796 (Tailscale Serve) where the owner creates and hosts
  rooms, and a public path on port 10000 (Tailscale Funnel) that only accepts guests joining
  with an invite. The site shows "Play a Friend Online" only when the private door is
  reachable (= the device is on the tailnet); guests arrive through invite links.
- Only the owner can open rooms (`OWNER_KEY`, kept only in `/etc/compile-relay/relay.env`,
  mode 640 root:compile-relay). Owner devices get it once via `https://…/compile/#owner=KEY`
  (URL fragment: never sent to the web server, wiped from the address bar after reading).
- Each room has a random 8-character invite key; joining needs room code + invite key.
  Failed joins are rate-limited per client (last X-Forwarded-For entry) and globally.
- One guest per room; reconnects use per-role tokens.
- Origin allow-list, 1 MB message cap, 60 msg/s flood limit, 15 s to authenticate,
  connection and room caps.
- systemd sandbox (`compile-relay.service`): dedicated system user, no privileges,
  read-only system, no /home, localhost-only networking, memory/CPU limits.
  `systemd-analyze security compile-relay` → 1.1 OK.

Install (as done on pihole1)
    sudo useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin compile-relay
    sudo install -d -m 755 /opt/compile-relay && sudo install -m 644 relay.py /opt/compile-relay/
    sudo python3 -m venv /opt/compile-relay/venv && sudo /opt/compile-relay/venv/bin/pip install websockets==15.0.1
    sudo install -d -g compile-relay -m 750 /etc/compile-relay
    echo "OWNER_KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')" | sudo tee /etc/compile-relay/relay.env
    sudo chown root:compile-relay /etc/compile-relay/relay.env && sudo chmod 640 /etc/compile-relay/relay.env
    sudo install -m 644 compile-relay.service /etc/systemd/system/ && sudo systemctl enable --now compile-relay
    sudo tailscale serve --bg --https=8796 http://127.0.0.1:8796                               # private door (tailnet only)
    sudo tailscale funnel --bg --https=10000 --set-path=/compile-relay http://127.0.0.1:8795   # public door (guests)

Turn off: `sudo tailscale funnel --https=10000 --set-path=/compile-relay off`,
`sudo tailscale serve --https=8796 off` and
`sudo systemctl disable --now compile-relay`.
Rotate the owner key: edit relay.env, `sudo systemctl restart compile-relay`, open the new owner link.
