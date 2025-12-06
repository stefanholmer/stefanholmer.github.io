this.nextBlipTime = 3.0;

self.onmessage = (e) => {
    if (e.data.type === 'process_audio') {
        const audio = e.data.audio;
        const performanceNow = performance.now() / 1000;

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
            console.log(`AW Worker thread delay of ${delayMs}ms at ${performanceNow.toFixed(2)}s`);
        }
        self.postMessage({ type: 'processed_audio', audio: audio }, [audio.buffer]);
    }
};
