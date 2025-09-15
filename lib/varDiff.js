// Robust VarDiff for Ergo Stratum (EMA-based, bounded steps, hysteresis)
// Drop-in replacement for lib/varDiff.js
// Emits 'newDifficulty' when retarget triggers
// Difficulty <-> target conversion aligned with Ergo boundary (2^256-1)/diff

const events = require('events');
const BigNumber = require('bignumber.js');

const Q = new BigNumber('115792089237316195423570985008687907852837564279074904382605163141518161494337'); // 2^256-1

function nowSec() { return Date.now() / 1000; }

class RingBuffer {
  constructor(maxSize) {
    this.maxSize = Math.max(1, maxSize|0);
    this.data = new Array(this.maxSize);
    this.size = 0;
    this.cursor = 0;
  }
  push(v) {
    this.data[this.cursor] = v;
    this.cursor = (this.cursor + 1) % this.maxSize;
    if (this.size < this.maxSize) this.size++;
  }
  clear() {
    this.size = 0;
    this.cursor = 0;
  }
}

function toFixed(x, digits=8) {
  return Number.parseFloat(Number(x).toFixed(digits));
}

function difficultyToTarget(diff) {
  if (!diff || diff <= 0) diff = 1;
  const d = new BigNumber(diff);
  return Q.dividedToIntegerBy(d);
}

function targetToDifficulty(target) {
  const t = BigNumber.max(new BigNumber(target), 1);
  return Q.dividedBy(t).toNumber();
}

class VarDiff extends events.EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = Object.assign({
      targetTime: 12.0,
      minDiff: 1.0,
      maxDiff: 4000000.0,
      startDiff: 64.0,
      retargetShares: 30,
      retargetInterval: 90.0,
      emaHalflife: 60.0,
      maxStepUp: 1.6,
      maxStepDown: 0.6,
      hysteresis: 0.02
    }, opts);

    this.opts.startDiff = Math.min(this.opts.maxDiff, Math.max(this.opts.minDiff, this.opts.startDiff));
    this.alpha = 1 - Math.exp(-Math.log(2) / Math.max(1e-9, this.opts.emaHalflife));
    this.clients = new Map();
  }

  _key(client) {
    return client && (client._id || client.id || client.workerName || client.remoteAddress || client.toString());
  }

  _state(client) {
    const k = this._key(client);
    let s = this.clients.get(k);
    if (!s) {
      s = {
        diff: this.opts.startDiff,
        lastShareTs: null,
        emaDt: null,
        sharesSinceRetarget: 0,
        lastRetargetTs: nowSec()
      };
      this.clients.set(k, s);
    }
    return s;
  }

  setInitialDifficulty(client, diff) {
    const s = this._state(client);
    if (Number.isFinite(diff)) s.diff = Math.min(this.opts.maxDiff, Math.max(this.opts.minDiff, diff));
  }

  manageClient(client) {
    if (!client || typeof client.on !== 'function') {
      return;
    }
    const shareHandler = () => {
      try {
        this.onShare(client);
      } catch (err) {
        this.emit('error', err);
      }
    };
    const diffHandler = (newDiff) => {
      if (Number.isFinite(newDiff)) {
        this.setInitialDifficulty(client, newDiff);
      }
    };
    const disconnectHandler = () => {
      client.removeListener('submit', shareHandler);
      client.removeListener('difficultyChanged', diffHandler);
      client.removeListener('socketDisconnect', disconnectHandler);
      this.clients.delete(this._key(client));
    };
    client.on('submit', shareHandler);
    client.on('difficultyChanged', diffHandler);
    client.on('socketDisconnect', disconnectHandler);
  }

  onShare(client, tsSec) {
    const s = this._state(client);
    const ts = Number.isFinite(tsSec) ? tsSec : nowSec();

    if (s.lastShareTs != null) {
      const dt = Math.max(0.001, ts - s.lastShareTs);
      if (s.emaDt == null) s.emaDt = dt;
      else s.emaDt = (1 - this.alpha) * s.emaDt + this.alpha * dt;
    }
    s.lastShareTs = ts;
    s.sharesSinceRetarget += 1;

    this._maybeRetarget(client, s, ts);
  }

  _maybeRetarget(client, s, ts) {
    if (s.sharesSinceRetarget < this.opts.retargetShares) return;
    if ((ts - s.lastRetargetTs) < this.opts.retargetInterval) return;
    if (s.emaDt == null) return;

    const factor = s.emaDt / this.opts.targetTime;
    let proposed = s.diff / Math.max(0.2, Math.min(5.0, factor));

    const up = s.diff * this.opts.maxStepUp;
    const down = s.diff * this.opts.maxStepDown;
    proposed = Math.min(up, Math.max(down, proposed));

    proposed = Math.min(this.opts.maxDiff, Math.max(this.opts.minDiff, proposed));

    const changed = Math.abs(proposed - s.diff) / Math.max(s.diff, 1e-9) > this.opts.hysteresis;

    s.lastRetargetTs = ts;
    s.sharesSinceRetarget = 0;

    if (changed) {
      s.diff = toFixed(proposed, 8);
      this.emit('newDifficulty', client, s.diff);
    }
  }

  static difficultyToTarget = difficultyToTarget;
  static targetToDifficulty = targetToDifficulty;
}

module.exports = VarDiff;
