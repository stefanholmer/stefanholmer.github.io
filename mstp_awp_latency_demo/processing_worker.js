self.onmessage = async (e) => {
  if (e.data.type === 'init') {
    const { readable, writable, sampleRate } = e.data;
    const reader = readable.getReader();
    const writer = writable.getWriter();

    while (true) {
        const { done, value: audioFrame } = await reader.read();
        if (done) break;

        const buffer = new Float32Array(audioFrame.numberOfFrames);
        audioFrame.copyTo(buffer, { planeIndex: 0 });

        const performanceNow = performance.now() / 1000;

        if (!this.delayApplied) this.delayApplied = {3: false, 6: false, 9: false};

        let delayMs = 0;
        if (performanceNow >= 9.0 && !this.delayApplied[9]) {
            delayMs = 300;
            this.delayApplied[9] = true;
        } else if (performanceNow >= 6.0 && !this.delayApplied[6]) {
            delayMs = 200;
            this.delayApplied[6] = true;
        } else if (performanceNow >= 3.0 && !this.delayApplied[3]) {
            delayMs = 100;
            this.delayApplied[3] = true;
        }

        if (delayMs > 0) {
            const start = Date.now();
            while (Date.now() - start < delayMs) {
                // Busy wait
            }
            console.log(`Worker thread delay of ${delayMs}ms at ${performanceNow.toFixed(2)}s`);
        }

        const newFrame = new AudioData({
            format: audioFrame.format,
            sampleRate: audioFrame.sampleRate,
            numberOfFrames: audioFrame.numberOfFrames,
            numberOfChannels: audioFrame.numberOfChannels,
            timestamp: audioFrame.timestamp,
            data: buffer
        });
        audioFrame.close();
        try {
            await writer.write(newFrame);
        } catch (e) {
            console.error('Error writing to stream', e);
            break;
        }
    }
  }
};
