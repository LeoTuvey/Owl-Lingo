const PilingoSocial = {
  endpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social" : "/api/social",
  profileEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/profile" : "/api/social/profile",
  followEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/follow" : "/api/social/follow",
  requestEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/request" : "/api/social/request",
  blockEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/social/block" : "/api/social/block",
  messagesEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages" : "/api/messages",
  messageThreadEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/thread" : "/api/messages/thread",
  messageSendEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/send" : "/api/messages/send",
  voiceMessageSendEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/voice" : "/api/messages/voice",
  messageDeleteEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/messages/delete" : "/api/messages/delete",
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
  voiceStarting: false,
  voiceSessionId: 0,

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
    const query = new URLSearchParams({
      senderEmail:this.currentEmail(),
      recipientEmail:targetEmail,
      duration:String(recording.duration || 1)
    });
    const response = await fetch(`${this.voiceMessageSendEndpoint}?${query}`, {
      method:"POST",
      headers:{ "Content-Type":recording.blob.type || "audio/webm" },
      body:recording.blob
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data?.ok) throw new Error(data?.error || "Could not send this voice message.");
    return data;
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
    if(this.activeConversationEmail){
      const activeParticipant = conversations.find((conversation) =>
        String(conversation?.participant?.email || "").trim().toLowerCase() === this.activeConversationEmail
      )?.participant;
      if(activeParticipant) this.updateConversationPresence(activeParticipant);
    }

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
    const avatar = document.getElementById("messageContactAvatar");
    const threadElement = document.getElementById("messageThread");
    if(!modal || !title || !threadElement) return;
    this.activeConversationEmail = String(targetEmail || "").trim().toLowerCase();
    modal.hidden = false;
    threadElement.innerHTML = `<div class="social-empty">Loading messages...</div>`;
    try {
      const thread = await this.fetchThread(this.activeConversationEmail);
      title.textContent = thread.participant?.name || "Messages";
      if(avatar) avatar.innerHTML = `${this.avatarMarkup(thread.participant, "message-contact-avatar-media")}<span class="message-active-dot"></span>`;
      this.updateConversationPresence(thread.participant);
      const viewerEmail = this.currentEmail();
      threadElement.innerHTML = (thread.messages || []).length
        ? thread.messages.map((message) => this.renderMessage(message, viewerEmail)).join("")
        : `<div class="social-empty">Start the conversation with a friendly message.</div>`;
      threadElement.scrollTop = threadElement.scrollHeight;
    } catch(error) {
      threadElement.innerHTML = `<div class="social-empty">${escapeHtml(error?.message || "Could not load messages.")}</div>`;
    }
    this.updateComposerState();
  },

  updateConversationPresence(participant){
    const status = document.getElementById("messageContactStatus");
    const avatar = document.getElementById("messageContactAvatar");
    const online = participant?.online === true;
    if(status) status.textContent = online ? "Active now" : this.formatLastActive(participant?.lastPresenceAt);
    avatar?.classList.toggle("offline", !online);
  },

  formatLastActive(value){
    const timestamp = new Date(value || 0).getTime();
    if(!Number.isFinite(timestamp) || timestamp <= 0) return "Last active unavailable";
    const elapsed = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(elapsed / 60000);
    if(minutes < 2) return "Last active just now";
    if(minutes < 60) return `Last active ${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `Last active ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    const days = Math.floor(hours / 24);
    if(days < 7) return `Last active ${days} ${days === 1 ? "day" : "days"} ago`;
    return `Last active ${new Date(timestamp).toLocaleString([], { dateStyle:"medium", timeStyle:"short" })}`;
  },

  renderMessageBody(message){
    if(message.type === "call"){
      const video = message.callMode === "video";
      return `<div class="missed-call-event"><span class="missed-call-icon" aria-hidden="true">${video ? "📹" : "📞"}</span><span><strong>Missed ${video ? "video" : "voice"} call</strong><small>Tap the call button above to call back</small></span></div>`;
    }
    if(message.type !== "voice" || !message.audioUrl) return escapeHtml(message.text);
    const source = escapeAttr(new URL(message.audioUrl, new URL(this.messageThreadEndpoint, location.href)).toString());
    const bars = this.renderVoiceWaveform();
    return `<div class="messenger-voice-player"><button class="messenger-voice-play" type="button" onclick="PilingoSocial.toggleVoicePlayback(this)" aria-label="Play voice message"><svg class="play-shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg><svg class="pause-shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg></button><span class="messenger-waveform" aria-hidden="true">${bars}</span><span class="messenger-voice-duration">${formatVoiceDuration(message.duration)}</span><audio playsinline preload="auto" onplay="PilingoSocial.syncVoicePlayback(this)" onpause="PilingoSocial.syncVoicePlayback(this)" onwaiting="PilingoSocial.syncVoicePlayback(this)" oncanplay="PilingoSocial.syncVoicePlayback(this)" onerror="PilingoSocial.voicePlaybackFailed(this)" onended="PilingoSocial.syncVoicePlayback(this)" src="${source}"></audio></div><span class="message-delivery-check" aria-label="Delivered">✓</span>`;
  },

  renderVoiceWaveform(){
    return Array.from({ length:24 }, () => "<i></i>").join("");
  },

  renderMessage(message, viewerEmail){
    const mine = message.senderEmail === viewerEmail;
    const voice = message.type === "voice";
    const call = message.type === "call";
    return `<div class="message-row ${mine ? "mine" : "theirs"} ${voice ? "voice-row" : ""} ${call ? "call-row" : ""}" data-message-id="${escapeAttr(message.id)}"><button class="message-more-button" type="button" onclick="PilingoSocial.openMessageMenu(this,'${escapeAttr(message.id)}',${mine})" aria-label="More actions" title="More"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button><div class="message-action-content"><div class="message-bubble ${mine ? "mine" : ""} ${voice ? "voice-bubble" : ""} ${call ? "call-bubble" : ""}">${this.renderMessageBody(message)}</div></div></div>`;
  },

  openMessageMenu(button, messageId, mine){
    const menu = document.getElementById("messageActionMenu");
    if(!menu) return;
    const rect = button.getBoundingClientRect();
    menu.dataset.messageId = messageId;
    menu.dataset.mine = mine ? "true" : "false";
    menu._moreButton = button;
    menu.style.top = `${Math.min(window.innerHeight - 68, rect.bottom + 5)}px`;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 170, rect.left - 55))}px`;
    menu.hidden = false;
    menu.querySelector("button")?.focus();
  },

  closeMessageMenu(){
    const menu = document.getElementById("messageActionMenu");
    if(menu) menu.hidden = true;
  },

  deleteMessage(){
    const menu = document.getElementById("messageActionMenu");
    const dialog = document.getElementById("messageDeleteDialog");
    if(!menu || !dialog) return;
    dialog.dataset.messageId = menu.dataset.messageId || "";
    dialog._moreButton = menu._moreButton;
    document.getElementById("messageDeleteEveryone").hidden = menu.dataset.mine !== "true";
    this.closeMessageMenu();
    dialog.hidden = false;
    requestAnimationFrame(() => dialog.classList.add("open"));
    document.getElementById("messageDeleteForYou")?.focus();
  },

  closeDeleteDialog(){
    const dialog = document.getElementById("messageDeleteDialog");
    if(!dialog) return;
    dialog.classList.remove("open");
    window.setTimeout(() => { dialog.hidden = true; }, 180);
  },

  async confirmDeleteMessage(deleteMode = "forMe"){
    const dialog = document.getElementById("messageDeleteDialog");
    const confirmButton = deleteMode === "forEveryone" ? document.getElementById("messageDeleteEveryone") : document.getElementById("messageDeleteForYou");
    const button = dialog?._moreButton;
    const messageId = dialog?.dataset.messageId;
    if(!button || !messageId) return;
    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = "Deleting…";
    button.disabled = true;
    try {
      const result = await this.postAction(this.messageDeleteEndpoint, {
        viewerEmail:this.currentEmail(),
        messageId,
        deleteMode
      });
      if(!result?.ok) throw new Error("Could not delete this message.");
      button.closest(".message-row")?.remove();
      this.closeDeleteDialog();
      const thread = document.getElementById("messageThread");
      if(thread && !thread.querySelector(".message-row")) thread.innerHTML = `<div class="social-empty">Start the conversation with a friendly message.</div>`;
      this.refreshMessagesInBackground();
    } catch(error) {
      button.disabled = false;
      alert(error?.message || "Could not delete this message.");
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = originalText;
      delete dialog.dataset.messageId;
      dialog._moreButton = null;
    }
  },

  async toggleVoicePlayback(button){
    const audio = button?.parentElement?.querySelector("audio");
    if(!audio) return;
    if(button.classList.contains("loading")) return;
    if(audio.paused){
      this.setBrowserAudioSession("playback");
      this.pauseVoiceMessages(audio);
      button.classList.add("loading");
      window.setTimeout(() => button.classList.remove("loading"), 8000);
      try {
        await audio.play();
      } catch(error) {
        try {
          audio.load();
          await audio.play();
        } catch(retryError) {
          button.classList.remove("loading", "playing");
          this.setVoiceStatus("Could not start playback. Check your phone volume and tap play again.");
        }
      }
    } else {
      audio.pause();
    }
  },

  voicePlaybackFailed(audio){
    const button = audio?.parentElement?.querySelector(".messenger-voice-play");
    button?.classList.remove("loading", "playing");
    this.setVoiceStatus("This voice message could not load. Check your connection and try again.");
  },

  pauseVoiceMessages(except){
    document.querySelectorAll(".messenger-voice-player audio, #voiceMessagePreview audio").forEach((audio) => {
      if(audio !== except && !audio.paused) audio.pause();
    });
  },

  syncVoicePlayback(audio){
    const button = audio?.parentElement?.querySelector(".messenger-voice-play");
    const playing = !!audio && !audio.paused && !audio.ended;
    button?.classList.toggle("playing", playing);
    button?.classList.toggle("loading", !!audio && !audio.paused && audio.readyState < 3);
    button?.setAttribute("aria-label", playing ? "Pause voice message" : "Play voice message");
  },

  updateComposerState(){
    const input = document.getElementById("messageInput");
    const button = document.getElementById("messageSendButton");
    const hasText = !!String(input?.value || "").trim();
    button?.classList.toggle("has-text", hasText);
    button?.setAttribute("aria-label", hasText ? "Send message" : "Send a like");
    if(button) button.title = hasText ? "Send message" : "Send a like";
  },

  addMessageEmoji(){
    const input = document.getElementById("messageInput");
    if(!input) return;
    input.value += "😊";
    input.focus();
    this.updateComposerState();
  },

  showMessageToolNotice(feature){
    alert(`${feature} are coming soon.`);
  },

  closeConversation(){
    this.cancelVoiceRecording();
    const modal = document.getElementById("messageModal");
    if(modal) modal.hidden = true;
    this.activeConversationEmail = "";
    document.getElementById("messageContactAvatar")?.classList.remove("offline");
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
    thread.insertAdjacentHTML("beforeend", this.renderMessage(message, this.currentEmail()));
    thread.scrollTo({ top:thread.scrollHeight, behavior:"smooth" });
  },

  refreshMessagesInBackground(){
    window.clearTimeout(this.messageRefreshTimer);
    this.messageRefreshTimer = window.setTimeout(() => this.render(), 500);
  },

  async toggleVoiceRecording(){
    if(this.voiceStarting) return;
    if(this.voiceRecorder?.state === "recording") return this.voiceRecorder.stop();
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){
      alert("Voice recording is not supported by this browser.");
      return;
    }
    let sessionId = 0;
    try {
      this.cancelVoiceRecording();
      sessionId = ++this.voiceSessionId;
      this.voiceStarting = true;
      this.voiceWarning = "";
      this.updateVoiceControls();
      this.setBrowserAudioSession("play-and-record");
      const input = document.getElementById("voiceInputSelect");
      const deviceId = String(input?.value || "");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId:{ ideal:deviceId } } : {}),
          echoCancellation:true,
          noiseSuppression:true,
          autoGainControl:true
        }
      });
      if(sessionId !== this.voiceSessionId){
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.voiceStream = stream;
      const audioTrack = this.voiceStream.getAudioTracks()[0];
      if(!audioTrack) throw new Error("No microphone was found.");
      this.refreshVoiceInputs(audioTrack.getSettings?.().deviceId || deviceId).catch(() => {});
      audioTrack.onmute = () => this.setVoiceStatus("Microphone paused — check your AirPods connection.");
      audioTrack.onunmute = () => { this.voiceWarning = ""; this.updateVoiceControls(); };
      audioTrack.onended = () => {
        if(this.voiceRecorder?.state === "recording") this.voiceRecorder.stop();
        this.setVoiceStatus("Microphone disconnected. Reconnect your AirPods and try again.");
      };
      this.voiceChunks = [];
      this.voiceRecorder = this.createVoiceRecorder(this.voiceStream);
      this.voiceRecorder.ondataavailable = (event) => { if(event.data?.size) this.voiceChunks.push(event.data); };
      this.voiceRecorder.onstop = () => this.finishVoiceRecording();
      this.voiceStartedAt = Date.now();
      this.voiceRecorder.start();
      this.updateVoiceControls();
      this.voiceTimer = window.setInterval(() => {
        this.updateVoiceControls();
        if(Date.now() - this.voiceStartedAt >= 60_000) this.voiceRecorder?.stop();
      }, 250);
    } catch(error) {
      const currentRequest = sessionId === this.voiceSessionId;
      if(currentRequest){
        this.cancelVoiceRecording();
        this.setBrowserAudioSession("playback");
        alert("Pilingo could not open the selected microphone. Check microphone permission or reconnect your headset, then try again.");
      }
    } finally {
      if(sessionId === this.voiceSessionId){
        this.voiceStarting = false;
        this.updateVoiceControls();
      }
    }
  },

  finishVoiceRecording(){
    const duration = Math.max(1, Math.min(60, Math.round((Date.now() - this.voiceStartedAt) / 1000)));
    const type = this.voiceRecorder?.mimeType || this.voiceChunks[0]?.type || "audio/webm";
    const blob = new Blob(this.voiceChunks, { type });
    this.releaseVoiceRecorder();
    if(blob.size < 100){
      alert("No audio was recorded. Check your microphone and try again.");
      return this.updateVoiceControls();
    }
    if(blob.size > 700000){
      alert("That recording is too large. Please record a shorter voice message.");
      return this.updateVoiceControls();
    }
    this.pendingVoice = { blob, duration, url:URL.createObjectURL(blob) };
    this.updateVoiceControls();
  },

  createVoiceRecorder(stream){
    const safari = /AppleWebKit/i.test(navigator.userAgent) && !/(Chrome|CriOS|Edg|OPR)/i.test(navigator.userAgent);
    const candidates = safari
      ? ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const supported = candidates.find((type) => {
      try { return MediaRecorder.isTypeSupported(type); } catch(error) { return false; }
    });
    const options = supported ? { mimeType:supported, audioBitsPerSecond:32000 } : { audioBitsPerSecond:32000 };
    try {
      return new MediaRecorder(stream, options);
    } catch(error) {
      try { return supported ? new MediaRecorder(stream, { mimeType:supported }) : new MediaRecorder(stream); }
      catch(fallbackError) { return new MediaRecorder(stream); }
    }
  },

  releaseVoiceRecorder(){
    window.clearInterval(this.voiceTimer);
    this.voiceTimer = null;
    this.voiceStream?.getTracks?.().forEach((track) => {
      track.onmute = null;
      track.onunmute = null;
      track.onended = null;
      track.enabled = false;
      track.stop();
    });
    this.voiceStream = null;
    this.voiceRecorder = null;
    this.voiceChunks = [];
    this.setBrowserAudioSession("playback");
  },

  setBrowserAudioSession(type){
    try {
      if(navigator.audioSession && "type" in navigator.audioSession) navigator.audioSession.type = type;
    } catch(error) {
      // Audio-session routing is optional and currently supported mainly by Safari.
    }
  },

  prepareVoicePlayback(audio){
    if(!audio) return;
    if(this.voiceRecorder?.state === "recording") this.cancelVoiceRecording();
    this.setBrowserAudioSession("playback");
    this.pauseVoiceMessages(audio);
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
    this.voiceSessionId += 1;
    this.voiceStarting = false;
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
    if(button) button.disabled = this.voiceStarting;
    if(button) button.classList.toggle("recording", !!recording);
    if(button) button.setAttribute("aria-label", recording ? "Stop recording" : "Record voice message");
    if(button) button.title = recording ? "Stop recording" : "Record voice message";
    if(status) status.textContent = this.voiceWarning || (this.voiceStarting ? "Connecting microphone…" : recording ? `Recording ${formatVoiceDuration(Math.ceil((Date.now() - this.voiceStartedAt) / 1000))} / 1:00` : "");
    if(preview) preview.innerHTML = this.pendingVoice ? `<div class="voice-preview-shell"><button class="voice-delete-button" type="button" onclick="PilingoSocial.cancelVoiceRecording()" aria-label="Discard recording" title="Discard recording"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="messenger-voice-player voice-preview-player"><button class="messenger-voice-play" type="button" onclick="PilingoSocial.toggleVoicePlayback(this)" aria-label="Play recording"><svg class="play-shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg><svg class="pause-shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg></button><span class="messenger-waveform" aria-hidden="true">${this.renderVoiceWaveform()}</span><span class="messenger-voice-duration">${formatVoiceDuration(this.pendingVoice.duration)}</span><audio playsinline preload="auto" onplay="PilingoSocial.syncVoicePlayback(this)" onpause="PilingoSocial.syncVoicePlayback(this)" onwaiting="PilingoSocial.syncVoicePlayback(this)" oncanplay="PilingoSocial.syncVoicePlayback(this)" src="${escapeAttr(this.pendingVoice.url)}"></audio></div><button id="voiceSendButton" class="voice-send-button" type="button" onclick="PilingoSocial.submitVoiceMessage()" aria-label="Send voice message" title="Send voice message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 4 18 8-18 8 2.2-6.3L14 12l-8.8-1.7Z"/></svg></button></div>` : "";
  },

  async submitVoiceMessage(){
    if(!this.pendingVoice || !this.activeConversationEmail) return;
    const sendButton = document.getElementById("voiceSendButton");
    try {
      if(sendButton){ sendButton.disabled = true; sendButton.innerHTML = `<span class="send-button-spinner"></span>`; }
      const result = await this.sendVoiceMessage(this.activeConversationEmail, this.pendingVoice);
      this.cancelVoiceRecording();
      this.appendConversationMessage(result.message);
      this.refreshMessagesInBackground();
    } catch(error) {
      alert(error?.message || "Could not send this voice message.");
      this.updateVoiceControls();
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

function formatVoiceDuration(seconds){
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function messageIconMarkup(name){
  if(name === "stop") return `<svg class="message-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
  if(name === "send") return `<svg class="message-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 3.2a1 1 0 0 0-1.1-.2L3 10.4a1 1 0 0 0 .1 1.9l7 2.3 2.3 7a1 1 0 0 0 .9.7h.1a1 1 0 0 0 .9-.6l7.4-17.5a1 1 0 0 0-.1-1ZM12 13.1 6.2 11.2l11.2-4.7L12 13.1Zm1 4.8-1.3-4 5.8-7-4.5 11Z"></path></svg>`;
  if(name === "trash") return `<svg class="message-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4a1 1 0 1 1 0 2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4a1 1 0 1 1 0-2h4l1-2Zm-1 4 1 13h6l1-13H8Z"></path></svg>`;
  return `<svg class="message-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm7-4a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.9V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.1A7 7 0 0 0 19 11Z"></path></svg>`;
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
  const text = String(input?.value || "").trim() || "👍";
  const sendButton = event.submitter || event.currentTarget?.querySelector('button[type="submit"]');
  try {
    if(sendButton){ sendButton.disabled = true; sendButton.innerHTML = `<span class="send-button-spinner"></span>`; }
    await PilingoSocial.submitConversationMessage(text);
    if(input) input.value = "";
    PilingoSocial.updateComposerState();
  } catch(error) {
    alert(error?.message || "Could not send this message.");
  } finally {
    if(sendButton){ sendButton.disabled = false; sendButton.innerHTML = `<svg class="message-like-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 21H5.2C4.5 21 4 20.5 4 19.8v-8.2c0-.7.5-1.2 1.2-1.2h3.3m0 10.6h8.2c1 0 1.8-.7 2-1.6l1.2-6.5c.2-1.2-.7-2.4-2-2.4h-4.3l.7-3.6c.3-1.6-.9-3.1-2.5-3.1h-.4l-2.9 6.6V21Z"/></svg><svg class="message-arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 4 18 8-18 8 2.2-6.3L14 12l-8.8-1.7Z"/></svg>`; PilingoSocial.updateComposerState(); }
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

// Messenger-style actions: hover + More on desktop, press and hold on touch screens.
(() => {
  let holdTimer = null;
  let holdTarget = null;
  const cancelHold = () => {
    window.clearTimeout(holdTimer);
    holdTimer = null;
    holdTarget = null;
  };

  document.addEventListener("pointerdown", (event) => {
    const content = event.target.closest?.(".message-action-content");
    if(!content || event.pointerType === "mouse" || event.target.closest("button, audio")) return;
    const row = content.closest(".message-row");
    const moreButton = row?.querySelector(".message-more-button");
    if(!row || !moreButton) return;
    holdTarget = { x:event.clientX, y:event.clientY };
    holdTimer = window.setTimeout(() => {
      row.classList.add("actions-open");
      PilingoSocial.openMessageMenu(moreButton, row.dataset.messageId, row.classList.contains("mine"));
      navigator.vibrate?.(20);
      cancelHold();
    }, 500);
  });

  document.addEventListener("pointermove", (event) => {
    if(holdTarget && (Math.abs(event.clientX - holdTarget.x) > 10 || Math.abs(event.clientY - holdTarget.y) > 10)) cancelHold();
  });
  document.addEventListener("pointerup", cancelHold);
  document.addEventListener("pointercancel", cancelHold);
  document.addEventListener("click", (event) => {
    if(!event.target.closest("#messageActionMenu,.message-more-button")) PilingoSocial.closeMessageMenu();
  });
})();
