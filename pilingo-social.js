const PilingoSocial = {
  endpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social" : "/api/social",
  profileEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/profile" : "/api/social/profile",
  followEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/follow" : "/api/social/follow",
  requestEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/request" : "/api/social/request",
  blockEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/block" : "/api/social/block",
  messagesEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages" : "/api/messages",
  messageThreadEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/thread" : "/api/messages/thread",
  messageSendEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/send" : "/api/messages/send",
  pollTimer: null,
  lastSnapshot: null,
  activeProfile: null,
  activeConversationEmail: "",
  voiceRecorder: null,
  voiceStream: null,
  voiceChunks: [],
  voiceStartedAt: 0,
  voiceTimer: null,
  pendingVoice: null,
  voiceAudioContext: null,
  voiceAnalyser: null,
  voiceHasSignal: false,
  voiceWarning: "",

  canUseServer(){
    return location.protocol.startsWith("http");
  },

  currentAccount(){
    return window.PilingoAuth?.loadAccount?.() || null;
  },

  currentEmail(){
    return String(this.currentAccount()?.email || "").trim().toLowerCase();
  },

  async fetchSnapshot(){
    if(!this.canUseServer()) return null;
    const email = this.currentEmail();
    if(!email) return null;

    try {
      const url = `${this.endpoint}?viewerEmail=${encodeURIComponent(email)}`;
      const response = await fetch(url, { cache:"no-store" });
      const data = await response.json();
      return data?.social || null;
    } catch(error) {
      return null;
    }
  },

  async fetchProfile(targetEmail){
    if(!this.canUseServer()) return null;
    const viewerEmail = this.currentEmail();
    if(!viewerEmail || !targetEmail) return null;

    try {
      const url = `${this.profileEndpoint}?viewerEmail=${encodeURIComponent(viewerEmail)}&targetEmail=${encodeURIComponent(targetEmail)}`;
      const response = await fetch(url, { cache:"no-store" });
      const data = await response.json();
      return data?.profile || null;
    } catch(error) {
      return null;
    }
  },

  async postAction(url, payload){
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.ok){
      throw new Error(data?.error || "Could not update this student.");
    }
    if(data.social){
      this.lastSnapshot = data.social;
    }
    return data;
  },

  async fetchConversations(){
    const viewerEmail = this.currentEmail();
    if(!viewerEmail) return [];
    try {
      const response = await fetch(`${this.messagesEndpoint}?viewerEmail=${encodeURIComponent(viewerEmail)}`, { cache:"no-store" });
      const data = await response.json();
      return Array.isArray(data?.conversations) ? data.conversations : [];
    } catch(error) {
      return [];
    }
  },

  async fetchThread(targetEmail){
    const viewerEmail = this.currentEmail();
    if(!viewerEmail || !targetEmail) return null;
    const url = `${this.messageThreadEndpoint}?viewerEmail=${encodeURIComponent(viewerEmail)}&targetEmail=${encodeURIComponent(targetEmail)}`;
    const response = await fetch(url, { cache:"no-store" });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data?.ok) throw new Error(data?.error || "Could not open this conversation.");
    return data;
  },

  async sendMessage(targetEmail, text){
    const senderEmail = this.currentEmail();
    return await this.postAction(this.messageSendEndpoint, {
      senderEmail,
      recipientEmail: targetEmail,
      text: String(text || "").trim()
    });
  },

  async sendVoiceMessage(targetEmail, recording){
    return await this.postAction(this.messageSendEndpoint, {
      senderEmail: this.currentEmail(),
      recipientEmail: targetEmail,
      voiceData: await blobToBase64(recording.blob),
      mimeType: recording.blob.type || "audio/webm",
      duration: recording.duration
    });
  },

  async setFollow(targetEmail, follow){
    const viewerEmail = this.currentEmail();
    if(!viewerEmail || !targetEmail) return null;
    const data = await this.postAction(this.followEndpoint, {
      viewerEmail,
      targetEmail,
      follow: !!follow
    });
    return data.social || null;
  },

  async setRequest(targetEmail, action){
    const viewerEmail = this.currentEmail();
    if(!viewerEmail || !targetEmail) return null;
    const data = await this.postAction(this.requestEndpoint, {
      viewerEmail,
      targetEmail,
      action
    });
    return {
      social: data.social || null,
      profile: data.profile || null
    };
  },

  async setBlock(targetEmail, block){
    const viewerEmail = this.currentEmail();
    if(!viewerEmail || !targetEmail) return null;
    const data = await this.postAction(this.blockEndpoint, {
      viewerEmail,
      targetEmail,
      block: !!block
    });
    return {
      social: data.social || null,
      profile: data.profile || null
    };
  },

  async follow(targetEmail){
    const snapshot = await this.setFollow(targetEmail, true);
    window.PilingoNotify?.track?.("student_follow_request", "Sent follow request", { source:"social", targetEmail });
    return snapshot;
  },

  async unfollow(targetEmail){
    const snapshot = await this.setFollow(targetEmail, false);
    window.PilingoNotify?.track?.("student_unfollow", "Stopped following", { source:"social", targetEmail });
    return snapshot;
  },

  async block(targetEmail){
    const result = await this.setBlock(targetEmail, true);
    window.PilingoNotify?.track?.("student_block", "Blocked student", { source:"social", targetEmail });
    return result;
  },

  async unblock(targetEmail){
    const result = await this.setBlock(targetEmail, false);
    window.PilingoNotify?.track?.("student_unblock", "Unblocked student", { source:"social", targetEmail });
    return result;
  },

  async acceptRequest(targetEmail){
    const result = await this.setRequest(targetEmail, "accept");
    window.PilingoNotify?.track?.("student_follow_accept", "Accepted follow request", { source:"social", targetEmail });
    return result;
  },

  async declineRequest(targetEmail){
    const result = await this.setRequest(targetEmail, "decline");
    window.PilingoNotify?.track?.("student_follow_decline", "Declined follow request", { source:"social", targetEmail });
    return result;
  },

  async cancelRequest(targetEmail){
    const result = await this.setRequest(targetEmail, "cancel");
    window.PilingoNotify?.track?.("student_follow_cancel", "Canceled follow request", { source:"social", targetEmail });
    return result;
  },

  async render(){
    const card = document.getElementById("socialCard");
    const summary = document.getElementById("socialSummary");
    const requestsList = document.getElementById("socialRequestsList");
    const outgoingList = document.getElementById("socialOutgoingList");
    const followingList = document.getElementById("socialFollowingList");
    const followersList = document.getElementById("socialFollowersList");
    const messagesList = document.getElementById("socialMessagesList");
    const discoverList = document.getElementById("socialDiscoverList");

    if(!card || !summary || !requestsList || !outgoingList || !followingList || !followersList || !messagesList || !discoverList) return;

    const account = this.currentAccount();
    if(!account?.email){
      card.hidden = true;
      return;
    }

    card.hidden = false;

    if(!this.canUseServer()){
      summary.innerHTML = `<div class="social-empty">Profiles work on the live Pilingo app with the server turned on.</div>`;
      requestsList.innerHTML = "";
      outgoingList.innerHTML = "";
      followingList.innerHTML = "";
      followersList.innerHTML = "";
      messagesList.innerHTML = "";
      discoverList.innerHTML = "";
      return;
    }

    const freshSnapshot = await this.fetchSnapshot();
    if(freshSnapshot){
      this.lastSnapshot = freshSnapshot;
    }
    const snapshot = freshSnapshot || this.lastSnapshot;

    if(!snapshot?.currentStudent){
      summary.innerHTML = `<div class="social-empty">Your learner circle will appear here after the app finds your account.</div>`;
      requestsList.innerHTML = "";
      outgoingList.innerHTML = "";
      followingList.innerHTML = "";
      followersList.innerHTML = "";
      messagesList.innerHTML = "";
      discoverList.innerHTML = "";
      return;
    }

    const current = snapshot.currentStudent;
    summary.innerHTML = `
      <button class="social-stat social-stat-button" type="button" onclick="jumpToSocialSection('following')">
        Following
        <span>${Number(current.followingCount || 0)}</span>
      </button>
      <button class="social-stat social-stat-button" type="button" onclick="jumpToSocialSection('followers')">
        Followers
        <span>${Number(current.followersCount || 0)}</span>
      </button>
      <button class="social-stat social-stat-button" type="button" onclick="jumpToSocialSection('requests')">
        Requests
        <span>${Number((snapshot.requestStudents || []).length)}</span>
      </button>
      <button class="social-stat social-stat-button" type="button" onclick="jumpToSocialSection('rank')">
        Rank
        <span>${current.rank ? `#${current.rank}` : "-"}</span>
      </button>
    `;

    requestsList.innerHTML = this.renderStudentList(
      "Follow requests",
      snapshot.requestStudents,
      "When someone asks to follow you, they will appear here."
    );

    outgoingList.innerHTML = this.renderStudentList(
      "Sent requests",
      snapshot.outgoingRequestStudents,
      "Students you asked to follow will appear here until they answer."
    );

    followingList.innerHTML = this.renderStudentList(
      "Following",
      snapshot.followingStudents,
      "You are not following anyone yet. Open a learner profile and follow them."
    );

    followersList.innerHTML = this.renderStudentList(
      "Followers",
      snapshot.followerStudents,
      "No followers yet. When students follow you, they will appear here."
    );

    const conversations = await this.fetchConversations();
    messagesList.innerHTML = this.renderConversations(conversations);
    this.updateMessageLauncher(conversations);

    discoverList.innerHTML = this.renderStudentList(
      "Explore learners",
      snapshot.suggestedStudents || [],
      "No more learners to discover right now."
    );
  },

  renderConversations(conversations){
    if(!Array.isArray(conversations) || !conversations.length){
      return `
        <div class="social-section-title">Messages</div>
        <div class="social-empty">No messages yet. Open a learner profile and press Message.</div>
      `;
    }
    return `
      <div class="social-section-title">Messages</div>
      ${conversations.map((conversation) => {
        const participant = conversation.participant || {};
        return `
          <button class="message-card" type="button" onclick="openConversation('${escapeAttr(participant.email)}')">
            <span class="message-card-heading">
              <strong>${escapeHtml(participant.name || "Student")}</strong>
              ${conversation.unreadCount ? `<span class="message-unread-badge">${Number(conversation.unreadCount)}</span>` : ""}
            </span>
            <span>${conversation.unreadCount ? "New message — tap to open" : "Tap to open conversation"}</span>
          </button>
        `;
      }).join("")}
    `;
  },

  updateMessageLauncher(conversations){
    const launcher = document.getElementById("messageLauncher");
    if(!launcher) return;
    const unreadCount = (conversations || []).reduce(
      (total, conversation) => total + Number(conversation?.unreadCount || 0),
      0
    );
    launcher.innerHTML = unreadCount
      ? `💬 Messages <span class="message-unread-badge">${unreadCount}</span>`
      : "💬 Messages";
    launcher.classList.toggle("has-unread", unreadCount > 0);
    this.updateAppBadge(unreadCount);
  },

  async updateAppBadge(unreadCount){
    try {
      if(unreadCount > 0 && "setAppBadge" in navigator){
        await navigator.setAppBadge(unreadCount);
      } else if(unreadCount === 0 && "clearAppBadge" in navigator){
        await navigator.clearAppBadge();
      }
    } catch(error) {
      // App icon badges are optional and device-controlled.
    }
  },

  async openConversation(targetEmail){
    const modal = document.getElementById("messageModal");
    const title = document.getElementById("messageModalTitle");
    const threadElement = document.getElementById("messageThread");
    if(!modal || !title || !threadElement) return;
    this.activeConversationEmail = String(targetEmail || "").trim().toLowerCase();
    modal.hidden = false;
    threadElement.innerHTML = `<div class="social-empty">Loading messages...</div>`;
    try {
      const thread = await this.fetchThread(this.activeConversationEmail);
      title.textContent = `💬 ${thread.participant?.name || "Messages"}`;
      const viewerEmail = this.currentEmail();
      threadElement.innerHTML = (thread.messages || []).length
        ? thread.messages.map((message) => `
            <div class="message-bubble ${message.senderEmail === viewerEmail ? "mine" : ""}">
              ${message.type === "voice" && message.audioUrl
                ? `<span class="voice-message-label">🎤 Voice message · ${formatVoiceDuration(message.duration)}</span><audio class="voice-message-player" controls preload="metadata" src="${escapeAttr(new URL(message.audioUrl, new URL(this.messageThreadEndpoint, location.href)).toString())}"></audio>`
                : escapeHtml(message.text)}
            </div>
          `).join("")
        : `<div class="social-empty">Start the conversation with a friendly message.</div>`;
      threadElement.scrollTop = threadElement.scrollHeight;
    } catch(error) {
      threadElement.innerHTML = `<div class="social-empty">${escapeHtml(error?.message || "Could not load messages.")}</div>`;
    }
  },

  closeConversation(){
    this.cancelVoiceRecording();
    const modal = document.getElementById("messageModal");
    if(modal) modal.hidden = true;
    this.activeConversationEmail = "";
  },

  async submitConversationMessage(text){
    if(!this.activeConversationEmail) return;
    const result = await this.sendMessage(this.activeConversationEmail, text);
    this.appendConversationMessage(result.message);
    this.refreshMessagesInBackground();
  },

  appendConversationMessage(message){
    const thread = document.getElementById("messageThread");
    if(!thread || !message) return;
    thread.querySelector(".social-empty")?.remove();
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${message.senderEmail === this.currentEmail() ? "mine" : ""}`;
    bubble.innerHTML = message.type === "voice" && message.audioUrl
      ? `<span class="voice-message-label">🎤 Voice message · ${formatVoiceDuration(message.duration)}</span><audio class="voice-message-player" controls preload="metadata" src="${escapeAttr(new URL(message.audioUrl, new URL(this.messageThreadEndpoint, location.href)).toString())}"></audio>`
      : escapeHtml(message.text);
    thread.appendChild(bubble);
    thread.scrollTo({ top:thread.scrollHeight, behavior:"smooth" });
  },

  refreshMessagesInBackground(){
    window.clearTimeout(this.messageRefreshTimer);
    this.messageRefreshTimer = window.setTimeout(() => this.render(), 500);
  },

  async toggleVoiceRecording(){
    if(this.voiceRecorder?.state === "recording") return this.voiceRecorder.stop();
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){
      alert("Voice recording is not supported by this browser.");
      return;
    }
    try {
      this.cancelVoiceRecording();
      this.voiceWarning = "";
      const input = document.getElementById("voiceInputSelect");
      const deviceId = String(input?.value || "");
      this.voiceStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId:{ exact:deviceId } } : {}),
          echoCancellation:true,
          noiseSuppression:true,
          autoGainControl:true
        }
      });
      await this.refreshVoiceInputs(this.voiceStream.getAudioTracks()[0]?.getSettings?.().deviceId || deviceId);
      this.monitorVoiceInput();
      const audioTrack = this.voiceStream.getAudioTracks()[0];
      if(!audioTrack) throw new Error("No microphone was found.");
      audioTrack.onmute = () => this.setVoiceStatus("Microphone paused — check your AirPods connection.");
      audioTrack.onunmute = () => { this.voiceWarning = ""; this.updateVoiceControls(); };
      audioTrack.onended = () => {
        if(this.voiceRecorder?.state === "recording") this.voiceRecorder.stop();
        this.setVoiceStatus("Microphone disconnected. Reconnect your AirPods and try again.");
      };
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      this.voiceChunks = [];
      this.voiceRecorder = new MediaRecorder(this.voiceStream, preferred ? { mimeType:preferred, audioBitsPerSecond:24000 } : { audioBitsPerSecond:24000 });
      this.voiceRecorder.ondataavailable = (event) => { if(event.data?.size) this.voiceChunks.push(event.data); };
      this.voiceRecorder.onstop = () => this.finishVoiceRecording();
      this.voiceStartedAt = Date.now();
      this.voiceRecorder.start(500);
      this.updateVoiceControls();
      this.voiceTimer = window.setInterval(() => {
        this.updateVoiceControls();
        if(Date.now() - this.voiceStartedAt >= 60_000) this.voiceRecorder?.stop();
      }, 250);
    } catch(error) {
      this.cancelVoiceRecording();
      alert("Pilingo needs microphone permission to record a voice message.");
    }
  },

  finishVoiceRecording(){
    const duration = Math.max(1, Math.min(60, Math.round((Date.now() - this.voiceStartedAt) / 1000)));
    const type = this.voiceRecorder?.mimeType || this.voiceChunks[0]?.type || "audio/webm";
    const blob = new Blob(this.voiceChunks, { type });
    const heardAudio = this.voiceHasSignal;
    this.releaseVoiceRecorder();
    if(!heardAudio){
      alert("Pilingo did not hear any sound. Choose your AirPods microphone, check that it is connected, and try again.");
      return this.updateVoiceControls();
    }
    if(blob.size > 700000){
      alert("That recording is too large. Please record a shorter voice message.");
      return this.updateVoiceControls();
    }
    this.pendingVoice = { blob, duration, url:URL.createObjectURL(blob) };
    this.updateVoiceControls();
  },

  releaseVoiceRecorder(){
    window.clearInterval(this.voiceTimer);
    this.voiceTimer = null;
    this.voiceStream?.getTracks?.().forEach((track) => track.stop());
    this.voiceStream = null;
    this.voiceAudioContext?.close?.().catch?.(() => {});
    this.voiceAudioContext = null;
    this.voiceAnalyser = null;
    this.voiceRecorder = null;
    this.voiceChunks = [];
  },

  monitorVoiceInput(){
    this.voiceHasSignal = false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if(!AudioContextClass) {
      this.voiceHasSignal = true;
      return;
    }
    try {
      this.voiceAudioContext = new AudioContextClass();
      const source = this.voiceAudioContext.createMediaStreamSource(this.voiceStream);
      this.voiceAnalyser = this.voiceAudioContext.createAnalyser();
      this.voiceAnalyser.fftSize = 256;
      source.connect(this.voiceAnalyser);
    } catch(error) {
      this.voiceAudioContext = null;
      this.voiceAnalyser = null;
      this.voiceHasSignal = true;
    }
  },

  detectVoiceSignal(){
    if(!this.voiceAnalyser || this.voiceHasSignal) return;
    if(this.voiceAudioContext?.state !== "running") {
      this.voiceHasSignal = true;
      return;
    }
    const samples = new Uint8Array(this.voiceAnalyser.fftSize);
    this.voiceAnalyser.getByteTimeDomainData(samples);
    this.voiceHasSignal = samples.some((sample) => Math.abs(sample - 128) > 2);
  },

  async refreshVoiceInputs(selectedDeviceId){
    const select = document.getElementById("voiceInputSelect");
    if(!select || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    if(!devices.length) return;
    select.innerHTML = devices.map((device, index) => `<option value="${escapeAttr(device.deviceId)}">${escapeHtml(device.label || `Microphone ${index + 1}`)}</option>`).join("");
    if(selectedDeviceId && devices.some((device) => device.deviceId === selectedDeviceId)) select.value = selectedDeviceId;
    select.hidden = false;
  },

  async changeVoiceInput(){
    if(this.voiceRecorder?.state !== "recording") return;
    this.cancelVoiceRecording();
    await this.toggleVoiceRecording();
  },

  setVoiceStatus(message){
    this.voiceWarning = String(message || "");
    const status = document.getElementById("voiceRecordStatus");
    if(status) status.textContent = this.voiceWarning;
  },

  cancelVoiceRecording(){
    if(this.voiceRecorder?.state === "recording") this.voiceRecorder.onstop = null;
    try { this.voiceRecorder?.stop?.(); } catch(error) {}
    this.releaseVoiceRecorder();
    if(this.pendingVoice?.url) URL.revokeObjectURL(this.pendingVoice.url);
    this.pendingVoice = null;
    this.updateVoiceControls();
  },

  updateVoiceControls(){
    const button = document.getElementById("voiceRecordButton");
    const preview = document.getElementById("voiceMessagePreview");
    const status = document.getElementById("voiceRecordStatus");
    const recording = this.voiceRecorder?.state === "recording";
    if(button) button.innerHTML = recording ? "<span>⏹</span> Stop recording" : "<span>🎤</span> Record voice";
    if(button) button.classList.toggle("recording", !!recording);
    if(status) status.textContent = this.voiceWarning || (recording ? `Recording ${formatVoiceDuration(Math.ceil((Date.now() - this.voiceStartedAt) / 1000))} / 1:00` : "");
    if(preview) preview.innerHTML = this.pendingVoice ? `<div class="voice-preview-main"><span class="voice-preview-icon">🎤</span><div><strong>Voice message ready</strong><small>${formatVoiceDuration(this.pendingVoice.duration)}</small></div><audio controls src="${escapeAttr(this.pendingVoice.url)}"></audio></div><div class="voice-preview-actions"><button class="voice-delete-button" type="button" onclick="PilingoSocial.cancelVoiceRecording()" aria-label="Delete recording">🗑️</button><button id="voiceSendButton" class="voice-send-button" type="button" onclick="PilingoSocial.submitVoiceMessage()">Send voice <span>➤</span></button></div>` : "";
    if(recording) this.detectVoiceSignal();
  },

  async submitVoiceMessage(){
    if(!this.pendingVoice || !this.activeConversationEmail) return;
    const sendButton = document.getElementById("voiceSendButton");
    try {
      if(sendButton){ sendButton.disabled = true; sendButton.textContent = "Sending…"; }
      const result = await this.sendVoiceMessage(this.activeConversationEmail, this.pendingVoice);
      this.cancelVoiceRecording();
      this.appendConversationMessage(result.message);
      this.refreshMessagesInBackground();
    } catch(error) {
      alert(error?.message || "Could not send this voice message.");
      if(sendButton){ sendButton.disabled = false; sendButton.textContent = "Send voice"; }
    }
  },

  renderStudentList(title, students, emptyMessage){
    if(!Array.isArray(students) || !students.length){
      return `
        <div class="social-section-title">${escapeHtml(title)}</div>
        <div class="social-empty">${escapeHtml(emptyMessage)}</div>
      `;
    }

    return `
      <div class="social-section-title">${escapeHtml(title)}</div>
      ${students.map((student) => `
        <button class="social-student-card ${student.isCurrentStudent ? "self" : ""}" type="button" onclick="openStudentProfile('${escapeAttr(student.email)}')">
          ${this.avatarMarkup(student, "social-avatar")}
          <div class="social-student-main">
            <strong>${escapeHtml(student.name || "Student")}${student.isCurrentStudent ? ' <span class="social-you-tag">YOU</span>' : ""}</strong>
            <span>${this.rankLine(student)}</span>
            <span>${this.statusLine(student)}</span>
          </div>
        </button>
      `).join("")}
    `;
  },

  avatarLetters(name){
    return String(name || "S")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "S";
  },

  avatarMarkup(student, className){
    const avatarType = student?.avatarType === "image" ? "image" : "emoji";
    const avatarValue = String(student?.avatarValue || "").trim();

    if(avatarType === "image" && avatarValue){
      return `<img class="${escapeAttr(className || "social-avatar")}" src="${escapeAttr(avatarValue)}" alt="${escapeAttr(student?.name || "Student")}">`;
    }

    return `<div class="${escapeAttr(className || "social-avatar")}">${escapeHtml(avatarValue || this.avatarLetters(student?.name))}</div>`;
  },

  rankLine(student){
    const rank = student?.rank ? `#${student.rank}` : "Unranked";
    const xp = `XP ${Number(student?.xp || 0)}`;
    const grade = `Grade ${Math.round(Number(student?.averageGrade || 0))}%`;
    return `${rank} • ${xp} • ${grade}`;
  },

  statusLine(student){
    if(student?.blockedYou) return "This student blocked you";
    if(student?.isBlocked) return "You blocked this student";
    if(student?.hasPendingRequestFrom) return "Asked to follow you";
    if(student?.hasPendingRequestTo) return "Follow request sent";
    if(student?.isFollowing) return `Following • ${Number(student?.followersCount || 0)} followers`;
    return `${Number(student?.followersCount || 0)} followers • ${Number(student?.followingCount || 0)} following`;
  },

  async openProfile(targetEmail){
    const modal = document.getElementById("studentProfileModal");
    const body = document.getElementById("studentProfileBody");
    if(!modal || !body || !targetEmail) return;

    modal.hidden = false;
    body.innerHTML = `<div class="social-empty">Loading profile...</div>`;

    const profile = await this.fetchProfile(targetEmail);
    this.activeProfile = profile;

    if(!profile){
      body.innerHTML = `<div class="social-empty">This student profile could not be loaded right now.</div>`;
      return;
    }

    body.innerHTML = this.renderProfile(profile);
  },

  closeProfile(){
    const modal = document.getElementById("studentProfileModal");
    if(modal) modal.hidden = true;
    this.activeProfile = null;
  },

  renderProfile(profile){
    const messageButton = (!profile.isCurrentStudent && !profile.blockedYou && !profile.isBlocked)
      ? `<button class="secondary-button" type="button" onclick="openConversation('${escapeAttr(profile.email)}')">Message</button>`
      : "";
    const actionButton = profile.isCurrentStudent
      ? ""
      : profile.blockedYou
        ? `<div class="social-empty">This student blocked you, so you cannot follow them right now.</div>`
        : profile.hasPendingRequestFrom
          ? `
            <div class="student-profile-actions">
              <button class="social-follow-button" type="button" onclick="respondToFollowRequest('${escapeAttr(profile.email)}', 'accept')">
                Accept request
              </button>
              <button class="secondary-button" type="button" onclick="respondToFollowRequest('${escapeAttr(profile.email)}', 'decline')">
                Decline
              </button>
              <button class="social-block-button" type="button" onclick="toggleProfileBlock('${escapeAttr(profile.email)}', true)">
                Block
              </button>
            </div>
          `
        : profile.hasPendingRequestTo
          ? `
            <div class="student-profile-actions">
              <button class="secondary-button" type="button" onclick="respondToFollowRequest('${escapeAttr(profile.email)}', 'cancel')">
                Cancel request
              </button>
              <button class="social-block-button" type="button" onclick="toggleProfileBlock('${escapeAttr(profile.email)}', true)">
                Block
              </button>
            </div>
          `
        : `
          <div class="student-profile-actions">
            <button class="social-follow-button" type="button" onclick="toggleProfileFollow('${escapeAttr(profile.email)}', ${profile.isFollowing ? "false" : "true"})">
              ${profile.isFollowing ? "Unfollow" : "Send request"}
            </button>
            <button class="social-block-button" type="button" onclick="toggleProfileBlock('${escapeAttr(profile.email)}', ${profile.isBlocked ? "false" : "true"})">
              ${profile.isBlocked ? "Unblock" : "Block"}
            </button>
          </div>
        `;

    return `
      <div class="student-profile-head">
        ${this.avatarMarkup(profile, "student-profile-avatar")}
        <div class="student-profile-titles">
          <h3>${escapeHtml(profile.name || "Student")}</h3>
          <p>${escapeHtml(profile.profileStatus || "")}</p>
        </div>
      </div>
      <div class="student-profile-grid">
        <div class="student-profile-stat"><strong>Rank</strong><span>${profile.rank ? `#${profile.rank}` : "-"}</span></div>
        <div class="student-profile-stat"><strong>XP</strong><span>${Number(profile.xp || 0)}</span></div>
        <div class="student-profile-stat"><strong>Grade</strong><span>${Math.round(Number(profile.averageGrade || 0))}%</span></div>
        <div class="student-profile-stat"><strong>Streak</strong><span>${Number(profile.streak || 0)}</span></div>
        <div class="student-profile-stat"><strong>Sections</strong><span>${Number(profile.completedSections || 0)}</span></div>
        <div class="student-profile-stat"><strong>Followers</strong><span>${Number(profile.followersCount || 0)}</span></div>
      </div>
      <div class="student-profile-meta">
        <div><strong>Email</strong><span>${escapeHtml(profile.email || "No email")}</span></div>
        <div><strong>Phone</strong><span>${escapeHtml(profile.phone || "No phone")}</span></div>
        <div><strong>Status</strong><span>${escapeHtml(this.statusLine(profile))}</span></div>
      </div>
      ${this.renderProfileConnections("Followers", profile.followerStudents, "No followers yet.")}
      ${this.renderProfileConnections("Following", profile.followingStudents, "Not following anyone yet.")}
      ${profile.isCurrentStudent ? this.renderProfileConnections("Waiting requests", profile.pendingRequestStudents, "No pending requests.") : ""}
      ${profile.isCurrentStudent ? this.renderProfileConnections("Sent requests", profile.sentRequestStudents, "No sent requests.") : ""}
      ${messageButton ? `<div class="student-profile-actions">${messageButton}</div>` : ""}
      ${actionButton}
    `;
  },

  renderProfileConnections(title, students, emptyMessage){
    if(!Array.isArray(students) || !students.length){
      return `
        <div class="student-profile-connections">
          <strong>${escapeHtml(title)}</strong>
          <div class="social-empty">${escapeHtml(emptyMessage)}</div>
        </div>
      `;
    }

    return `
      <div class="student-profile-connections">
        <strong>${escapeHtml(title)}</strong>
        <div class="student-profile-people">
          ${students.map((student) => `
            <button class="student-mini-card" type="button" onclick="openStudentProfile('${escapeAttr(student.email)}')">
              ${this.avatarMarkup(student, "student-mini-avatar")}
              <span>${escapeHtml(student.name || "Student")}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  },

  jumpToSection(section){
    const targetMap = {
      requests: "socialRequestsList",
      sent: "socialOutgoingList",
      following: "socialFollowingList",
      followers: "socialFollowersList",
      messages: "socialMessagesList",
      discover: "socialDiscoverList",
      rank: "leaderList"
    };

    const targetId = targetMap[section];
    const element = targetId ? document.getElementById(targetId) : null;
    if(!element) return;

    element.scrollIntoView({ behavior:"smooth", block:"center" });
    element.classList.remove("social-panel-focus");
    window.requestAnimationFrame(() => {
      element.classList.add("social-panel-focus");
      window.setTimeout(() => element.classList.remove("social-panel-focus"), 1200);
    });
  },

  startPolling(){
    if(this.pollTimer) clearInterval(this.pollTimer);
    this.render();
    if(location.hash === "#messages"){
      window.setTimeout(() => this.jumpToSection("messages"), 500);
    }
    this.pollTimer = setInterval(() => {
      this.lastSnapshot = null;
      this.render();
    }, 8000);
  }
};

function escapeAttr(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatVoiceDuration(seconds){
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function openStudentProfile(targetEmail){
  await PilingoSocial.openProfile(targetEmail);
}

function closeStudentProfile(){
  PilingoSocial.closeProfile();
}

async function openConversation(targetEmail){
  await PilingoSocial.openConversation(targetEmail);
}

function closeConversation(){
  PilingoSocial.closeConversation();
}

async function sendConversationMessage(event){
  event.preventDefault();
  const input = document.getElementById("messageInput");
  const text = String(input?.value || "").trim();
  if(!text) return;
  const sendButton = event.submitter || event.currentTarget?.querySelector('button[type="submit"]');
  try {
    if(sendButton){ sendButton.disabled = true; sendButton.innerHTML = `<span class="send-button-spinner"></span>`; }
    await PilingoSocial.submitConversationMessage(text);
    if(input) input.value = "";
  } catch(error) {
    alert(error?.message || "Could not send this message.");
  } finally {
    if(sendButton){ sendButton.disabled = false; sendButton.innerHTML = `➤`; }
  }
}

async function toggleStudentFollow(targetEmail, shouldFollow){
  try {
    if(shouldFollow){
      await PilingoSocial.follow(targetEmail);
    } else {
      await PilingoSocial.unfollow(targetEmail);
    }
    await PilingoSocial.render();
    if(PilingoSocial.activeProfile?.email === targetEmail){
      await PilingoSocial.openProfile(targetEmail);
    }
  } catch(error) {
    alert(error?.message || "Could not update follow status.");
  }
}

async function toggleProfileFollow(targetEmail, shouldFollow){
  await toggleStudentFollow(targetEmail, shouldFollow);
}

function jumpToSocialSection(section){
  PilingoSocial.jumpToSection(section);
}

async function respondToFollowRequest(targetEmail, action){
  try {
    if(action === "accept"){
      await PilingoSocial.acceptRequest(targetEmail);
    } else if(action === "decline"){
      await PilingoSocial.declineRequest(targetEmail);
    } else {
      await PilingoSocial.cancelRequest(targetEmail);
    }
    await PilingoSocial.render();
    await PilingoSocial.openProfile(targetEmail);
  } catch(error) {
    alert(error?.message || "Could not update this follow request.");
  }
}

async function toggleProfileBlock(targetEmail, shouldBlock){
  try {
    if(shouldBlock){
      await PilingoSocial.block(targetEmail);
    } else {
      await PilingoSocial.unblock(targetEmail);
    }
    await PilingoSocial.render();
    await PilingoSocial.openProfile(targetEmail);
  } catch(error) {
    alert(error?.message || "Could not update block status.");
  }
}

window.PilingoSocial = PilingoSocial;
window.openStudentProfile = openStudentProfile;
window.closeStudentProfile = closeStudentProfile;
window.jumpToSocialSection = jumpToSocialSection;
window.toggleStudentFollow = toggleStudentFollow;
window.toggleProfileFollow = toggleProfileFollow;
window.respondToFollowRequest = respondToFollowRequest;
window.toggleProfileBlock = toggleProfileBlock;
window.openConversation = openConversation;
window.closeConversation = closeConversation;
window.sendConversationMessage = sendConversationMessage;
