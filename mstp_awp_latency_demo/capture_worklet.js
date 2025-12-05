class CaptureWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outputBuffer = [];
    this.glitchCount = 0;
    this.mode = 'aw'; // Default to AW
    this.sampleCount = 0;
    this.signatureInterval = 0.5 * sampleRate;
    this.signatureDuration = 0.01 * sampleRate;
    this.frequency = 1000;
    this.injectingSignature = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'init') {
        this.mode = e.data.mode;
        this.signatureInterval = 0.5 * sampleRate;
        this.signatureDuration = 0.01 * sampleRate;
      } else if (e.data.type === 'processed_audio') {
        this.outputBuffer.push(e.data.audio);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length > 0) {
      const inputData = new Float32Array(input[0]);

      // Signature Generation
      for (let i = 0; i < inputData.length; i++) {
        const currentSampleIndex = this.sampleCount + i;
        const positionInInterval = currentSampleIndex % this.signatureInterval;

        if (positionInInterval === 0) {
          if (currentSampleIndex > sampleRate * 2) { // Wait 2 seconds
            this.injectingSignature = true;
            this.port.postMessage({ type: 'signature_sent', timestamp: currentTime + i / sampleRate });
          } else {
            this.injectingSignature = false;
          }
        }

        if (this.injectingSignature && positionInInterval < this.signatureDuration) {
          inputData[i] += 0.5 * Math.sin((2 * Math.PI * this.frequency * positionInInterval) / sampleRate);
        }
      }
      this.sampleCount += inputData.length;

      if (this.mode === 'aw') {
        this.port.postMessage({ type: 'process_audio', audio: inputData, glitchCount: this.glitchCount, captureTimestamp: currentTime }, [inputData.buffer]);
      } else if (this.mode === 'mstp') {
        // Output signed audio directly for MSTP
        for (let channel = 0; channel < output.length; channel++) {
          if (output[channel]) {
            output[channel].set(inputData);
          }
        }
        return true; // Done for MSTP
      }
    }

    if (this.mode === 'aw') {
      if (this.outputBuffer.length > 0) {
        const processedData = this.outputBuffer.shift();
        for (let channel = 0; channel < output.length; channel++) {
          if (output[channel]) {
            output[channel].set(processedData);
          }
        }
      } else {
        // Dropout - fill with zeros
        for (let channel = 0; channel < output.length; channel++) {
          if (output[channel]) {
            output[channel].fill(0);
          }
        }
        this.glitchCount++;
      }
    }
    return true;
  }
}

registerProcessor('capture-worklet', CaptureWorklet);
