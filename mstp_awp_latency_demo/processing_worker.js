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

        if (!this.nextBlipTime) {
            this.nextBlipTime = 3.0;
        }

        let delayMs = 0;
        if (performanceNow >= this.nextBlipTime && this.nextBlipTime <= 9.0) {
            delayMs = 100 * performanceNow / 3;
            this.nextBlipTime += 3.0;
        }

        if (delayMs > 0) {
            const start = performance.now();
            while (performance.now() - start < delayMs) {
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
