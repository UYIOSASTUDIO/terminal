import { Socket } from 'socket.io-client';

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

export class P2PManager {
    peerConnection: RTCPeerConnection | null = null;
    dataChannel: RTCDataChannel | null = null;
    socket: Socket;
    onMessage: (msg: string) => void;
    onStatusChange: (status: string) => void;

    candidateQueue: RTCIceCandidateInit[] = [];
    isRemoteDescriptionSet: boolean = false;

    constructor(socket: Socket, onMessage: (msg: string) => void, onStatusChange: (status: string) => void) {
        this.socket = socket;
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
    }

    private createForcedDataChannel() {
        if (!this.peerConnection) return;
        this.dataChannel = this.peerConnection.createDataChannel("chat", {
            negotiated: true,
            id: 0
        });
        this.setupDataChannel(this.dataChannel);
    }

    initiateConnection(targetId: string, myId: string) {
        this.createPeerConnection(targetId);
        this.createForcedDataChannel();

        this.peerConnection!.createOffer()
            .then(offer => this.peerConnection!.setLocalDescription(offer))
            .then(() => {
                this.socket.emit('request-connection', {
                    targetId,
                    fromId: myId,
                    offer: this.peerConnection!.localDescription
                });
                this.onStatusChange(`Sending Offer to ${targetId.substring(0,6)}...`);
            })
            .catch(e => this.onStatusChange(`Error creating offer: ${e}`));
    }

    async handleIncomingOffer(offer: RTCSessionDescriptionInit, fromId: string) {
        this.createPeerConnection(fromId);
        this.createForcedDataChannel();

        try {
            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
            this.isRemoteDescriptionSet = true;
            this.processCandidateQueue();

            const answer = await this.peerConnection!.createAnswer();
            await this.peerConnection!.setLocalDescription(answer);

            this.socket.emit('accept-connection', { targetId: fromId, answer });
            this.onStatusChange(`Answer sent.`);

        } catch (e) {
            console.error(e);
            this.onStatusChange(`Handshake Error: ${e}`);
        }
    }

    async handleAnswer(answer: RTCSessionDescriptionInit) {
        if (this.peerConnection) {
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                this.isRemoteDescriptionSet = true;
                this.processCandidateQueue();
            } catch (e) { console.error(e); }
        }
    }

    async handleCandidate(candidate: RTCIceCandidateInit) {
        if (this.peerConnection) {
            if (!candidate.candidate) return;
            if (!this.isRemoteDescriptionSet) {
                this.candidateQueue.push(candidate);
            } else {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) { console.error("Error adding received candidate", e); }
            }
        }
    }

    private async processCandidateQueue() {
        for (const candidate of this.candidateQueue) {
            try {
                await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) { console.error(e); }
        }
        this.candidateQueue = [];
    }

    sendMessage(text: string) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(text);
        } else {
            this.onStatusChange(`[ERROR] Channel State: ${this.dataChannel?.readyState || 'null'}`);
        }
    }

    private createPeerConnection(targetIdForCandidates: string) {
        this.candidateQueue = [];
        this.isRemoteDescriptionSet = false;
        this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection?.iceConnectionState;
            this.onStatusChange(`Link State: ${state?.toUpperCase()}`);
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && event.candidate.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: targetIdForCandidates,
                    candidate: event.candidate
                });
            }
        };
    }

    private setupDataChannel(channel: RTCDataChannel) {
        channel.onopen = () => {
            this.onStatusChange(">>> SECURE P2P CHANNEL ESTABLISHED <<<");
        };
        channel.onclose = () => {
            this.onStatusChange(">>> CHANNEL CLOSED <<<");
        };
        // WICHTIG: Das hier feuert auf der Empfängerseite!
        channel.onmessage = (event) => {
            this.onMessage(event.data);
        };
    }
}