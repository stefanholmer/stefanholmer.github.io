this.delayApplied = {3: false, 6: false, 9: false};

self.onmessage = (e) => {
    if (e.data.type === 'process_audio') {
        const audio = e.data.audio;
        const performanceNow = performance.now() / 1000;

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
            console.log(`AW Worker thread delay of ${delayMs}ms at ${performanceNow.toFixed(2)}s`);
        }
        self.postMessage({ type: 'processed_audio', audio: audio }, [audio.buffer]);
    }
};
