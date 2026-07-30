(function(){
  const installButtonId = "installApp";
  const usageKey = "pilingo_push_usage_count_v1";
  const promptedKey = "pilingo_push_prompted_v1";
  const pushStateKey = "pilingo_push_state_v1";
  const swUrl = "sw.js?v=11";
  const endpoints = {
    publicKey: "/api/push/public-key",
    subscribe: "/api/push/subscribe",
    unsubscribe: "/api/push/unsubscribe",
    activity: "/api/push/activity",
    test: "/api/push/test"
  };

  let installPrompt = null;
  let swRegistrationPromise = null;
  let lastRecordedActivity = "";
  const visitSessionKey = "pilingo_visit_session_v1";

  function createVisitSessionId(){
    if(window.crypto?.randomUUID){
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }

  async function recordCoarseVisit(){
    if(!canUseServer()) return false;

    let sessionId = "";
    try {
      sessionId = sessionStorage.getItem(visitSessionKey) || "";
      if(sessionId) return true;
      sessionId = createVisitSessionId();
      sessionStorage.setItem(visitSessionKey, sessionId);
    } catch(error) {
      sessionId = createVisitSessionId();
    }

    let referrerHost = "";
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : "";
    } catch(error) {
      referrerHost = "";
    }

    const payload = {
      sessionId,
      entryPage: `${location.pathname || "/"}${location.search || ""}`,
      referrerHost,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    };
    const origins = [
      String(location.origin || ""),
      "https://pilingo.onrender.com"
    ].filter((value, index, values) => value && values.indexOf(value) === index);

    for(const origin of origins){
      try {
        const response = await fetch(new URL("/api/visit", origin), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true
        });
        if(response.ok) return true;
      } catch(error) {
        // Try the next configured backend.
      }
    }
    try {
      sessionStorage.removeItem(visitSessionKey);
    } catch(error) {
      // A future page load can retry when storage is available.
    }
    return false;
  }

  function currentAccount(){
    return window.PilingoAuth?.loadAccount?.() || null;
  }

  function currentSettings(){
    const account = currentAccount();
    const settings = account?.settings || {};
    return {
      pushNotificationsEnabled: settings.pushNotificationsEnabled !== false,
      dailyReminders: settings.dailyReminders !== false,
      streakReminders: settings.streakReminders !== false,
      newLessonReminders: settings.newLessonReminders !== false,
      studyReminders: settings.studyReminders !== false,
      notificationTime: typeof settings.notificationTime === "string" && /^\d{2}:\d{2}$/.test(settings.notificationTime)
        ? settings.notificationTime
        : "18:00",
      timezone: String(settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
    };
  }

  function canUseServer(){
    const protocol = String(window.location.protocol || "");
    return protocol === "http:" || protocol === "https:";
  }

  function isSecureForPush(){
    return !!(window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  }

  function supportsPush(){
    return (
      canUseServer() &&
      isSecureForPush() &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  function pushUnsupportedReason(){
    if(!canUseServer()) return "Push notifications need the app to be opened through the live website or local server, not as a file.";
    if(!isSecureForPush()) return "Push notifications need a secure app link (https) or localhost.";
    if(!("serviceWorker" in navigator)) return "This browser does not support service workers for push notifications.";
    if(!("PushManager" in window)) return "This browser or device does not support web push notifications yet.";
    if(!("Notification" in window)) return "This browser does not support notifications.";
    return "";
  }

  function setInstallButtonVisible(visible){
    const button = document.getElementById(installButtonId);
    if(button) button.hidden = !visible;
  }

  function setPushState(patch){
    try {
      const current = JSON.parse(localStorage.getItem(pushStateKey) || "{}");
      localStorage.setItem(pushStateKey, JSON.stringify({ ...current, ...(patch || {}) }));
    } catch(error) {
      localStorage.setItem(pushStateKey, JSON.stringify(patch || {}));
    }
  }

  function getPushState(){
    try {
      return JSON.parse(localStorage.getItem(pushStateKey) || "{}");
    } catch(error) {
      return {};
    }
  }

  function bumpUsageCount(){
    const next = Number(localStorage.getItem(usageKey) || "0") + 1;
    localStorage.setItem(usageKey, String(next));
    return next;
  }

  function markPrompted(){
    localStorage.setItem(promptedKey, String(Date.now()));
  }

  function hasPrompted(){
    return !!localStorage.getItem(promptedKey);
  }

  function urlBase64ToUint8Array(base64String){
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for(let i = 0; i < rawData.length; i++){
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  }

  async function registerServiceWorker(){
    if(!supportsPush()) return null;
    if(swRegistrationPromise) return swRegistrationPromise;
    swRegistrationPromise = navigator.serviceWorker.register(swUrl, { scope: "./" })
      .catch((error) => {
        swRegistrationPromise = null;
        throw error;
      });
    return swRegistrationPromise;
  }

  async function getServiceWorkerRegistration(){
    return await registerServiceWorker();
  }

  async function fetchJson(url, options){
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error(data?.error || data?.message || "Request failed.");
    }
    return data;
  }

  async function fetchPublicKey(){
    const data = await fetchJson(endpoints.publicKey, { cache: "no-store" });
    if(!data?.supported || !data?.publicKey){
      throw new Error(data?.error || "Push notifications are not ready on the server yet.");
    }
    return data.publicKey;
  }

  async function getExistingSubscription(){
    const registration = await getServiceWorkerRegistration();
    if(!registration) return null;
    return await registration.pushManager.getSubscription();
  }

  async function saveSubscriptionOnServer(subscription){
    const account = currentAccount();
    if(!account?.email) return null;
    return await fetchJson(endpoints.subscribe, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(account.email || "").trim().toLowerCase(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        subscription
      })
    });
  }

  async function removeSubscriptionOnServer(subscription){
    const account = currentAccount();
    if(!account?.email) return null;
    return await fetchJson(endpoints.unsubscribe, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(account.email || "").trim().toLowerCase(),
        subscription
      })
    });
  }

  async function persistSettings(patch){
    const account = currentAccount();
    if(!account?.email || !window.PilingoAuth?.updateProfile) return account;
    const mergedSettings = {
      ...currentSettings(),
      ...(patch || {}),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    };
    const updated = await window.PilingoAuth.updateProfile({
      name: account.name || "",
      avatarType: account.avatarType || "emoji",
      avatarValue: account.avatarValue || "🐯",
      bio: account.bio || "",
      statusMessage: account.statusMessage || "",
      settings: mergedSettings
    });
    updateSettingsInputs(updated?.settings || mergedSettings);
    return updated;
  }

  async function subscribeToPush(){
    const registration = await getServiceWorkerRegistration();
    if(!registration) throw new Error(pushUnsupportedReason() || "Push notifications are not available here.");
    const publicKey = await fetchPublicKey();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await saveSubscriptionOnServer(subscription);
    setPushState({ subscribedAt: Date.now() });
    return subscription;
  }

  function settingsStatusText(){
    if(!supportsPush()) return pushUnsupportedReason();
    if(Notification.permission === "granted"){
      return "Push notifications are ready on this device.";
    }
    if(Notification.permission === "denied"){
      return "Notifications are blocked in this browser. Turn them on in browser settings to receive reminders.";
    }
    return "Turn on notifications after a little study so Pilingo can remind you to come back.";
  }

  function updateReminderCard(){
    const status = document.getElementById("reminderStatus");
    const button = document.querySelector(".reminder-actions button");
    const settings = currentSettings();
    if(status){
      if(settings.pushNotificationsEnabled && Notification.permission === "granted"){
        status.innerText = `Push reminders are on • Daily time ${settings.notificationTime}`;
      } else if(settings.pushNotificationsEnabled){
        status.innerText = "Push reminders are waiting for permission";
      } else {
        status.innerText = "Push reminders are off";
      }
    }
    if(button){
      button.innerText = settings.pushNotificationsEnabled ? "Turn off reminders" : "Turn on reminders";
    }
  }

  function updateSettingsInputs(settings){
    const normalized = {
      ...currentSettings(),
      ...(settings || {})
    };
    const pushEnabled = document.getElementById("settingsPushEnabled");
    const reminderTime = document.getElementById("settingsReminderTime");
    const daily = document.getElementById("settingsDailyReminders");
    const streak = document.getElementById("settingsStreakReminders");
    const lessons = document.getElementById("settingsNewLessonReminders");
    const status = document.getElementById("settingsPushStatus");

    if(pushEnabled) pushEnabled.checked = normalized.pushNotificationsEnabled !== false;
    if(reminderTime) reminderTime.value = normalized.notificationTime || "18:00";
    if(daily) daily.checked = normalized.dailyReminders !== false;
    if(streak) streak.checked = normalized.streakReminders !== false;
    if(lessons) lessons.checked = normalized.newLessonReminders !== false;
    if(status) status.innerText = settingsStatusText();
    updateReminderCard();
  }

  async function syncSubscriptionWithSettings(){
    if(!supportsPush()) {
      updateSettingsInputs();
      return;
    }

    const account = currentAccount();
    if(!account?.email) return;

    const settings = currentSettings();
    if(settings.pushNotificationsEnabled === false){
      const existing = await getExistingSubscription();
      if(existing){
        try {
          await removeSubscriptionOnServer(existing);
        } catch(error) {
          // ignore server cleanup problems
        }
      }
      updateSettingsInputs(settings);
      return;
    }

    if(Notification.permission !== "granted"){
      updateSettingsInputs(settings);
      return;
    }

    try {
      const subscription = await subscribeToPush();
      if(!subscription) return;
    } catch(error) {
      // leave the app usable even if push sync fails
    } finally {
      updateSettingsInputs(settings);
    }
  }

  async function enablePushFromUserAction(){
    const account = currentAccount();
    if(!account?.email){
      throw new Error("Please log in first so Pilingo can connect reminders to your account.");
    }
    if(!supportsPush()){
      throw new Error(pushUnsupportedReason() || "Push notifications are not available here.");
    }

    const permission = await Notification.requestPermission();
    if(permission !== "granted"){
      updateSettingsInputs();
      throw new Error("Notifications were not allowed yet.");
    }

    await subscribeToPush();
    await persistSettings({
      pushNotificationsEnabled: true,
      dailyReminders: true,
      streakReminders: true,
      newLessonReminders: true,
      studyReminders: true
    });
    await syncSubscriptionWithSettings();
    updateSettingsInputs();
    return true;
  }

  async function disablePushNotifications(){
    const subscription = await getExistingSubscription();
    if(subscription){
      try {
        await removeSubscriptionOnServer(subscription);
      } catch(error) {
        // keep going and unsubscribe locally
      }
      await subscription.unsubscribe().catch(() => {});
    }
    await persistSettings({
      pushNotificationsEnabled: false,
      studyReminders: false
    });
    updateSettingsInputs();
    return true;
  }

  async function sendTestNotification(){
    const account = currentAccount();
    if(!account?.email){
      throw new Error("Please log in first.");
    }
    if(!supportsPush()){
      throw new Error(pushUnsupportedReason() || "Push notifications are not available here.");
    }
    if(Notification.permission !== "granted"){
      throw new Error("Please enable phone notifications first.");
    }
    await syncSubscriptionWithSettings();
    return await fetchJson(endpoints.test, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(account.email || "").trim().toLowerCase()
      })
    });
  }

  async function recordPushActivity(type, extra){
    const account = currentAccount();
    if(!account?.email || !canUseServer()) return false;
    const key = `${type || "activity"}::${String(extra?.page || location.pathname || "")}`;
    if(type === "page_open" && key === lastRecordedActivity) return false;
    if(type === "page_open") lastRecordedActivity = key;

    try {
      await fetch(endpoints.activity, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(account.email || "").trim().toLowerCase(),
          type: type || "activity",
          page: extra?.page || (location.pathname.split("/").pop() || "index.html"),
          lessonId: extra?.lessonId || "",
          partId: extra?.partId || "",
          label: extra?.label || "",
          score: extra?.score || "",
          completedAt: extra?.completedAt || ""
        })
      });
      return true;
    } catch(error) {
      return false;
    }
  }

  async function maybePromptAfterUse(reason){
    const account = currentAccount();
    if(!account?.email) return;
    if(!supportsPush()) return;
    if(Notification.permission !== "default") return;
    if(hasPrompted()) return;
    const usageCount = bumpUsageCount();
    if(usageCount < 2) return;
    markPrompted();
    const wantsPush = window.confirm("Turn on Pilingo reminders so learners do not lose their streak?");
    if(!wantsPush) return;
    try {
      await enablePushFromUserAction();
      await recordPushActivity("notifications_enabled", { label: reason || "after-use" });
    } catch(error) {
      // user may ignore or block permission
    }
  }

  function bindSettingsInputs(){
    updateSettingsInputs();
    const pushEnabled = document.getElementById("settingsPushEnabled");
    if(pushEnabled){
      pushEnabled.addEventListener("change", async () => {
        try {
          if(pushEnabled.checked){
            await enablePushFromUserAction();
          } else {
            await disablePushNotifications();
          }
        } catch(error) {
          pushEnabled.checked = currentSettings().pushNotificationsEnabled !== false;
          alert(error?.message || "Could not change notification settings.");
        }
      });
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    setInstallButtonVisible(true);
  });

  window.installPilingo = async function(){
    if(!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    setInstallButtonVisible(false);
  };

  window.PilingoPush = {
    supportsPush,
    pushUnsupportedReason,
    settingsStatusText,
    updateSettingsInputs,
    updateReminderCard,
    bindSettingsInputs,
    enableFromUserAction: enablePushFromUserAction,
    disable: disablePushNotifications,
    sendTest: sendTestNotification,
    syncWithAccount: syncSubscriptionWithSettings,
    recordActivity: recordPushActivity,
    recordLessonCompletion(extra){
      return recordPushActivity("lesson_complete", {
        ...(extra || {}),
        completedAt: new Date().toISOString()
      });
    },
    maybePromptAfterUse,
    async applySavedSettings(settingsPatch){
      const updated = await persistSettings(settingsPatch || {});
      await syncSubscriptionWithSettings();
      return updated;
    }
  };

  window.addEventListener("load", async () => {
    setInstallButtonVisible(false);
    bindSettingsInputs();
    updateSettingsInputs();
    recordCoarseVisit();

    if(supportsPush()){
      try {
        await registerServiceWorker();
      } catch(error) {
        // stay quiet to avoid blocking app startup
      }
    }

    if(currentAccount()?.email){
      updateSettingsInputs();
      await syncSubscriptionWithSettings();
      await recordPushActivity("page_open", {
        page: location.pathname.split("/").pop() || "index.html"
      });
    }
  });

  window.addEventListener("pilingo:account-changed", () => {
    updateSettingsInputs();
    syncSubscriptionWithSettings();
  });
})();
