class Pipeline {
    constructor(type, canvasId, glitchCountElementId) {
        this.type = type; // 'aw' or 'mstp'
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.glitchCountElement = document.getElementById(glitchCountElementId);
        this.latencyData = [];
        this.lastSentTimestamp = 0;
        this.isSignaturePending = false;
    }

    async start() {
        this.captureContext = new AudioContext();
        this.playoutContext = new AudioContext();
        await this.playoutContext.audioWorklet.addModule('playout_worklet.js');

        let captureStream;
        await this.captureContext.audioWorklet.addModule('capture_worklet.js');
        const source = this.captureContext.createConstantSource();
        const captureNode = new AudioWorkletNode(this.captureContext, 'capture-worklet');
        const destination = this.captureContext.createMediaStreamDestination();
        destination.channelCount = 1;
        source.connect(captureNode);
        captureNode.connect(destination);
        source.start();

        captureNode.port.onmessage = (e) => {
            if (e.data.type === 'signature_sent') {
                this.lastSentTimestamp = this.contextTimeToAbsoluteTime(this.captureContext, e.data.timestamp);
                this.isSignaturePending = true;
                console.log(`${this.type} Signature sent at`, this.lastSentTimestamp);
            } else if (e.data.type === 'process_audio') {
                const captureTime = this.contextTimeToAbsoluteTime(this.captureContext, e.data.captureTimestamp);
                this.awWorker.postMessage({
                    type: 'process_audio',
                    audio: e.data.audio,
                    captureTimestamp: captureTime
                }, [e.data.audio.buffer]);

                if (this.glitchCountElement) {
                    this.glitchCountElement.textContent = `Glitches: ${e.data.glitchCount}`;
                }
            }
        };

        if (this.type === 'mstp') {
            captureNode.port.postMessage({ type: 'init', mode: 'mstp' });
            const track = destination.stream.getAudioTracks()[0];
            const processor = new MediaStreamTrackProcessor({ track: track , maxBufferSize: 50});
            const generator = new MediaStreamTrackGenerator({ kind: 'audio' });
            this.worker = new Worker('processing_worker.js');

            this.worker.postMessage({
                type: 'init',
                readable: processor.readable,
                writable: generator.writable,
                sampleRate: this.captureContext.sampleRate,
            }, [processor.readable, generator.writable]);

            captureStream = new MediaStream([generator]);
        } else {
            captureNode.port.postMessage({ type: 'init', mode: 'aw', sampleRate: this.captureContext.sampleRate });
            this.awWorker = new Worker('aw_processing_worker.js');
            this.awWorker.postMessage({ type: 'init', sampleRate: this.captureContext.sampleRate });
            
            this.awWorker.onmessage = (e) => {
                if (e.data.type === 'processed_audio') {
                    captureNode.port.postMessage({type: 'processed_audio', audio: e.data.audio}, [e.data.audio.buffer]);
                }
            };
            captureStream = destination.stream;
        }

        // WebRTC Loopback
        const pc1 = new RTCPeerConnection();
        const pc2 = new RTCPeerConnection();

        pc1.onicecandidate = (e) => {
            if (e.candidate) pc2.addIceCandidate(e.candidate);
        };
        pc2.onicecandidate = (e) => {
            if (e.candidate) pc1.addIceCandidate(e.candidate);
        };

        const playoutStream = new MediaStream();
        pc2.ontrack = (e) => {
            e.streams[0].getTracks().forEach((track) => playoutStream.addTrack(track));
            const audio = document.createElement('audio');
            audio.srcObject = playoutStream;
            audio.muted = true;
            audio.play();
        };

        captureStream.getTracks().forEach((track) => {
            pc1.addTrack(track, captureStream);
        });

        const offer = await pc1.createOffer();
        await pc1.setLocalDescription(offer);
        await pc2.setRemoteDescription(offer);
        const answer = await pc2.createAnswer();
        await pc2.setLocalDescription(answer);
        await pc1.setRemoteDescription(answer);

        // Playout side
        const playoutSource = this.playoutContext.createMediaStreamSource(playoutStream);
        const playoutNode = new AudioWorkletNode(this.playoutContext, 'playout-worklet');

        playoutSource.connect(playoutNode);
        playoutNode.connect(this.playoutContext.destination);

        playoutNode.port.onmessage = (e) => {
            if (e.data.type === 'signature_detected') {
                if (this.isSignaturePending) {
                    const detectionTime = this.contextTimeToAbsoluteTime(this.playoutContext, e.data.timestamp);
                    const latency = (detectionTime - this.lastSentTimestamp) * 1000; // ms
                    console.log(
                        `${this.type} Signature detected at`,
                        detectionTime,
                        'latency',
                        latency,
                    );
                    this.isSignaturePending = false;
                    this.latencyData.push(latency);
                    if (this.latencyData.length > 500) this.latencyData.shift();
                    this.drawGraph();
                } else {
                    console.warn(`${this.type} Duplicate or unexpected detection`);
                }
            }
        };
    }

    contextTimeToAbsoluteTime(context, contextTime) {
        const ts = context.getOutputTimestamp();
        let performanceTime;
        if (ts && ts.performanceTime && ts.contextTime) {
            performanceTime = (ts.performanceTime / 1000) + (contextTime - ts.contextTime);
        } else {
            performanceTime = performance.now() / 1000;
        }
        return (performance.timeOrigin / 1000) + performanceTime;
    }

    drawGraph() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const data = this.latencyData;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const paddingLeft = 40;
        const paddingBottom = 20;
        const graphWidth = canvas.width - paddingLeft;
        const graphHeight = canvas.height - paddingBottom;

        // Draw Y-axis labels and grid lines
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.lineWidth = 1;
        for (let ms = 0; ms <= 500; ms += 100) {
            const y = graphHeight - (ms / 500) * graphHeight;
            ctx.fillText(`${ms}`, paddingLeft - 5, y + 5);
            // Draw grid line
            ctx.beginPath();
            ctx.strokeStyle = '#eee';
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw Y-axis line
        ctx.beginPath();
        ctx.strokeStyle = 'black';
        ctx.moveTo(paddingLeft, 0);
        ctx.lineTo(paddingLeft, graphHeight);
        ctx.stroke();

        // Draw data
        ctx.beginPath();
        ctx.strokeStyle = this.type === 'aw' ? 'blue' : 'green';
        ctx.lineWidth = 2;
        for (let i = 0; i < data.length; i++) {
            const x = paddingLeft + (i / 500) * graphWidth;
            const y = graphHeight - (data[i] / 500) * graphHeight; // Scale to 500ms max
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        if (data.length > 0) {
            ctx.fillStyle = 'black';
            ctx.font = '16px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(
                `Latency: ${data[data.length - 1].toFixed(2)} ms`,
                paddingLeft + 10,
                20,
            );
        }
    }
}

async function startDemo() {
    const startButton = document.getElementById('startButton');
    startButton.disabled = true;

    const useAW = document.getElementById('useAW').checked;
    const useMSTP = document.getElementById('useMSTP').checked;

    if (useAW) {
        document.getElementById('awGraphContainer').style.display = 'block';
        const awPipeline = new Pipeline('aw', 'awGraph', 'glitchCount');
        awPipeline.start();
    }
    if (useMSTP) {
        document.getElementById('mstpGraphContainer').style.display = 'block';
         // MSTP doesn't have glitch count yet, but the maxBufferSize parameter
         // is set to 50 so that no glitches will happen in this demo.
        const mstpPipeline = new Pipeline('mstp', 'mstpGraph', null);
        mstpPipeline.start();
    }
}

document.getElementById('startButton').addEventListener('click', startDemo);
