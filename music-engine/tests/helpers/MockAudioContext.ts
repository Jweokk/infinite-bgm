/** Minimal Web Audio mock so engine lifecycle tests run under Node. */

export class MockParam {
  value = 1;
  /** Count of scheduling calls — lets tests observe duck/excite automation. */
  calls = 0;
  setValueAtTime(): void {
    this.calls++;
  }
  linearRampToValueAtTime(): void {
    this.calls++;
  }
  exponentialRampToValueAtTime(): void {
    this.calls++;
  }
  setTargetAtTime(): void {
    this.calls++;
  }
  cancelScheduledValues(): void {}
  cancelAndHoldAtTime(): void {}
}

export class MockNode {
  connections: unknown[] = [];
  connect(node: unknown): unknown {
    this.connections.push(node);
    return node;
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

function node(extra: Record<string, unknown> = {}): MockNode & Record<string, unknown> {
  return Object.assign(new MockNode(), extra) as MockNode & Record<string, unknown>;
}

export class MockAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = 'suspended';
  destination = node();

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  /** Test helper: advance the audio clock. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  createGain() {
    return node({ gain: new MockParam() });
  }
  createOscillator() {
    return node({
      frequency: new MockParam(),
      detune: new MockParam(),
      type: 'sine',
      started: false,
      start: () => {
        (this as any).started = true;
      },
      stop: () => {},
      onended: null,
    });
  }
  createBiquadFilter() {
    return node({ frequency: new MockParam(), detune: new MockParam(), Q: new MockParam(), gain: new MockParam(), type: 'lowpass' });
  }
  createStereoPanner() {
    return node({ pan: new MockParam() });
  }
  createDelay() {
    return node({ delayTime: new MockParam() });
  }
  createBufferSource() {
    return node({ buffer: null, loop: false, playbackRate: new MockParam(), start: () => {}, stop: () => {}, onended: null });
  }
  createWaveShaper() {
    return node({ curve: null, oversample: 'none' });
  }
  createDynamicsCompressor() {
    return node({
      threshold: new MockParam(),
      knee: new MockParam(),
      ratio: new MockParam(),
      attack: new MockParam(),
      release: new MockParam(),
    });
  }
  createConvolver() {
    return node({ buffer: null });
  }
  createAnalyser() {
    return node({
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.8,
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(0),
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
    });
  }
  createChannelSplitter() {
    return node();
  }
  createChannelMerger() {
    return node();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  }
}
