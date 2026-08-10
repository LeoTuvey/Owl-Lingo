const PilingoNotify = {
  endpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/track" : "/api/track",
  listEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/notifications" : "/api/notifications",
  leaderboardEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/leaderboard" : "/api/leaderboard",
  ownerStudentsEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/owner/students" : "/api/owner/students",
  ownerVisitsEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/owner/visits" : "/api/owner/visits",
  presenceEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/presence" : "/api/presence",
  statsEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/student-stats" : "/api/student-stats",
  settingsEndpoint: location.hostname.endsWith("github.io") ? "https://pilingo.onrender.com/api/app-settings" : "/api/app-settings",
  pollTimer: null,
  lastSeenEventId: null,
  lastCompetitionMessage: "",
  settingsCache: null,
  presenceTimer: null,
  presenceEmail: "",

  canUseServer(){
    return location.protocol.startsWith("http");
  },

  canViewOwnerNotifications(){
    return !!window.PilingoAuth?.isOwner?.();
  },

  ownerHeaders(){
    const token = window.PilingoAuth?.getOwnerPanelToken?.() || "";
    return token ? { "X-Pilingo-Owner-Token": token } : {};
  },

  currentStudent(){
    const account = window.PilingoAuth?.loadAccount?.() || null;
    return {
      name: account?.name || localStorage.getItem("pilingo_current_user") || "Unknown student",
      email: account?.email || "",
      phone: account?.phone || "",
      location: account?.location || "",
      hasAccount: !!(account?.email && account?.phone)
    };
  },

  async sendPresence(online, emailOverride){
    const student = this.currentStudent();
    const email = String(emailOverride || student.email || "").trim().toLowerCase();
    if(!this.canUseServer() || !email) return false;
    try {
      const response = await fetch(this.presenceEndpoint, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          email,
          online: online !== false,
          page: location.pathname.split("/").pop() || "index.html"
        }),
        keepalive: true
      });
      return response.ok;
    } catch(error) {
      return false;
    }
  },

  startPresence(){
    if(this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceEmail = String(this.currentStudent().email || "").trim().toLowerCase();
    if(!this.presenceEmail) return;
    this.sendPresence(document.visibilityState !== "hidden");
    this.presenceTimer = setInterval(() => {
      if(document.visibilityState !== "hidden") this.sendPresence(true);
    }, 25000);
  },

  stopPresence(){
    if(this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = null;
    const email = this.presenceEmail;
    this.presenceEmail = "";
    this.sendPresence(false, email);
  },

  defaultVisibilitySettings(){
    return {
      showLearnersList: true,
      showRankingList: true
    };
  },

  async fetchVisibilitySettings(force){
    if(!this.canUseServer()) {
      return this.settingsCache || this.defaultVisibilitySettings();
    }

    if(this.settingsCache && !force){
      return this.settingsCache;
    }

    try {
      const response = await fetch(this.settingsEndpoint, { cache:"no-store" });
      const data = await response.json();
      const settings = {
        ...this.defaultVisibilitySettings(),
        ...(data?.settings || {})
      };
      this.settingsCache = settings;
      return settings;
    } catch(error) {
      return this.settingsCache || this.defaultVisibilitySettings();
    }
  },

  async saveVisibilitySettings(nextSettings){
    if(!this.canUseServer() || !this.canViewOwnerNotifications()) {
      throw new Error("Only the owner can change app visibility.");
    }

    const response = await fetch(this.settingsEndpoint, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...this.ownerHeaders()
      },
      body:JSON.stringify(nextSettings || {})
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data?.ok){
      throw new Error(data?.error || "Could not save app visibility.");
    }
    this.settingsCache = {
      ...this.defaultVisibilitySettings(),
      ...(data.settings || {})
    };
    return this.settingsCache;
  },

  canShowLearnersList(settings){
    if(this.canViewOwnerNotifications()) return true;
    return settings?.showLearnersList !== false;
  },

  canShowRankingList(settings){
    if(this.canViewOwnerNotifications()) return true;
    return settings?.showRankingList !== false;
  },

  async track(type, label, details){
    if(!this.canUseServer()) return;

    const student = this.currentStudent();
    const page = location.pathname.split("/").pop() || "index.html";

    if(type === "page_open"){
      const dedupeKey = `pilingo_track_${page}_${label || type}`;
      const lastSentAt = Number(sessionStorage.getItem(dedupeKey) || 0);
      if(Date.now() - lastSentAt < 10000) return;
      sessionStorage.setItem(dedupeKey, String(Date.now()));
    }

    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type || "activity",
          label: label || "",
          page,
          studentName: student.name,
          studentEmail: student.email,
          studentPhone: student.phone,
          studentLocation: student.location,
          details: details || {}
        })
      });
    } catch(error) {
      // stay quiet if the local server is offline
    }
  },

  async submitStudentStats(stats){
    if(!this.canUseServer()) return null;

    const student = this.currentStudent();
    if(!student.hasAccount) return null;

    try {
      const response = await fetch(this.statsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: student.name,
          studentEmail: student.email,
          studentPhone: student.phone,
          studentLocation: student.location,
          ...(stats || {})
        })
      });
      const data = await response.json();
      return data.student || null;
    } catch(error) {
      return null;
    }
  },

  async fetchNotifications(){
    if(!this.canUseServer() || !this.canViewOwnerNotifications()) return [];

    try {
      const response = await fetch(this.listEndpoint, {
        cache:"no-store",
        headers: this.ownerHeaders()
      });
      if(!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.events) ? data.events : [];
    } catch(error) {
      return [];
    }
  },

  async fetchLeaderboard(){
    if(!this.canUseServer()) return [];

    try {
      const response = await fetch(this.leaderboardEndpoint, { cache:"no-store" });
      const data = await response.json();
      return Array.isArray(data.students) ? data.students : [];
    } catch(error) {
      return [];
    }
  },

  async fetchOwnerStudents(){
    if(!this.canUseServer() || !this.canViewOwnerNotifications()) return [];

    try {
      const response = await fetch(this.ownerStudentsEndpoint, {
        cache:"no-store",
        headers: this.ownerHeaders()
      });
      if(!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.students) ? data.students : [];
    } catch(error) {
      return [];
    }
  },

  async fetchOwnerVisits(){
    if(!this.canUseServer() || !this.canViewOwnerNotifications()) return null;

    try {
      const response = await fetch(this.ownerVisitsEndpoint, {
        cache:"no-store",
        headers: this.ownerHeaders()
      });
      if(!response.ok) return null;
      return await response.json();
    } catch(error) {
      return null;
    }
  },

  renderVisitCountries(summary, target){
    if(!target) return;
    const countries = Array.isArray(summary?.countries)
      ? summary.countries.filter((item) => item?.name && item.name !== "Local")
      : [];

    if(!countries.length){
      target.innerHTML = `
        <div class="notify-section-label">Visitor countries</div>
        <div class="notify-item">
          <strong>No country data yet</strong>
          <span>New live visits will appear here after deployment.</span>
        </div>
      `;
      return;
    }

    target.innerHTML = `
      <div class="notify-section-label">Visitor countries</div>
      <div class="notify-item">
        <strong>${Number(summary?.totalVisits || 0)} tracked visits</strong>
        <span>${countries.map((item) => `${escapeHtml(item.name)}: ${Number(item.visits || 0)}`).join(" • ")}</span>
      </div>
    `;
  },

  async renderInto(listId, statusId){
    const list = document.getElementById(listId);
    const status = document.getElementById(statusId);
    const liveList = document.getElementById("notifyLive");
    if(!list) return;

    if(!this.canViewOwnerNotifications()){
      list.innerHTML = `
        <div class="notify-item">
          <strong>Owner only</strong>
          <span>This activity panel is visible only for the owner account.</span>
        </div>
      `;
      if(status) status.innerText = "Private";
      return;
    }

    if(!this.canUseServer()) {
      list.innerHTML = `
        <div class="notify-item">
          <strong>Server not active</strong>
          <span>Open the app through the local server to receive student notifications.</span>
        </div>
      `;
      if(status) status.innerText = "Offline";
      return;
    }

    const [events, visitSummary] = await Promise.all([
      this.fetchNotifications(),
      this.fetchOwnerVisits()
    ]);
    this.renderVisitCountries(visitSummary, document.getElementById("notifyCountries"));

    if(status) {
      if(!("Notification" in window)) {
        status.innerText = events.length ? "Live" : "Waiting";
      } else if(Notification.permission === "granted") {
        status.innerText = events.length ? "Live + Phone" : "Phone Ready";
      } else if(Notification.permission === "denied") {
        status.innerText = "Blocked";
      } else {
        status.innerText = events.length ? "Live" : "Waiting";
      }
    }

    if(!events.length) {
      if(liveList) {
        liveList.innerHTML = `
          <div class="notify-item">
            <strong>No students live right now</strong>
            <span>Students who are active in the app will appear here with their email.</span>
          </div>
        `;
      }
      list.innerHTML = `
        <div class="notify-item">
          <strong>No student activity yet</strong>
          <span>Notifications will appear here when students open the app or lessons.</span>
        </div>
      `;
      return;
    }

    const visibleEvents = this.selectVisibleEvents(events);
    const ownerStudents = await this.fetchOwnerStudents();
    this.renderLiveStudents(events, ownerStudents, liveList, status);

    const finalEvents = visibleEvents.length
      ? visibleEvents
      : events.filter((event) => {
          const name = String(event?.studentName || "").trim().toLowerCase();
          const email = String(event?.studentEmail || "").trim();
          const phone = String(event?.studentPhone || "").trim();
          return !!(email || phone || (name && name !== "unknown student"));
        }).slice(0, 4);

    if(!finalEvents.length) {
      list.innerHTML = `
        <div class="notify-item">
          <strong>Student activity is live</strong>
          <span>New logins, new accounts, and lesson activity will appear here.</span>
        </div>
      `;
      this.maybeShowBrowserNotification(events[0]);
      return;
    }

    list.innerHTML = finalEvents.map((event) => `
      <div class="notify-item">
        <strong>${escapeHtml(event.studentName || "Student")} • ${escapeHtml(this.displayLabel(event))}</strong>
        <span>${escapeHtml(event.studentEmail || "No email")} • ${escapeHtml(event.studentPhone || "No phone")}</span>
        <span>${escapeHtml(event.studentLocation || "Location unavailable")}</span>
        <span>${escapeHtml(event.page || "")} • ${formatWhen(event.createdAt)}</span>
      </div>
    `).join("");

    this.maybeShowBrowserNotification(finalEvents[0] || events[0]);
  },

  renderLiveStudents(events, ownerStudents, liveList, status){
    if(!liveList) return;

    const now = Date.now();
    const liveStudents = [];
    const recentStudents = [];
    const registeredStudents = [];
    const seen = new Set();

    for(const event of events){
      const createdAt = new Date(event?.createdAt || 0).getTime();
      const email = String(event?.studentEmail || "").trim();
      const phone = String(event?.studentPhone || "").trim();
      const name = String(event?.studentName || "").trim();
      const key = (email || phone || name).toLowerCase();
      if(!key || key === "unknown student") continue;
      if(seen.has(key)) continue;
      seen.add(key);

      const studentCard = {
        name: name || "Student",
        email: email || "No email",
        phone: phone || "No phone",
        action: this.displayLabel(event),
        at: event?.createdAt || ""
      };

      if(createdAt && now - createdAt <= 24 * 60 * 60 * 1000) {
        recentStudents.push(studentCard);
      }

      if(liveStudents.length >= 4 && recentStudents.length >= 4) break;
    }

    for(const student of ownerStudents || []){
      const email = String(student?.email || "").trim();
      const phone = String(student?.phone || "").trim();
      const name = String(student?.name || "").trim();
      const key = (email || phone || name).toLowerCase();
      if(!key || key === "unknown student") continue;

      const studentCard = {
        name: name || "Student",
        email: email || "No email",
        phone: phone || "No phone",
        action: String(student?.latestAction || "Created account"),
        at: String(student?.lastSeenAt || student?.createdAt || ""),
        isNew: !!student?.createdAt && (!student?.lastSeenAt || student.lastSeenAt === student.createdAt),
        online: student?.online === true,
        page: String(student?.lastPresencePage || "")
      };

      if(studentCard.online){
        liveStudents.push(studentCard);
      }
      registeredStudents.push(studentCard);

      if(registeredStudents.length >= 20) break;
    }

    if(status) {
      if(liveStudents.length) {
        status.innerText = `Live now: ${liveStudents.length}`;
      } else if(recentStudents.length) {
        status.innerText = `Recent students: ${recentStudents.length}`;
      } else if(registeredStudents.length) {
        status.innerText = `Students: ${registeredStudents.length}`;
      }
    }

    const studentsToShow = liveStudents.length
      ? liveStudents
      : (recentStudents.length ? recentStudents.slice(0, 8) : registeredStudents.slice(0, 20));
    const title = liveStudents.length ? "Live now" : (recentStudents.length ? "Recently seen" : "Registered students");
    const detail = liveStudents.length
      ? "Students active in the app right now."
      : (recentStudents.length
        ? "No one is live right now. These students used the app recently."
        : "These student accounts are already registered in Pilingo.");

    if(!studentsToShow.length) {
      liveList.innerHTML = `
        <div class="notify-item">
          <strong>No students live right now</strong>
          <span>Students who use the app with their email will appear here.</span>
        </div>
      `;
      return;
    }

    liveList.innerHTML = `
      <div class="notify-section-label">${title}</div>
      <div class="notify-item">
        <strong>${title}</strong>
        <span>${detail}</span>
      </div>
    ` + studentsToShow.map((student) => `
      <div class="live-student-card">
        <strong>${escapeHtml(student.name)}</strong>
        <span>${escapeHtml(student.email)} • ${escapeHtml(student.phone)}</span>
        <span>${student.online ? "🟢 Online" : (student.isNew ? "New student" : "Latest")}: ${escapeHtml(student.online ? (student.page || "Using Pilingo") : student.action)}</span>
        <span>${student.online ? "Active now" : formatWhen(student.at)}</span>
      </div>
    `).join("");
  },

  startPolling(listId, statusId){
    if(this.pollTimer) clearInterval(this.pollTimer);
    this.renderInto(listId, statusId);
    this.pollTimer = setInterval(() => this.renderInto(listId, statusId), 12000);
  },

  async renderLeaderboard(listId){
    const list = document.getElementById(listId);
    if(!list) return;
    const settings = await this.fetchVisibilitySettings();
    const card = list.closest(".leaderboard-card");

    if(!this.canShowRankingList(settings)){
      if(card) card.hidden = true;
      return;
    }

    if(card) card.hidden = false;

    const students = await this.fetchLeaderboard();

    if(!students.length) {
      list.innerHTML = `
        <div class="leader-item">
          <strong>No rankings yet</strong>
          <span>Student rankings will appear here after learners start studying.</span>
        </div>
      `;
      return;
    }

    const current = this.currentStudent();
    const currentKey = (current.email || current.name || "").trim().toLowerCase();
    const currentIndex = students.findIndex((student) => {
      const studentKey = String(student.email || student.name || "").trim().toLowerCase();
      return studentKey === currentKey;
    });
    const leader = students[0] || null;
    const competition = this.buildCompetitionState(students, currentIndex, leader);
    const currentRank = currentIndex >= 0 ? currentIndex + 1 : null;
    const league = this.getLeagueTheme(students, currentRank);
    const topCount = Math.min(3, students.length);
    const dangerCount = students.length > 5 ? Math.min(2, students.length - topCount) : 0;
    const currentStudent = currentIndex >= 0 ? students[currentIndex] : null;
    const standings = students.slice();

    list.innerHTML = `
      <div class="league-hero ${escapeHtml(league.slug)}">
        <div class="league-badge">${escapeHtml(league.icon)} ${escapeHtml(league.name)}</div>
        <div class="league-title">${escapeHtml(competition.title)}</div>
        <div class="league-body">${escapeHtml(competition.body)}</div>
        <div class="league-rules">
          <span class="league-rule promote">Top ${topCount} go up</span>
          <span class="league-rule safe">Middle stay safe</span>
          ${dangerCount ? `<span class="league-rule danger">Bottom ${dangerCount} go down</span>` : ""}
          <span class="league-rule safe">${students.length} learners in this league</span>
        </div>
      </div>
      <div class="league-summary-card">
        <div class="league-summary-label">Your place</div>
        <div class="league-summary-rank">${currentRank ? `#${currentRank}` : "-"}</div>
        <div class="league-summary-name">${escapeHtml(currentStudent?.name || current?.name || "Student")}</div>
        <div class="league-summary-meta">
          XP ${currentStudent?.xp || 0} • Grade ${Math.round(currentStudent?.averageGrade || 0)}% • Sections ${currentStudent?.completedSections || 0}
        </div>
      </div>
      <div class="leader-section-label">League Standings</div>
      <div class="league-standings">
        ${standings.map((student, index) => {
          const rank = index + 1;
          const isCurrent = rank === currentRank;
          const zoneClass = rank <= topCount
            ? "promotion"
            : (dangerCount && rank > standings.length - dangerCount ? "danger" : "safe");
          const zoneLabel = rank <= topCount
            ? "Promote"
            : (dangerCount && rank > standings.length - dangerCount ? "Drop zone" : "Safe");

          return `
            <div class="league-row ${zoneClass} ${isCurrent ? "current" : ""}">
              <div class="league-rank-wrap">
                <div class="league-rank">#${rank}</div>
                <div class="league-zone-tag">${zoneLabel}</div>
              </div>
              <div class="league-student">
                <strong>${escapeHtml(student.name || "Student")}${isCurrent ? ' <span class="league-you">YOU</span>' : ""}</strong>
                <span>XP ${student.xp || 0} • Grade ${Math.round(student.averageGrade || 0)}% • Sections ${student.completedSections || 0}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    this.maybeShowCompetitionNotification(competition);
  },

  startLeaderboardPolling(listId){
    this.renderLeaderboard(listId);
    setInterval(() => this.renderLeaderboard(listId), 15000);
  },

  sendTestNotification(){
    if(!("Notification" in window)) return false;
    if(Notification.permission !== "granted") return false;

    new Notification("Pilingo phone notifications", {
      body: "Phone notifications are working on this device."
    });
    return true;
  },

  maybeShowBrowserNotification(event){
    if(!event || !("Notification" in window)) return;
    if(this.lastSeenEventId === null) {
      this.lastSeenEventId = event.id;
      return;
    }
    if(this.lastSeenEventId === event.id) return;

    this.lastSeenEventId = event.id;

    if(Notification.permission === "granted") {
      new Notification("Pilingo student activity", {
        body: `${event.studentName || "Student"} • ${this.displayLabel(event)}`
      });
      return;
    }
  },
  selectVisibleEvents(events){
    const uniqueEvents = [];
    const meaningfulStudents = new Set();

    for(const event of events){
      const type = String(event?.type || "").trim();
      const label = String(event?.label || "").trim();
      const page = String(event?.page || "").trim();
      const email = String(event?.studentEmail || "").trim().toLowerCase();
      const phone = String(event?.studentPhone || "").trim();
      const name = String(event?.studentName || "").trim();
      const studentKey = email || phone || name.toLowerCase();
      const createdAt = new Date(event?.createdAt || 0).getTime();
      const isUnknown = !email && !phone && (!name || name.toLowerCase() === "unknown student");
      const isHomeOpen = type === "page_open" && page === "index.html";
      const isAccountCreated = type === "account_created";
      const isLogin = type === "account_login";
      const isLessonOpen = type === "page_open" && page !== "index.html";
      const isLearningStart = type === "learning_started";
      const isImportant = isAccountCreated || isLogin || isLessonOpen || isLearningStart;

      if(isUnknown && isHomeOpen) continue;
      if(isHomeOpen && studentKey && meaningfulStudents.has(studentKey)) continue;

      const signature = [
        studentKey || "student",
        type || "activity",
        label || "",
        page || ""
      ].join("|");
      const alreadyShown = uniqueEvents.some((item) => {
        const sameSignature = item.signature === signature;
        const sameWindow = Math.abs(item.createdAt - createdAt) < 30000;
        return sameSignature && sameWindow;
      });
      if(alreadyShown) continue;

      uniqueEvents.push({ signature, createdAt, event });
      if(studentKey && isImportant) meaningfulStudents.add(studentKey);
      if(uniqueEvents.length >= 8) break;
    }

    return uniqueEvents.map((item) => item.event);
  },
  displayLabel(event){
    const type = String(event?.type || "").trim();
    if(type === "account_created") return "New student account";
    if(type === "account_login") return "Logged in";
    if(type === "account_logout") return "Logged out";
    if(type === "learning_started") return "Started learning";
    return String(event?.label || event?.type || "Activity");
  },
  buildCompetitionState(students, currentIndex, leader){
    const stateKey = "pilingo_competition_state_v1";
    let previous = {};

    try {
      previous = JSON.parse(localStorage.getItem(stateKey) || "{}");
    } catch(error) {
      previous = {};
    }

    const leaderName = leader?.name || "A student";
    const currentRank = currentIndex >= 0 ? currentIndex + 1 : null;
    const previousRank = Number(previous.rank || 0) || null;
    const previousLeader = previous.leaderName || "";
    let title = "Competition is live";
    let body = leader
      ? `${leaderName} is on top right now. Keep learning and catch them.`
      : "Students will appear here after they start learning.";

    if(currentRank === 1) {
      title = "You are #1";
      body = "Everyone is chasing you now. Keep learning and stay on top.";
    } else if(currentRank && previousRank && currentRank > previousRank) {
      title = "Someone passed you";
      body = `${leaderName} left you behind. Win your place back with more study.`;
    } else if(currentRank && previousRank && currentRank < previousRank) {
      title = "You climbed higher";
      body = `Great work. You moved up to #${currentRank}. Keep pushing upward.`;
    } else if(currentRank && leader) {
      title = "Top student alert";
      body = `${leaderName} is #1 now. Do not let them stay there too long.`;
    } else if(leader) {
      title = "Top student alert";
      body = `${leaderName} is leading the ranking. Other students can chase the top now.`;
    }

    localStorage.setItem(stateKey, JSON.stringify({
      rank: currentRank || 0,
      leaderName
    }));

    return {
      title,
      body,
      notify: previousLeader && previousLeader !== leaderName
        ? `${leaderName} reached the top of the ranking.`
        : (currentRank && previousRank && currentRank > previousRank
          ? `${leaderName} passed you in the ranking.`
          : "")
    };
  },

  getLeagueTheme(students, currentRank){
    const topXp = Number(students?.[0]?.xp || 0);
    const tiers = [
      { min: 2000, name: "Diamond League", icon: "💎", slug: "diamond" },
      { min: 1200, name: "Obsidian League", icon: "🖤", slug: "obsidian" },
      { min: 700, name: "Pearl League", icon: "🤍", slug: "pearl" },
      { min: 350, name: "Emerald League", icon: "💚", slug: "emerald" },
      { min: 150, name: "Gold League", icon: "🥇", slug: "gold" },
      { min: 50, name: "Silver League", icon: "🥈", slug: "silver" },
      { min: 0, name: "Bronze League", icon: "🥉", slug: "bronze" }
    ];

    const tier = tiers.find((item) => topXp >= item.min) || tiers[tiers.length - 1];
    const suffix = currentRank === 1
      ? "You are leading this league."
      : currentRank
        ? `You are fighting from #${currentRank}.`
        : "Join the race and climb.";

    return {
      ...tier,
      message: suffix
    };
  },

  maybeShowCompetitionNotification(competition){
    if(!competition || !competition.notify) return;
    if(this.lastCompetitionMessage === competition.notify) return;
    this.lastCompetitionMessage = competition.notify;

    if("Notification" in window && Notification.permission === "granted") {
      new Notification("Pilingo competition", {
        body: competition.notify
      });
    }
  }
};

function formatWhen(iso){
  if(!iso) return "Unknown time";
  const date = new Date(iso);
  return date.toLocaleString();
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.PilingoNotify = PilingoNotify;

PilingoNotify.startPresence();

window.addEventListener("pilingo:account-changed", (event) => {
  if(event?.detail?.account?.email){
    PilingoNotify.startPresence();
  } else {
    PilingoNotify.stopPresence();
  }
});

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden"){
    PilingoNotify.sendPresence(false, PilingoNotify.presenceEmail);
  } else {
    PilingoNotify.startPresence();
  }
});

window.addEventListener("pagehide", () => {
  PilingoNotify.stopPresence();
});
