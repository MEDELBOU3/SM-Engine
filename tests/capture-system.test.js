const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const load = file => vm.runInThisContext(
    fs.readFileSync(path.join(root, file), 'utf8'),
    { filename: file }
);

global.window = global;
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};
const globalEvents = [];
global.dispatchEvent = event => { globalEvents.push(event); return true; };
global.addEventListener = () => {};
global.isSecureContext = true;

let deviceListener = null;
let removedDeviceListener = false;
const devices = [
    { kind: 'videoinput', deviceId: 'camera-1', groupId: 'video', label: 'Studio Camera' },
    { kind: 'audioinput', deviceId: 'mic-1', groupId: 'audio', label: 'Studio Mic' }
];
const permissionTracks = [];
Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
        mediaDevices: {
            enumerateDevices: async () => devices,
            getUserMedia: async () => ({
                getTracks: () => {
                    const track = { stopped: false, stop() { this.stopped = true; } };
                    permissionTracks.push(track);
                    return [track];
                }
            }),
            addEventListener: (name, callback) => { if (name === 'devicechange') deviceListener = callback; },
            removeEventListener: (name, callback) => {
                if (name === 'devicechange' && callback === deviceListener) removedDeviceListener = true;
            }
        }
    }
});

load('engine/capture/core/SMCaptureDeviceManager.js');
load('engine/capture/core/SMCaptureSession.js');

const createdInputs = [];
class FakeCameraInput {
    constructor(options = {}) {
        this.type = 'webcam';
        this.options = options;
        this.stream = null;
        this.stopped = false;
        createdInputs.push(this);
    }
    async start(options = {}) {
        const videoTrack = {
            kind: 'video',
            readyState: 'live',
            stop() { this.readyState = 'ended'; },
            getSettings: () => ({ width: options.width || 1280, height: options.height || 720, frameRate: options.frameRate || 30 })
        };
        this.stream = {
            getTracks: () => [videoTrack],
            getVideoTracks: () => [videoTrack],
            getAudioTracks: () => []
        };
        return { stream: this.stream, videoElement: null };
    }
    async stop() {
        this.stopped = true;
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
    }
}
window.SMWebCameraInput = FakeCameraInput;
load('engine/capture/core/SMCaptureSystem.js');
load('engine/capture/recording/SMCaptureTakeManager.js');
load('engine/capture/recording/SMViewportRecorder.js');
load('engine/capture/usb/SMUSBTetherTransport.js');
load('engine/capture/ui/LiveCapturePanel.js');

(async () => {
    const manager = new window.SMCaptureDeviceManager({ autoWatchDevices: true });
    const snapshot = await manager.refresh({ requestPermission: true });
    assert.strictEqual(snapshot.cameras.length, 1);
    assert.strictEqual(snapshot.microphones.length, 1);
    assert.strictEqual(permissionTracks[0].stopped, true);
    assert.strictEqual(typeof deviceListener, 'function');

    const system = new window.SMCaptureSystem({ deviceManager: manager, autoRefreshDevices: false });
    await system.init();
    const first = await system.startWebCamera({ width: 1920, height: 1080, frameRate: 60 });
    assert.strictEqual(first.state, 'active');
    assert.strictEqual(system.activeSession, first);
    assert.deepStrictEqual(first.getSettings().video, { width: 1920, height: 1080, frameRate: 60 });

    const second = await system.startWebCamera({ width: 1280, height: 720, frameRate: 30 });
    assert.strictEqual(first.state, 'stopped');
    assert.strictEqual(createdInputs[0].stopped, true);
    assert.strictEqual(system.activeSession, second);
    assert.strictEqual(system.getSessions().length, 1);
    assert.strictEqual(await system.stopActiveSession(), true);
    assert.strictEqual(second.state, 'stopped');
    assert.strictEqual(system.activeSession, null);

    const takes = new window.SMCaptureTakeManager({ maxInMemoryTakes: 2 });
    const take = takes.addTake({ blob: new Blob(['capture']), duration: 1.25, mimeType: 'video/webm' });
    assert.strictEqual(take.name, 'Take_001');
    assert.strictEqual(takes.formatDuration(61.25), '01:01.250');
    assert.strictEqual(takes.renameTake(take.id, 'Camera_A'), true);
    assert.strictEqual(takes.getTake(take.id).filename, 'Camera_A.webm');
    assert.strictEqual(takes.removeTake(take.id), true);

    const canvasTrack = { stopped: false, stop() { this.stopped = true; } };
    const borrowedAudioTrack = { stopped: false, stop() { this.stopped = true; } };
    const streamTracks = [canvasTrack];
    const viewportStream = {
        addTrack: track => streamTracks.push(track),
        removeTrack: track => streamTracks.splice(streamTracks.indexOf(track), 1),
        getTracks: () => streamTracks.slice()
    };
    const viewportRecorder = new window.SMViewportRecorder({ canvas: {} });
    viewportRecorder.stream = viewportStream;
    viewportRecorder._mergeAudioTracks(viewportStream, { getAudioTracks: () => [borrowedAudioTrack] });
    viewportRecorder._cleanupStream();
    assert.strictEqual(canvasTrack.stopped, true);
    assert.strictEqual(borrowedAudioTrack.stopped, false);

    const capturePanel = new window.LiveCapturePanel(system);
    assert.strictEqual(capturePanel._normalizeTetherUrl('192.168.42.129'), 'ws://192.168.42.129:8765');
    assert.strictEqual(capturePanel._normalizeTetherUrl('ws://10.0.0.8:9000'), 'ws://10.0.0.8:9000');

    const nativeWebSocket = global.WebSocket;
    class RefusingPhoneSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        constructor(url) {
            this.url = url;
            this.readyState = RefusingPhoneSocket.CONNECTING;
            queueMicrotask(() => {
                this.readyState = 3;
                this.onclose?.({ code: 1006 });
            });
        }
        close() { this.readyState = 3; }
    }
    global.WebSocket = RefusingPhoneSocket;
    const tether = new window.SMUSBTetherTransport({ connectTimeoutMs: 50 });
    await assert.rejects(
        tether.connect('ws://192.168.42.129:8765'),
        /closed the connection before it was ready/
    );
    assert.strictEqual(tether.state, 'error');

    const outboundFrames = [];
    tether.socket = {
        readyState: RefusingPhoneSocket.OPEN,
        bufferedAmount: 0,
        send: payload => outboundFrames.push(payload)
    };
    const viewportFrame = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    assert.strictEqual(tether.sendBinary(viewportFrame), true);
    assert.strictEqual(outboundFrames[0], viewportFrame);
    global.WebSocket = nativeWebSocket;

    await system.destroy();
    assert.strictEqual(removedDeviceListener, true);
    assert.ok(globalEvents.some(event => event.type === 'sm:capture-session-started'));
    console.log(JSON.stringify({ passed: true, sessions: createdInputs.length, cameras: snapshot.cameras.length }));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
