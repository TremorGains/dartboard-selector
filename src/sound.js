// Synthesized sound effects — no audio files. Every method is a silent no-op
// when muted or when the browser has no Web Audio.

export function createSound() {
  let ctx = null;
  let muted = false;

  function context() {
    if (muted) return null;
    try {
      if (!ctx) {
        const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function noise(ac, seconds) {
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  return {
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
    },
    /** Call from a click handler: browsers only allow audio after a user gesture. */
    unlock() {
      context();
    },
    whoosh(seconds = 0.7) {
      const ac = context();
      if (!ac) return;
      const t = ac.currentTime;
      const source = noise(ac, seconds);
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(350, t);
      filter.frequency.exponentialRampToValueAtTime(2800, t + seconds);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + seconds * 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      source.connect(filter).connect(gain).connect(ac.destination);
      source.start(t);
      source.stop(t + seconds);
    },
    thunk() {
      const ac = context();
      if (!ac) return;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const body = ac.createGain();
      body.gain.setValueAtTime(0.9, t);
      body.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(body).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.26);

      const click = noise(ac, 0.03);
      const lowpass = ac.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1800;
      const clickGain = ac.createGain();
      clickGain.gain.setValueAtTime(0.5, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      click.connect(lowpass).connect(clickGain).connect(ac.destination);
      click.start(t);
      click.stop(t + 0.03);
    },
  };
}
