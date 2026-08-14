const PilingoCalls = {
  pollEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/calls/poll" : "/api/calls/poll",
  startEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/calls/start" : "/api/calls/start",
  actionEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/calls/action" : "/api/calls/action",
  signalEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/calls/signal" : "/api/calls/signal",
  pollTimer: null,
  call: null,
  peer: null,
  localStream: null,
  lastSignalSeq: 0,
  processingSignals: false,
  toneContext: null,
  toneTimers: [],
  toneSources: [],
  ringtoneAudio: null,
  wakeLock: null,
  facingMode: "user",
  polling: false,
  missingCallPolls: 0,
  operationStarting: false,
  operationId: 0,

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
    if(this.operationStarting) return;
    if(this.call) this.cleanup();
    const operationId = ++this.operationId;
    this.operationStarting = true;
    this.call = { mode, other:{ name:document.getElementById("messageModalTitle")?.textContent || "Learner" } };
    this.showCall(mode === "video" ? "Opening camera and microphone…" : "Opening microphone…");
    try {
      await this.prepareMedia(mode);
      if(operationId !== this.operationId){
        this.localStream?.getTracks?.().forEach((track) => track.stop());
        this.localStream = null;
        return;
      }
      const data = await this.post(this.startEndpoint, {
        callerEmail: email,
        recipientEmail: targetEmail,
        mode
      });
      this.call = data.call;
      this.operationStarting = false;
      this.missingCallPolls = 0;
      this.lastSignalSeq = 0;
      await this.requestWakeLock();
      this.showCall("Calling…");
      this.startTone("outgoing");
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
    if(!this.call || this.operationStarting) return;
    const operationId = ++this.operationId;
    this.operationStarting = true;
    this.stopTone();
    this.showCall(this.call.mode === "video" ? "Opening camera and microphone…" : "Opening microphone…");
    try {
      await this.prepareMedia(this.call.mode);
      if(operationId !== this.operationId){
        this.localStream?.getTracks?.().forEach((track) => track.stop());
        this.localStream = null;
        return;
      }
      await this.post(this.actionEndpoint, {
        callId: this.call.id,
        email: this.currentEmail(),
        action: "accept"
      });
      this.call.status = "active";
      this.operationStarting = false;
      this.missingCallPolls = 0;
      await this.requestWakeLock();
      this.showCall("Connecting…");
      await this.createPeer();
      await this.poll();
    } catch(error) {
      this.cleanup();
      alert(error?.message || "Could not open the microphone or camera.");
    }
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
    const liveAudio = this.localStream?.getAudioTracks?.().some((track) => track.readyState === "live");
    const liveVideo = this.localStream?.getVideoTracks?.().some((track) => track.readyState === "live");
    if(liveAudio && (mode !== "video" || liveVideo)) return;
    this.localStream?.getTracks?.().forEach((track) => track.stop());
    this.localStream = null;
    window.PilingoSocial?.cancelVoiceRecording?.();
    window.PilingoSocial?.pauseVoiceMessages?.();
    this.setAudioSession("play-and-record");
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true },
      video: mode === "video" ? {
        facingMode:{ ideal:this.facingMode },
        width:{ ideal:640 },
        height:{ ideal:480 },
        frameRate:{ ideal:24, max:30 }
      } : false
    });
    const localVideo = document.getElementById("callLocalVideo");
    if(localVideo) localVideo.srcObject = this.localStream;
  },

  setAudioSession(type){
    try {
      if(navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = type;
    } catch(error) {}
  },

  unlockMediaPlayback(){
    this.setAudioSession("play-and-record");
    this.ensureToneContext();
    window.PilingoSocial?.pauseVoiceMessages?.();
  },

  async requestWakeLock(){
    if(!navigator.wakeLock?.request || document.visibilityState !== "visible") return;
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
    } catch(error) {
      this.wakeLock = null;
    }
  },

  async restoreMediaAfterBackground(){
    if(!this.call || document.visibilityState !== "visible") return;
    await this.requestWakeLock();
    if(!this.localStream) return;
    const currentAudio = this.localStream.getAudioTracks()[0];
    if(currentAudio && currentAudio.readyState === "live" && !currentAudio.muted){
      this.setStatus(this.peer?.connectionState === "connected" ? "Connected" : "Connecting…");
      return;
    }
    try {
      const restoredStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.call.mode === "video" ? { facingMode:{ ideal:this.facingMode } } : false
      });
      const newAudio = restoredStream.getAudioTracks()[0];
      const audioSender = this.peer?.getSenders?.().find((sender) => sender.track?.kind === "audio");
      if(audioSender && newAudio) await audioSender.replaceTrack(newAudio);
      currentAudio?.stop();
      const oldVideo = this.localStream.getVideoTracks()[0];
      const newVideo = restoredStream.getVideoTracks()[0];
      const videoSender = this.peer?.getSenders?.().find((sender) => sender.track?.kind === "video");
      if(videoSender && newVideo) await videoSender.replaceTrack(newVideo);
      oldVideo?.stop();
      this.localStream = restoredStream;
      const localVideo = document.getElementById("callLocalVideo");
      if(localVideo) localVideo.srcObject = restoredStream;
      this.setStatus("Connected — microphone restored");
    } catch(error) {
      this.setStatus("Microphone paused — tap Mute twice or rejoin the call");
    }
  },

  async createPeer(){
    if(this.peer) return;
    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls:"stun:stun.l.google.com:19302" },
        { urls:"stun:stun1.l.google.com:19302" },
        { urls:"stun:stun.cloudflare.com:3478" }
      ],
      iceCandidatePoolSize:4,
      bundlePolicy:"max-bundle"
    });
    this.localStream?.getTracks().forEach((track) => this.peer.addTrack(track, this.localStream));
    this.peer.onicecandidate = (event) => {
      if(event.candidate) this.sendSignal({ type:"candidate", candidate:event.candidate }).catch(() => {});
    };
    this.peer.ontrack = (event) => {
      const remoteVideo = document.getElementById("callRemoteVideo");
      const remoteAudio = document.getElementById("callRemoteAudio");
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      if(this.call?.mode === "video"){
        if(remoteAudio) remoteAudio.srcObject = null;
        if(remoteVideo){
          remoteVideo.srcObject = remoteStream;
          remoteVideo.muted = false;
          remoteVideo.volume = 1;
          remoteVideo.play().catch(() => this.showAudioUnlock());
        }
      } else {
        if(remoteVideo) remoteVideo.srcObject = null;
        if(remoteAudio){
          remoteAudio.srcObject = remoteStream;
          remoteAudio.volume = 1;
          remoteAudio.muted = false;
          remoteAudio.play().catch(() => this.showAudioUnlock());
        }
      }
      this.stopTone();
      this.setStatus("Connected");
    };
    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if(state === "connected"){
        this.stopTone();
        this.setStatus("Connected");
      }
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
    if(this.polling) return;
    const email = this.currentEmail();
    if(!email) return;
    this.polling = true;
    try {
      const response = await fetch(
        `${this.pollEndpoint}?email=${encodeURIComponent(email)}&after=${this.lastSignalSeq}`,
        { cache:"no-store" }
      );
      const data = await response.json();
      const incoming = data.call;
      if(!incoming){
        if(this.call && !this.operationStarting){
          this.missingCallPolls += 1;
          if(this.missingCallPolls >= 4) this.cleanup("Call ended");
        }
        return;
      }
      this.missingCallPolls = 0;

      if(!this.call && incoming.status === "ringing" && incoming.recipientEmail === email){
        this.call = incoming;
        this.lastSignalSeq = 0;
        this.showIncoming();
      } else if(this.call?.id === incoming.id){
        this.call = incoming;
        if(["declined", "ended", "missed"].includes(incoming.status)){
          const missedMessage = incoming.callerEmail === email ? "No answer" : "Missed call";
          this.cleanup(incoming.status === "declined" ? "Call declined" : incoming.status === "missed" ? missedMessage : "Call ended");
          return;
        }
        if(incoming.status === "active"){
          this.stopTone();
          this.setStatus("Connecting…");
        }
      }
      if(this.call?.id === incoming.id && this.localStream){
        await this.handleSignals(data.signals || []);
      }
    } catch(error) {
      // A temporary polling failure should not end an active call.
    } finally {
      this.polling = false;
    }
  },

  showIncoming(){
    if(this.call?.recipientEmail !== this.currentEmail()){
      this.showCall("Calling…");
      return;
    }
    const modal = document.getElementById("callModal");
    const incomingActions = document.getElementById("callIncomingActions");
    const activeActions = document.getElementById("callActiveActions");
    this.updateCallStage();
    if(modal) modal.hidden = false;
    if(incomingActions) incomingActions.hidden = false;
    if(activeActions) activeActions.hidden = true;
    this.setStatus(`${this.call.other?.name || "A learner"} is calling (${this.call.mode})`);
    this.startTone("incoming");
  },

  showCall(status){
    const modal = document.getElementById("callModal");
    const incomingActions = document.getElementById("callIncomingActions");
    const activeActions = document.getElementById("callActiveActions");
    const videoGrid = document.getElementById("callVideoGrid");
    this.updateCallStage();
    if(modal) modal.hidden = false;
    if(incomingActions) incomingActions.hidden = true;
    if(activeActions) activeActions.hidden = false;
    if(videoGrid) videoGrid.hidden = this.call?.mode !== "video";
    this.setStatus(status);
  },

  updateCallStage(){
    const videoGrid = document.getElementById("callVideoGrid");
    const audioStage = document.getElementById("callAudioStage");
    const audioAvatar = document.getElementById("callAudioAvatar");
    const audioName = document.getElementById("callAudioName");
    const switchButton = document.getElementById("callSwitchCameraButton");
    const activeActions = document.getElementById("callActiveActions");
    const isVideo = this.call?.mode === "video";
    if(videoGrid) videoGrid.hidden = !isVideo;
    if(audioStage) audioStage.hidden = isVideo;
    if(audioName) audioName.textContent = this.call?.other?.name || "Learner";
    if(audioAvatar) this.renderCallAvatar(audioAvatar, this.call?.other || {});
    if(switchButton) switchButton.hidden = !isVideo;
    if(activeActions) activeActions.classList.toggle("video-call", isVideo);
  },

  avatarLetters(name){
    return String(name || "Learner")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "L";
  },

  renderCallAvatar(element, learner){
    const name = String(learner?.name || "Learner");
    const avatarType = learner?.avatarType === "image" ? "image" : "emoji";
    const avatarValue = String(learner?.avatarValue || "").trim();
    element.replaceChildren();
    if(avatarType === "image" && avatarValue){
      const image = document.createElement("img");
      image.src = avatarValue;
      image.alt = name;
      image.onerror = () => {
        element.replaceChildren();
        element.textContent = this.avatarLetters(name);
      };
      element.appendChild(image);
      return;
    }
    element.textContent = avatarValue || this.avatarLetters(name);
  },

  setStatus(text){
    const status = document.getElementById("callStatus");
    if(status) status.textContent = text;
  },

  showAudioUnlock(){
    this.setStatus("Connected — tap here to turn on sound");
    const status = document.getElementById("callStatus");
    if(!status) return;
    status.style.cursor = "pointer";
    status.onclick = () => {
      const remoteAudio = document.getElementById("callRemoteAudio");
      const remoteVideo = document.getElementById("callRemoteVideo");
      Promise.allSettled([remoteAudio?.play?.(), remoteVideo?.play?.()]);
      status.style.cursor = "";
      status.onclick = null;
      this.setStatus("Connected");
    };
  },

  ensureToneContext(){
    if(!this.toneContext){
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if(AudioContextClass) this.toneContext = new AudioContextClass();
    }
    if(this.toneContext && !["running", "closed"].includes(this.toneContext.state)){
      this.toneContext.resume().catch(() => {});
    }
    return this.toneContext;
  },

  ensureRingtoneAudio(){
    if(!this.ringtoneAudio){
      this.ringtoneAudio = new Audio("assets/audio/pilingo-flutterlight.wav?v=1");
      this.ringtoneAudio.preload = "auto";
      this.ringtoneAudio.volume = 0.82;
    }
    return this.ringtoneAudio;
  },

  async enableCallSound(){
    const context = this.ensureToneContext();
    if(!context){
      alert("Call sounds are not supported by this browser.");
      return;
    }
    await context.resume().catch(() => {});
    localStorage.setItem("pilingo-call-sound-enabled", "1");
    this.updateCallSoundButton();
    this.stopTone();
    const ringtone = this.ensureRingtoneAudio();
    ringtone.loop = false;
    ringtone.currentTime = 0;
    ringtone.play().catch(() => this.playIncomingTheme());
  },

  updateCallSoundButton(){
    const button = document.getElementById("callSoundButton");
    if(!button) return;
    const enabled = localStorage.getItem("pilingo-call-sound-enabled") === "1";
    button.textContent = enabled ? "🔔 Call sound ON" : "🔔 Enable call sound";
    button.classList.toggle("has-unread", enabled);
  },

  playTone(frequencies, duration, volume){
    const context = this.ensureToneContext();
    if(!context || context.state === "closed") return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(Number(volume || 0.08), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    gain.connect(context.destination);
    frequencies.forEach((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    });
  },

  playFlutterChime(frequency, duration = 0.42, volume = 0.12){
    const context = this.ensureToneContext();
    if(!context || context.state === "closed") return;
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(volume, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    master.connect(context.destination);

    [
      { ratio:1, type:"sine", level:0.88, detune:-2 },
      { ratio:2, type:"sine", level:0.22, detune:3 },
      { ratio:3, type:"triangle", level:0.07, detune:0 }
    ].forEach((voice) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(frequency * voice.ratio, now);
      oscillator.detune.setValueAtTime(voice.detune, now);
      voiceGain.gain.value = voice.level;
      oscillator.connect(voiceGain);
      voiceGain.connect(master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    });
  },

  playRingtoneVoice(frequency, delay, duration, volume, options = {}){
    const context = this.ensureToneContext();
    if(!context || context.state === "closed") return;
    const start = context.currentTime + delay;
    const end = start + duration;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner?.();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(options.brightness || 2800, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + (options.attack || 0.035));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(gain);
    if(panner){
      gain.connect(panner);
      panner.pan.setValueAtTime(options.pan || 0, start);
      panner.connect(context.destination);
    } else {
      gain.connect(context.destination);
    }

    const voices = options.pad
      ? [{ ratio:1, type:"sine", level:0.8 }, { ratio:2, type:"sine", level:0.12 }]
      : [{ ratio:1, type:"sine", level:0.8 }, { ratio:2, type:"sine", level:0.2 }, { ratio:3, type:"triangle", level:0.055 }];
    voices.forEach((voice) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(frequency * voice.ratio, start);
      oscillator.detune.setValueAtTime(options.detune || 0, start);
      voiceGain.gain.value = voice.level;
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start(start);
      oscillator.stop(end + 0.04);
      this.toneSources.push(oscillator);
      oscillator.onended = () => {
        this.toneSources = this.toneSources.filter((source) => source !== oscillator);
      };
    });
  },

  playIncomingTheme(){
    // Original "Pilingo Flutterlight": a short, airy plucked motif with a soft echo.
    const melody = [
      [783.99, 0], [987.77, .19], [1174.66, .38], [987.77, .57],
      [880, .88], [1046.5, 1.07], [1318.51, 1.26], [1046.5, 1.45],
      [987.77, 1.76], [880, 1.95]
    ];
    melody.forEach(([frequency, delay], index) => {
      const pan = index % 2 ? 0.18 : -0.18;
      this.playRingtoneVoice(frequency, delay, 0.3, 0.085, { attack:0.008, brightness:3100, pan });
      this.playRingtoneVoice(frequency / 2, delay + 0.11, 0.36, 0.018, { attack:0.012, brightness:1700, pan:-pan });
    });
    this.playRingtoneVoice(196, 0, 1.05, 0.018, { pad:true, attack:0.12, brightness:650 });
    this.playRingtoneVoice(220, .88, 1.15, 0.016, { pad:true, attack:0.12, brightness:650 });
    navigator.vibrate?.([90, 70, 90]);
  },

  startTone(kind){
    this.stopTone();
    if(kind === "incoming"){
      const ringtone = this.ensureRingtoneAudio();
      ringtone.loop = true;
      ringtone.currentTime = 0;
      ringtone.play().catch(() => {
        this.playIncomingTheme();
        this.toneTimers.push(window.setInterval(() => this.playIncomingTheme(), 4100));
      });
      navigator.vibrate?.([90, 70, 90]);
      this.toneTimers.push(window.setInterval(() => navigator.vibrate?.([90, 70, 90]), 4200));
      return;
    }
    const ring = () => {
      this.playTone([440, 480], 0.9, 0.065);
    };
    ring();
    this.toneTimers.push(window.setInterval(ring, 3000));
  },

  stopTone(){
    this.toneTimers.forEach((timer) => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    });
    this.toneTimers = [];
    this.toneSources.forEach((source) => {
      try { source.stop(); } catch(error) {}
    });
    this.toneSources = [];
    if(this.ringtoneAudio){
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.loop = false;
    }
    navigator.vibrate?.(0);
  },

  toggleMute(){
    const track = this.localStream?.getAudioTracks?.()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    const button = document.getElementById("callMuteButton");
    if(button) button.innerHTML = track.enabled
      ? '<span class="call-control-icon">🎙️</span><span class="call-control-label">Mute</span>'
      : '<span class="call-control-icon">🔇</span><span class="call-control-label">Unmute</span>';
  },

  toggleCamera(){
    const track = this.localStream?.getVideoTracks?.()[0];
    if(!track) return;
    track.enabled = !track.enabled;
    const button = document.getElementById("callCameraButton");
    if(button) button.innerHTML = track.enabled
      ? '<span class="call-control-icon">📷</span><span class="call-control-label">Camera off</span>'
      : '<span class="call-control-icon">📷</span><span class="call-control-label">Camera on</span>';
  },

  async switchCamera(){
    if(this.call?.mode !== "video" || !this.peer) return;
    const nextFacingMode = this.facingMode === "user" ? "environment" : "user";
    const button = document.getElementById("callSwitchCameraButton");
    if(button) button.disabled = true;
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:{ ideal:nextFacingMode } },
        audio: false
      });
      const newVideoTrack = cameraStream.getVideoTracks()[0];
      if(!newVideoTrack) throw new Error("No camera was found.");
      const videoSender = this.peer.getSenders().find((sender) => sender.track?.kind === "video");
      if(!videoSender) throw new Error("The video connection is unavailable.");
      await videoSender.replaceTrack(newVideoTrack);
      const oldVideoTrack = this.localStream?.getVideoTracks?.()[0];
      oldVideoTrack?.stop();
      const audioTracks = this.localStream?.getAudioTracks?.() || [];
      this.localStream = new MediaStream([...audioTracks, newVideoTrack]);
      const localVideo = document.getElementById("callLocalVideo");
      if(localVideo){
        localVideo.srcObject = this.localStream;
        await localVideo.play().catch(() => {});
      }
      this.facingMode = nextFacingMode;
      if(button){
        button.innerHTML = this.facingMode === "environment"
          ? '<span class="call-control-icon">🤳</span><span class="call-control-label">Front</span>'
          : '<span class="call-control-icon">🔄</span><span class="call-control-label">Back</span>';
      }
    } catch(error) {
      alert(error?.message || "Could not switch cameras on this device.");
    } finally {
      if(button) button.disabled = false;
    }
  },

  cleanup(message){
    this.operationId += 1;
    this.stopTone();
    this.wakeLock?.release?.().catch(() => {});
    this.wakeLock = null;
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks?.().forEach((track) => track.stop());
    this.localStream = null;
    this.call = null;
    this.operationStarting = false;
    this.missingCallPolls = 0;
    this.polling = false;
    this.setAudioSession("playback");
    this.facingMode = "user";
    const switchButton = document.getElementById("callSwitchCameraButton");
    if(switchButton){
      switchButton.disabled = false;
      switchButton.innerHTML = '<span class="call-control-icon">🔄</span><span class="call-control-label">Back</span>';
    }
    this.lastSignalSeq = 0;
    const modal = document.getElementById("callModal");
    const localVideo = document.getElementById("callLocalVideo");
    const remoteVideo = document.getElementById("callRemoteVideo");
    const remoteAudio = document.getElementById("callRemoteAudio");
    if(localVideo) localVideo.srcObject = null;
    if(remoteVideo) remoteVideo.srcObject = null;
    if(remoteAudio) remoteAudio.srcObject = null;
    if(message) this.setStatus(message);
    if(modal) modal.hidden = true;
  },

  startPolling(){
    if(this.pollTimer) clearInterval(this.pollTimer);
    const unlockRingtone = () => {
      this.ensureToneContext();
      localStorage.setItem("pilingo-call-sound-enabled", "1");
      this.updateCallSoundButton();
    };
    document.addEventListener("pointerdown", unlockRingtone, { capture:true, passive:true });
    document.addEventListener("keydown", unlockRingtone, { capture:true });
    this.updateCallSoundButton();
    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "visible") this.ensureToneContext();
      if(!this.call) return;
      if(document.visibilityState === "visible"){
        this.restoreMediaAfterBackground();
      } else {
        this.setStatus("Keep Pilingo open so the other learner can hear you");
      }
    });
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), 1100);
  }
};

async function startLearnerCall(mode){
  try {
    PilingoCalls.unlockMediaPlayback();
    await PilingoCalls.start(window.PilingoSocial?.activeConversationEmail, mode);
  } catch(error) {
    alert(error?.message || "Could not start the call. Allow microphone and camera access.");
  }
}

window.PilingoCalls = PilingoCalls;
window.startLearnerCall = startLearnerCall;
