// The headset's line to the Mac relay (server/relay.mjs), over the dev server's
// own origin so a Quest on Wi-Fi needs one trusted certificate, not two.
//
// Messages are small JSON objects with a `type`. The link reconnects on its own
// and never queues: a stale joint target is worse than a dropped one.

export class Link {
  constructor(role) {
    this.role = role;
    this.handlers = new Map();
    this.status = "offline";
    this.ws = null;
    this.retry = 0;
    this.connect();
  }
  get url() {
    const u = new URL("/relay", location.href);
    u.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return u.href;
  }
  connect() {
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this.later();
    }
    this.ws = ws;
    this.setStatus("connecting");
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("online");
      this.send({ type: "hello", role: this.role, ua: navigator.userAgent });
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      for (const fn of this.handlers.get(msg.type) ?? []) fn(msg);
      for (const fn of this.handlers.get("*") ?? []) fn(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.setStatus("offline");
      this.later();
    };
    ws.onerror = () => ws.close();
  }
  later() {
    // A relay that is not running is the normal case, not an error: back off quietly.
    const delay = Math.min(10000, 1000 * 2 ** this.retry++);
    setTimeout(() => this.connect(), delay);
  }
  setStatus(s) {
    this.status = s;
    for (const fn of this.handlers.get("status:link") ?? []) fn(s);
  }
  on(type, fn) {
    (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)).push(fn);
    return this;
  }
  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    // Drop rather than buffer when the socket is backed up (slow Wi-Fi).
    if (this.ws.bufferedAmount > 64 * 1024 && msg.type === "state") return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }
}
