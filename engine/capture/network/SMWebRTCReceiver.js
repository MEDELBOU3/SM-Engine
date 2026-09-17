(function () {
    'use strict';

    class SMWebRTCReceiver {
        constructor(options = {}) {
            this.options = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ],
                ...options
            };

            this.peerConnection = null;
            this.remoteStream = null;
            this.dataChannel = null;

            this.state = 'idle';
            this.listeners = new Map();

            this._pendingIceCandidates = [];
        }

        on(event, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }

            this.listeners.get(event).add(callback);

            return () => {
                this.listeners.get(event)?.delete(callback);
            };
        }

        emit(event, detail = {}) {
            const callbacks = this.listeners.get(event);

            if (callbacks) {
                for (const callback of callbacks) {
                    try {
                        callback(detail);
                    } catch (error) {
                        console.error('[SMWebRTCReceiver]', error);
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(`sm:webrtc-${event}`, {
                    detail
                })
            );
        }

        _createPeerConnection() {
            if (this.peerConnection) {
                return this.peerConnection;
            }

            const pc = new RTCPeerConnection({
                iceServers: this.options.iceServers
            });

            pc.ontrack = event => {
                const stream =
                    event.streams?.[0] ||
                    this.remoteStream ||
                    new MediaStream();

                if (
                    event.track &&
                    !stream.getTracks().includes(event.track)
                ) {
                    stream.addTrack(event.track);
                }

                this.remoteStream = stream;

                this.emit('stream', {
                    stream,
                    track: event.track
                });
            };

            pc.onicecandidate = event => {
                if (!event.candidate) {
                    this.emit('icecomplete', {});
                    return;
                }

                this.emit('icecandidate', {
                    candidate: event.candidate
                });
            };

            pc.onconnectionstatechange = () => {
                this.state = pc.connectionState || 'unknown';

                this.emit('connectionstatechange', {
                    state: this.state
                });
            };

            pc.oniceconnectionstatechange = () => {
                this.emit('iceconnectionstatechange', {
                    state: pc.iceConnectionState
                });
            };

            pc.ondatachannel = event => {
                this._attachDataChannel(
                    event.channel
                );
            };

            this.peerConnection = pc;

            return pc;
        }

        _attachDataChannel(channel) {
            if (!channel) return;

            this.dataChannel = channel;

            channel.onopen = () => {
                this.emit('datachannelopen', {
                    channel
                });
            };

            channel.onclose = () => {
                this.emit('datachannelclose', {
                    channel
                });
            };

            channel.onerror = error => {
                this.emit('datachannelerror', {
                    error,
                    channel
                });
            };

            channel.onmessage = event => {
                let payload = event.data;

                if (typeof payload === 'string') {
                    try {
                        payload = JSON.parse(payload);
                    } catch (_) {}
                }

                this.emit('message', {
                    data: payload,
                    raw: event.data,
                    channel
                });
            };
        }

        async acceptOffer(offer) {
            const pc =
                this._createPeerConnection();

            const description =
                offer instanceof RTCSessionDescription
                    ? offer
                    : new RTCSessionDescription(offer);

            await pc.setRemoteDescription(description);

            for (const candidate of this._pendingIceCandidates) {
                try {
                    await pc.addIceCandidate(candidate);
                } catch (error) {
                    console.warn(
                        '[SMWebRTCReceiver] Failed to apply queued ICE candidate:',
                        error
                    );
                }
            }

            this._pendingIceCandidates.length = 0;

            const answer =
                await pc.createAnswer();

            await pc.setLocalDescription(answer);

            return {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            };
        }

        async addIceCandidate(candidate) {
            if (!candidate) return;

            const normalized =
                candidate instanceof RTCIceCandidate
                    ? candidate
                    : new RTCIceCandidate(candidate);

            const pc =
                this._createPeerConnection();

            if (!pc.remoteDescription) {
                this._pendingIceCandidates.push(
                    normalized
                );
                return;
            }

            await pc.addIceCandidate(
                normalized
            );
        }

        send(data) {
            const channel =
                this.dataChannel;

            if (
                !channel ||
                channel.readyState !== 'open'
            ) {
                return false;
            }

            const payload =
                typeof data === 'string'
                    ? data
                    : JSON.stringify(data);

            channel.send(payload);

            return true;
        }

        getRemoteStream() {
            return this.remoteStream;
        }

        isConnected() {
            return (
                this.peerConnection?.connectionState ===
                'connected'
            );
        }

        async close() {
            if (this.dataChannel) {
                try {
                    this.dataChannel.close();
                } catch (_) {}

                this.dataChannel = null;
            }

            if (this.remoteStream) {
                for (const track of this.remoteStream.getTracks()) {
                    try {
                        track.stop();
                    } catch (_) {}
                }

                this.remoteStream = null;
            }

            if (this.peerConnection) {
                try {
                    this.peerConnection.close();
                } catch (_) {}

                this.peerConnection = null;
            }

            this._pendingIceCandidates.length = 0;
            this.state = 'closed';

            this.emit('closed', {});
        }

        destroy() {
            this.close().catch(() => {});
            this.listeners.clear();
        }
    }

    window.SMWebRTCReceiver = SMWebRTCReceiver;
})();