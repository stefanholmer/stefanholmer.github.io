class PlayoutWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 1.0; // Adjusted for energy sum of squares
    this.cooldown = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Pass through
    if (outputChannel) {
        for (let i = 0; i < inputChannel.length; i++) {
            outputChannel[i] = inputChannel[i];
        }
    }

    // Energy-based detection
    let energy = 0;
    for (let i = 0; i < inputChannel.length; i++) {
        energy += inputChannel[i] * inputChannel[i];
    }

    if (this.cooldown > 0) {
        this.cooldown--;
    }

    if (energy > this.threshold && this.cooldown <= 0) {
        this.port.postMessage({ type: 'signature_detected', timestamp: currentTime });
        this.cooldown = 20; // Cooldown for ~50ms
    }

    return true;
  }
}

registerProcessor('playout-worklet', PlayoutWorklet);
