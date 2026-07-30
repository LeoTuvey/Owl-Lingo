const PilingoCalls = {
  pollEndpoint: "/api/calls/poll",
  startEndpoint: "/api/calls/start",
  actionEndpoint: "/api/calls/action",
  signalEndpoint: "/api/calls/signal",
  pollTimer: null,
  call: null,
  peer: null,
  localStream: null,
  lastSignalSeq: 0,
  processingSignals: false,

  currentEmail(){
    return String(window.PilingoAuth?.loadAccount?.()?.email || "").trim().toLowerCase();
  },

  async post(url, payload){
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.ok) throw new Error(data.error || "Call request failed.");
    return data;
  },

  async start(targetEmail, mode){
    if(!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection){
      throw new Error("This browser does not support calls.");
    }
    const email = this.currentEmail();
    if(!email || !targetEmail) return;
    await this.prepareMedia(mode);
    try {
      const data = await this.post(this.startEndpoint, {
        callerEmail: email,
        recipientEmail: targetEmail,
        mode
      });
      this.call = data.call;
      this.lastSignalSeq = 0;
      this.showCall("Calling…");
      await this.createPeer();
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      await this.sendSignal({ type:"description", description:this.peer.localDescription });
    } catch(error) {
      this.cleanup();
      throw error;
    }
  },

  async accept(){
    if(!this.call) return;
    await this.prepareMedia(this.call.mode);
    await this.post(this.actionEndpoint, {
      callId: this.call.id,
      email: this.currentEmail(),
      action: "accept"
    });
    this.call.status = "active";
    this.showCall("Connecting…");
    await this.createPeer();
    await this.poll();
  },

  async decline(){
    if(this.call){
      await this.post(this.actionEndpoint, {
        callId: this.call.id,
        email: this.currentEmail(),
        action: "decline"
      }).catch(() => {});
    }
    this.cleanup();
  },

  async end(){
    if(this.call){
      await this.post(this.actionEndpoint, {
        callId: this.call.id,
        email: this.currentEmail(),
        action: "end"
      }).catch(() => {});
    }
    this.cleanup();
  },

  async prepareMedia(mode){
    if(this.localStream) return;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video"
    });
    const localVideo = document.getElementById("callLocalVideo");
    if(localVideo) localVideo.srcObject = this.localStream;
  },

  async createPeer(){
    if(this.peer) return;
    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls:"stun:stun.l.google.com:19302" },
        { urls:"stun:stun1.l.google.com:19302" }
      ]
    });
    this.localStream?.getTracks().forEach((track) => this.peer.addTrack(track, this.localStream));
    this.peer.onicecandidate = (event) => {
      if(event.candidate) this.sendSignal({ type:"candidate", candidate:event.candidate }).catch(() => {});
    };
    this.peer.ontrack = (event) => {
      const remoteVideo = document.getElementById("callRemoteVideo");
      if(remoteVideo) remoteVideo.srcObject = event.streams[0];
      this.setStatus("Connected");
    };
    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if(state === "connected") this.setStatus("Connected");
      if(["failed", "closed"].includes(state)) this.end();
    };
  },

  async sendSignal(data){
    if(!this.call) return;
    await this.post(this.signalEndpoint, {
      callId: this.call.id,
      senderEmail: this.currentEmail(),
      data
    });
  },

  async handleSignals(signals){
    if(this.processingSignals || !signals?.length) return;
    this.processingSignals = true;
    try {
      await this.createPeer();
      for(const signal of signals){
        this.lastSignalSeq = Math.max(this.lastSignalSeq, Number(signal.seq || 0));
        if(signal.data?.type === "description"){
          const description = signal.data.description;
          await this.peer.setRemoteDescription(description);
          if(description.type === "offer"){
            const answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(answer);
            await this.sendSignal({ type:"description", description:this.peer.localDescription });
          }
        } else if(signal.data?.type === "candidate" && signal.data.candidate){
          await this.peer.addIceCandidate(signal.data.candidate).catch(() => {});
        }
      }
    } finally {
      this.processingSignals = false;
    }
  },

  async poll(){
    const email = this.currentEmail();
    if(!email) return;
    try {
      const response = await fetch(
        `${this.pollEndpoint}?email=${encodeURIComponent(email)}&after=${this.lastSignalSeq}`,
        { cache:"no-store" }
      );
      const data = await response.json();
      const incoming = data.call;
      if(!incoming) return;

      if(!this.call && incoming.status === "ringing" && incoming.recipientEmail === email){
        this.call = incoming;
        this.lastSignalSeq = 0;
        this.showIncoming();
      } else if(this.call?.id === incoming.id){
        this.call = incoming;
        if(["declined", "ended"].includes(incoming.status)){
          this.cleanup(incoming.status === "declined" ? "Call declined" : "Call ended");
          return;
        }
        if(incoming.status === "active") this.setStatus("Connecting…");
      }
      if(this.call?.id === incoming.id && this.localStream){
        await this.handleSignals(data.signals || []);
      }
    } catch(error) {
      // A temporary polling failure should not end an active call.
    }
  },

  showIncoming(){
    const modal = document.getElementById("callModal");
    const incomingActions = document.getElementById("callIncomingActions");
    const activeActions = document.getElementById("callActiveActions");
    if(modal) modal.hidden = false;
    if(incomingActions) incomingActions.hidden = false;
    if(activeActions) activeActions.hidden = true;
    this.setStatus(`${this.call.other?.name || "A learner"} is calling (${this.call.mode})`);
  },

  showCall(status){
    const modal = document.getElementById("callModal");
    const incomingActions = document.getElementById("callIncomingActions");
    const activeActions = document.getElementById("callActiveActions");
    const videoGrid = document.getElementById("callVideoGrid");
    if(modal) modal.hidden = false;
    if(incomingActions) incomingActions.hidden = true;
    if(activeActions) activeActions.hidden = false;
    if(videoGrid) videoGrid.hidden = this.call?.mode !== "video";
    this.setStatus(status);
  },

  setStatus(text){
    const status = document.getElementById("callStatus");
    if(status) status.textContent = text;
  },

  toggleMute(){
    const track = this.localStream?.getAudioTracks?.()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    const button = document.getElementById("callMuteButton");
    if(button) button.textContent = track.enabled ? "🎙️ Mute" : "🔇 Unmute";
  },

  toggleCamera(){
    const track = this.localStream?.getVideoTracks?.()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    const button = document.getElementById("callCameraButton");
    if(button) button.textContent = track.enabled ? "📷 Camera off" : "📷 Camera on";
  },

  cleanup(message){
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks?.().forEach((track) => track.stop());
    this.localStream = null;
    this.call = null;
    this.lastSignalSeq = 0;
    const modal = document.getElementById("callModal");
    const localVideo = document.getElementById("callLocalVideo");
    const remoteVideo = document.getElementById("callRemoteVideo");
    if(localVideo) localVideo.srcObject = null;
    if(remoteVideo) remoteVideo.srcObject = null;
    if(message) this.setStatus(message);
    if(modal) modal.hidden = true;
  },

  startPolling(){
    if(this.pollTimer) clearInterval(this.pollTimer);
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), 1800);
  }
};

async function startLearnerCall(mode){
  try {
    await PilingoCalls.start(window.PilingoSocial?.activeConversationEmail, mode);
  } catch(error) {
    alert(error?.message || "Could not start the call. Allow microphone and camera access.");
  }
}

window.PilingoCalls = PilingoCalls;
window.startLearnerCall = startLearnerCall;
