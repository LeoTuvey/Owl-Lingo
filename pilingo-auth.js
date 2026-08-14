const PilingoAuth = {
  accountKey: "pilingo_account_v1",
  ownerTokenKey: "pilingo_owner_panel_token_v1",
  accountsKey: "pilingo_accounts_v1",
  resetsKey: "pilingo_resets_v1",
  registerEndpoint: "/api/auth/register",
  loginEndpoint: "/api/auth/login",
  requestResetEndpoint: "/api/auth/request-reset",
  resetPasswordEndpoint: "/api/auth/reset-password",
  updateProfileEndpoint: "/api/profile/update",
  profilePhotoEndpoint: "/api/profile/photo",
  defaultAvatarValue: "/pilingo-icon-192.png",
  progressEndpoint: "/api/progress",
  progressSyncTimer: null,
  progressSyncSuppressed: false,
  progressKeys: [
    "course",
    "en-ku_xp",
    "en-ku_unlocked",
    "en-ku_course_progress_v2",
    "streak",
    "dailyXP",
    "pilingo_game1_completed_parts",
    "pilingo_game1_completed_sections",
    "pilingo_game1_completed_lessons",
    "pilingo_game1_completed_lesson_steps",
    "pilingo_game1_review_lesson_cursors",
    "pilingo_game1_lesson_statuses",
    "pilingo_game1_grades",
    "skill_0",
    "skill_1",
    "skill_2",
    "skill_3",
    "skill_4",
    "skill_5",
    "skill_6"
  ],

  captureLearningProgress(){
    const progress = {};
    this.progressKeys.forEach((key) => {
      const value = localStorage.getItem(key);
      if(value !== null) progress[key] = value;
    });
    return progress;
  },

  restoreLearningProgress(progress){
    this.progressSyncSuppressed = true;
    try {
      this.progressKeys.forEach((key) => localStorage.removeItem(key));
      if(!progress || typeof progress !== "object") return;
      this.progressKeys.forEach((key) => {
        if(typeof progress[key] === "string"){
          localStorage.setItem(key, progress[key]);
        }
      });
    } finally {
      this.progressSyncSuppressed = false;
    }
  },

  clearLearningProgress(){
    this.progressSyncSuppressed = true;
    try {
      this.progressKeys.forEach((key) => localStorage.removeItem(key));
    } finally {
      this.progressSyncSuppressed = false;
    }
  },

  hasLearningProgress(progress){
    return !!(progress && typeof progress === "object" && Object.keys(progress).length);
  },

  saveLocalLearningProgress(email, progress){
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if(!normalizedEmail) return;
    const accounts = this.loadLocalAccounts();
    const index = accounts.findIndex((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
    if(index < 0) return;
    accounts[index] = {
      ...accounts[index],
      learningProgress: {
        ...(accounts[index].learningProgress || {}),
        ...(progress || {})
      },
      progressUpdatedAt: new Date().toISOString()
    };
    this.saveLocalAccounts(accounts);
  },

  scheduleLearningProgressSync(){
    if(this.progressSyncSuppressed) return;
    clearTimeout(this.progressSyncTimer);
    this.progressSyncTimer = setTimeout(() => {
      this.syncLearningProgress().catch(() => {});
    }, 600);
  },

  async syncLearningProgress(){
    const account = this.loadAccount();
    if(!account?.email) return null;
    const progress = this.captureLearningProgress();
    if(!this.hasLearningProgress(progress)) return null;

    if(this.shouldUseLocalMode()){
      this.saveLocalLearningProgress(account.email, progress);
      this.updateAccount({ learningProgress: progress });
      return progress;
    }

    const dataOut = await this.postJson(this.progressEndpoint, {
      email: String(account.email || "").trim().toLowerCase(),
      progress
    });
    this.updateAccount({ learningProgress: dataOut.progress || progress });
    return dataOut.progress || progress;
  },

  loadAccount(){
    try {
      const raw = localStorage.getItem(this.accountKey);
      const account = raw ? JSON.parse(raw) : null;
      if(account && (!account.avatarValue || account.avatarValue === "🐯")){
        account.avatarType = "image";
        account.avatarValue = this.defaultAvatarValue;
        localStorage.setItem(this.accountKey, JSON.stringify(account));
      }
      return account;
    } catch(error) {
      return null;
    }
  },

  hasAccount(){
    const account = this.loadAccount();
    return !!(account && account.name && account.email);
  },

  saveAccount(account){
    if(!account) return null;
    localStorage.setItem(this.accountKey, JSON.stringify(account));
    localStorage.setItem("pilingo_current_user", account.name || "Learner");
    if(account.isOwner && account.ownerPanelToken){
      localStorage.setItem(this.ownerTokenKey, String(account.ownerPanelToken));
    } else {
      localStorage.removeItem(this.ownerTokenKey);
    }
    window.dispatchEvent(new CustomEvent("pilingo:account-changed", {
      detail: { account }
    }));
    return account;
  },

  clearAccount(){
    localStorage.removeItem(this.accountKey);
    localStorage.removeItem(this.ownerTokenKey);
    window.dispatchEvent(new CustomEvent("pilingo:account-changed", {
      detail: { account: null }
    }));
  },

  logout(){
    const account = this.loadAccount();
    if(account?.email){
      const progress = this.captureLearningProgress();
      if(this.shouldUseLocalMode()){
        this.saveLocalLearningProgress(account.email, progress);
      } else {
        this.syncLearningProgress().catch(() => {});
      }
      this.clearLearningProgress();
    }
    this.clearAccount();
    return account;
  },

  shouldUseLocalMode(){
    const host = String(window.location.hostname || "").toLowerCase();
    return host.endsWith("github.io");
  },

  loadLocalAccounts(){
    try {
      const raw = localStorage.getItem(this.accountsKey);
      const accounts = raw ? JSON.parse(raw) : [];
      if(!Array.isArray(accounts)) return [];
      let migrated = false;
      const normalized = accounts.map((account) => {
        if(account && (!account.avatarValue || account.avatarValue === "🐯")){
          migrated = true;
          return { ...account, avatarType: "image", avatarValue: this.defaultAvatarValue };
        }
        return account;
      });
      if(migrated) localStorage.setItem(this.accountsKey, JSON.stringify(normalized));
      return normalized;
    } catch(error) {
      return [];
    }
  },

  saveLocalAccounts(accounts){
    localStorage.setItem(this.accountsKey, JSON.stringify(accounts || []));
  },

  loadLocalResets(){
    try {
      const raw = localStorage.getItem(this.resetsKey);
      const resets = raw ? JSON.parse(raw) : [];
      return Array.isArray(resets) ? resets : [];
    } catch(error) {
      return [];
    }
  },

  saveLocalResets(resets){
    localStorage.setItem(this.resetsKey, JSON.stringify(resets || []));
  },

  createLocalAccount(data){
    const name = String(data?.name || "").trim();
    const email = String(data?.email || "").trim().toLowerCase();
    const phone = String(data?.phone || "").trim();
    const password = String(data?.password || "").trim();
    const location = String(data?.location || "").trim();

    if(!name || !email || !phone || !password){
      throw new Error("Please fill in name, email, phone number, and password.");
    }

    const accounts = this.loadLocalAccounts();
    const exists = accounts.some((account) => String(account.email || "").trim().toLowerCase() === email);
    if(exists){
      throw new Error("This email is already in use.");
    }

    const account = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      email,
      phone,
      password,
      location,
      createdAt: new Date().toISOString(),
      avatarType: "image",
      avatarValue: this.defaultAvatarValue,
      bio: "",
      statusMessage: "Ready to learn",
      settings: {
        profileVisibility: "public",
        studyReminders: true,
        soundEffects: true,
        pushNotificationsEnabled: true,
        dailyReminders: true,
        streakReminders: true,
        newLessonReminders: true,
        notificationTime: "18:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      },
      learningProgress: this.captureLearningProgress()
    };

    accounts.push(account);
    this.saveLocalAccounts(accounts);
    return this.saveAccount({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      location: account.location,
      createdAt: account.createdAt,
      avatarType: account.avatarType,
      avatarValue: account.avatarValue,
      bio: account.bio,
      statusMessage: account.statusMessage,
      settings: account.settings,
      learningProgress: account.learningProgress || {}
    });
  },

  loginLocalAccount(data){
    const email = String(data?.email || "").trim().toLowerCase();
    const password = String(data?.password || "").trim();
    const accounts = this.loadLocalAccounts();
    const account = accounts.find((item) => String(item.email || "").trim().toLowerCase() === email);

    if(!account){
      throw new Error("No account was found for this email. Please sign up first.");
    }
    if(String(account.password || "") !== password){
      throw new Error("Wrong password. Please try again.");
    }

    this.restoreLearningProgress(account.learningProgress || {});
    return this.saveAccount({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      location: account.location || "",
      createdAt: account.createdAt,
      avatarType: account.avatarType || "emoji",
      avatarValue: account.avatarValue || "🐯",
      bio: account.bio || "",
      statusMessage: account.statusMessage || "",
      settings: account.settings || {
        profileVisibility: "public",
        studyReminders: true,
        soundEffects: true,
        pushNotificationsEnabled: true,
        dailyReminders: true,
        streakReminders: true,
        newLessonReminders: true,
        notificationTime: "18:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      },
      learningProgress: account.learningProgress || {}
    });
  },

  requestLocalPasswordReset(email){
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if(!normalizedEmail){
      throw new Error("Please enter the account email first.");
    }

    const accounts = this.loadLocalAccounts();
    const account = accounts.find((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
    if(!account){
      throw new Error("No account was found for this email. Please sign up first.");
    }

    const resets = this.loadLocalResets().filter((item) => item.email !== normalizedEmail);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resets.push({
      email: normalizedEmail,
      code,
      expiresAt: Date.now() + (15 * 60 * 1000)
    });
    this.saveLocalResets(resets);
    return { code };
  },

  resetLocalPassword(email, code, newPassword){
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedCode = String(code || "").trim();
    const password = String(newPassword || "").trim();
    if(!normalizedEmail || !normalizedCode || !password){
      throw new Error("Please enter your email, reset code, and new password.");
    }

    const resets = this.loadLocalResets();
    const reset = resets.find((item) =>
      item.email === normalizedEmail &&
      item.code === normalizedCode &&
      Number(item.expiresAt || 0) > Date.now()
    );
    if(!reset){
      throw new Error("The code is wrong or expired.");
    }

    const accounts = this.loadLocalAccounts();
    const index = accounts.findIndex((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
    if(index < 0){
      throw new Error("No account was found for this email. Please sign up first.");
    }

    accounts[index].password = password;
    this.saveLocalAccounts(accounts);
    this.saveLocalResets(resets.filter((item) => !(item.email === normalizedEmail && item.code === normalizedCode)));

    return this.saveAccount({
      id: accounts[index].id,
      name: accounts[index].name,
      email: accounts[index].email,
      phone: accounts[index].phone,
      location: accounts[index].location || "",
      createdAt: accounts[index].createdAt,
      avatarType: accounts[index].avatarType || "emoji",
      avatarValue: accounts[index].avatarValue || "🐯",
      bio: accounts[index].bio || "",
      statusMessage: accounts[index].statusMessage || "",
      settings: accounts[index].settings || {
        profileVisibility: "public",
        studyReminders: true,
        soundEffects: true,
        pushNotificationsEnabled: true,
        dailyReminders: true,
        streakReminders: true,
        newLessonReminders: true,
        notificationTime: "18:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      }
    });
  },

  buildUrl(path){
    try {
      return new URL(path, this.getPreferredApiOrigin()).toString();
    } catch(error) {
      return path;
    }
  },

  getPreferredApiOrigin(){
    if(String(window.location.hostname || "").endsWith("github.io")){
      return "https://pilingo.onrender.com";
    }
    const origin = String(window.location.origin || "").trim();
    if(origin) return origin;

    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname || "localhost";
    const port = window.location.port || "3000";
    return `${protocol}//${host}${port ? `:${port}` : ""}`;
  },

  getApiOrigins(){
    const host = String(window.location.hostname || "").trim();
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const origins = [];

    const addOrigin = (value) => {
      const normalized = String(value || "").trim();
      if(!normalized || origins.includes(normalized)) return;
      origins.push(normalized);
    };

    addOrigin(this.getPreferredApiOrigin());

    if(host && protocol === "https:"){
      if(host.startsWith("www.")){
        addOrigin(`https://${host.slice(4)}`);
      } else if(host.includes(".")) {
        addOrigin(`https://www.${host}`);
      }
    }

    if(host && host !== "localhost" && host !== "127.0.0.1"){
      addOrigin(`${protocol}//${host}:3000`);
    }

    addOrigin("https://pilingo.onrender.com");
    addOrigin("http://localhost:3000");
    addOrigin("http://127.0.0.1:3000");

    return origins;
  },

  postJsonWithXhr(url, payload, origin){
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const requestUrl = origin
        ? new URL(url, origin).toString()
        : this.buildUrl(url);

      request.open("POST", requestUrl, true);
      request.setRequestHeader("Content-Type", "application/json");

      request.onreadystatechange = () => {
        if(request.readyState !== 4) return;

        let data = {};
        try {
          data = request.responseText ? JSON.parse(request.responseText) : {};
        } catch(error) {
          data = {};
        }

        if(request.status >= 200 && request.status < 300 && data.ok) {
          resolve(data);
          return;
        }

        reject(new Error(data.error || `Request failed (${request.status || "unknown"}).`));
      };

      request.onerror = () => {
        reject(new Error("The app could not reach the server. Please refresh the page and try again."));
      };

      request.send(JSON.stringify(payload || {}));
    });
  },

  async postJson(url, payload){
    const origins = this.getApiOrigins();
    let lastError = null;

    for(const origin of origins){
      try {
        const response = await fetch(new URL(url, origin).toString(), {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          cache:"no-store",
          body: JSON.stringify(payload || {})
        });

        const data = await response.json().catch(() => ({}));
        if(!response.ok || !data.ok){
          throw Object.assign(new Error(data.error || `Request failed (${response.status || "unknown"}).`), {
            pilingoHttpError: true
          });
        }
        return data;
      } catch(error) {
        if(error?.pilingoHttpError){
          throw error;
        }
        lastError = error;

        try {
          return await this.postJsonWithXhr(url, payload, origin);
        } catch(xhrError) {
          lastError = xhrError;
        }
      }
    }

    throw lastError || new Error("The app could not reach the server. Please refresh the page and try again.");
  },

  async registerAccount(data){
    if(this.shouldUseLocalMode()){
      return this.createLocalAccount(data);
    }
    const payload = {
      name: String(data?.name || "").trim(),
      email: String(data?.email || "").trim().toLowerCase(),
      phone: String(data?.phone || "").trim(),
      password: String(data?.password || "").trim(),
      location: String(data?.location || "").trim()
    };
    const dataOut = await this.postJson(this.registerEndpoint, payload);
    this.clearLearningProgress();
    return this.saveAccount(dataOut.account);
  },

  async loginAccount(data){
    if(this.shouldUseLocalMode()){
      return this.loginLocalAccount(data);
    }
    const payload = {
      email: String(data?.email || "").trim().toLowerCase(),
      password: String(data?.password || "").trim()
    };
    const dataOut = await this.postJson(this.loginEndpoint, payload);
    const serverProgress = dataOut.account?.learningProgress || {};
    this.restoreLearningProgress(serverProgress);
    const account = this.saveAccount({
      ...dataOut.account,
      learningProgress: serverProgress
    });
    return account;
  },

  async requestPasswordReset(email){
    if(this.shouldUseLocalMode()){
      return this.requestLocalPasswordReset(email);
    }
    const payload = {
      email: String(email || "").trim().toLowerCase()
    };
    return await this.postJson(this.requestResetEndpoint, payload);
  },

  async resetPassword(email, code, newPassword){
    if(this.shouldUseLocalMode()){
      return this.resetLocalPassword(email, code, newPassword);
    }
    const payload = {
      email: String(email || "").trim().toLowerCase(),
      code: String(code || "").trim(),
      newPassword: String(newPassword || "").trim()
    };
    const dataOut = await this.postJson(this.resetPasswordEndpoint, payload);
    return this.saveAccount(dataOut.account);
  },

  async updateProfile(data){
    const current = this.loadAccount();
    if(!current?.email){
      throw new Error("Please log in first.");
    }

    const payload = {
      email: String(current.email || "").trim().toLowerCase(),
      name: String(data?.name ?? current.name ?? "").trim(),
      avatarType: data?.avatarType === "image" ? "image" : "emoji",
      avatarValue: String(data?.avatarValue ?? current.avatarValue ?? "🐯").trim(),
      bio: String(data?.bio ?? current.bio ?? "").trim(),
      statusMessage: String(data?.statusMessage ?? current.statusMessage ?? "").trim(),
      settings: data?.settings || current.settings || {}
    };

    if(this.shouldUseLocalMode()){
      const accounts = this.loadLocalAccounts();
      const index = accounts.findIndex((item) => String(item.email || "").trim().toLowerCase() === payload.email);
      if(index < 0){
        throw new Error("No account was found for this email.");
      }
      accounts[index] = {
        ...accounts[index],
        name: payload.name || accounts[index].name,
        avatarType: payload.avatarType,
        avatarValue: payload.avatarValue || "🐯",
        bio: payload.bio,
        statusMessage: payload.statusMessage,
        settings: {
          profileVisibility: payload.settings?.profileVisibility === "private" ? "private" : "public",
          studyReminders: payload.settings?.studyReminders !== false,
          soundEffects: payload.settings?.soundEffects !== false,
          pushNotificationsEnabled: payload.settings?.pushNotificationsEnabled !== false,
          dailyReminders: payload.settings?.dailyReminders !== false,
          streakReminders: payload.settings?.streakReminders !== false,
          newLessonReminders: payload.settings?.newLessonReminders !== false,
          notificationTime: /^\d{2}:\d{2}$/.test(String(payload.settings?.notificationTime || "")) ? String(payload.settings.notificationTime) : "18:00",
          timezone: String(payload.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
        }
      };
      this.saveLocalAccounts(accounts);
      return this.saveAccount({
        ...current,
        ...accounts[index]
      });
    }

    const dataOut = await this.postJson(this.updateProfileEndpoint, payload);
    return this.saveAccount(dataOut.account);
  },

  async uploadProfilePhoto(file){
    const current = this.loadAccount();
    if(!current?.email) throw new Error("Please log in first.");
    if(!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)){
      throw new Error("Please choose a JPEG, PNG, or WebP photo.");
    }
    if(file.size > 5_000_000) throw new Error("Photos must be smaller than 5 MB.");

    if(this.shouldUseLocalMode()){
      const avatarValue = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read this photo."));
        reader.readAsDataURL(file);
      });
      return this.updateProfile({ ...current, avatarType: "image", avatarValue });
    }

    const response = await fetch(`${this.profilePhotoEndpoint}?email=${encodeURIComponent(current.email)}`, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file
    });
    const dataOut = await response.json().catch(() => ({}));
    if(!response.ok || !dataOut?.ok) throw new Error(dataOut?.error || "Could not upload this photo.");
    return this.saveAccount(dataOut.account);
  },

  updateAccount(patch){
    const current = this.loadAccount();
    if(!current) return null;
    const next = { ...current, ...(patch || {}) };
    localStorage.setItem(this.accountKey, JSON.stringify(next));
    return next;
  },

  requireAccount(){
    const path = window.location.pathname || "";
    const onIndex = path.endsWith("index.html") || path.endsWith("/") || path === "";
    const onSplash = path.endsWith("splash.html");

    if(this.hasAccount() || onIndex || onSplash) return true;

    window.location.href = "index.html";
    return false;
  },

  isOwner(){
    const account = this.loadAccount();
    return !!account?.isOwner;
  },

  getOwnerPanelToken(){
    return localStorage.getItem(this.ownerTokenKey) || "";
  }
};

window.PilingoAuth = PilingoAuth;

if(!window.__pilingoProgressStorageHook){
  window.__pilingoProgressStorageHook = true;
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value){
    originalSetItem.call(this, key, value);
    if(this === localStorage && PilingoAuth.progressKeys.includes(String(key))){
      PilingoAuth.scheduleLearningProgressSync();
    }
  };
}

window.addEventListener("pagehide", () => {
  PilingoAuth.syncLearningProgress().catch(() => {});
});
