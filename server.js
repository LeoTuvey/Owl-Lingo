const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
let webPush = null;
try {
  webPush = require("web-push");
} catch (error) {
  webPush = null;
}

loadEnvFile();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const EVENTS_FILE = path.join(DATA_DIR, "student-events.json");
const STATS_FILE = path.join(DATA_DIR, "student-stats.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const RESETS_FILE = path.join(DATA_DIR, "password-resets.json");
const APP_SETTINGS_FILE = path.join(DATA_DIR, "app-settings.json");
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const PUSH_KEYS_FILE = path.join(DATA_DIR, "vapid-keys.json");
const VISITS_FILE = path.join(DATA_DIR, "visits.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const CALLS_FILE = path.join(DATA_DIR, "calls.json");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_TO = process.env.EMAIL_TO || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";
const OWNER_EMAILS = parseOwnerEmails(process.env.OWNER_EMAILS || EMAIL_TO);
const OWNER_PANEL_TOKEN = process.env.OWNER_PANEL_TOKEN || `owner-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const PUSH_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const VISITOR_IP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webmanifest": "application/manifest+json"
};

ensureDataFile();
const PUSH_RUNTIME = initializePushRuntime();
startPushReminderScheduler();

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  applyApiHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      status: "healthy"
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/notifications") {
    if (!hasOwnerAccess(req)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Owner access only"
      });
    }
    return sendJson(res, 200, {
      ok: true,
      events: readEvents().slice(-50).reverse()
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/owner/students") {
    if (!hasOwnerAccess(req)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Owner access only"
      });
    }
    return sendJson(res, 200, {
      ok: true,
      students: getOwnerStudentRoster()
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/owner/visits") {
    if (!hasOwnerAccess(req)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Owner access only"
      });
    }
    return sendJson(res, 200, {
      ok: true,
      ...getVisitSummary()
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/leaderboard") {
    return sendJson(res, 200, {
      ok: true,
      students: getLeaderboard(),
      settings: readAppSettings()
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/app-settings") {
    return sendJson(res, 200, {
      ok: true,
      settings: readAppSettings()
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/social") {
    const viewerEmail = normalizeEmail(parsed.searchParams.get("viewerEmail") || "");
    return sendJson(res, 200, {
      ok: true,
      social: getSocialSnapshot(viewerEmail)
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/social/profile") {
    const viewerEmail = normalizeEmail(parsed.searchParams.get("viewerEmail") || "");
    const targetEmail = normalizeEmail(parsed.searchParams.get("targetEmail") || "");
    return sendJson(res, 200, {
      ok: true,
      profile: getStudentProfile(viewerEmail, targetEmail)
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/messages") {
    const viewerEmail = normalizeEmail(parsed.searchParams.get("viewerEmail") || "");
    return sendJson(res, 200, {
      ok: true,
      conversations: getMessageConversations(viewerEmail)
    });
  }

  if (req.method === "GET" && parsed.pathname === "/api/messages/thread") {
    const viewerEmail = normalizeEmail(parsed.searchParams.get("viewerEmail") || "");
    const targetEmail = normalizeEmail(parsed.searchParams.get("targetEmail") || "");
    const thread = getMessageThread(viewerEmail, targetEmail, true);
    if (!thread.ok) return sendJson(res, 400, thread);
    return sendJson(res, 200, thread);
  }

  if (req.method === "GET" && parsed.pathname === "/api/calls/poll") {
    const email = normalizeEmail(parsed.searchParams.get("email") || "");
    const after = Number(parsed.searchParams.get("after") || 0);
    return sendJson(res, 200, { ok: true, ...pollCalls(email, after) });
  }

  if (req.method === "POST" && parsed.pathname === "/api/track") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const event = appendStudentEvent(payload || {});
      return sendJson(res, 200, { ok: true, event });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid request body" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/visit") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const visit = await recordVisit(req, payload);
      return sendJson(res, 200, { ok: true, visit });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid visit request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/student-stats") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const student = upsertStudentStats(payload || {});
      return sendJson(res, 200, { ok: true, student });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid student stats body" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/progress") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const progress = updateLearningProgress(payload || {});
      if (!progress) {
        return sendJson(res, 404, { ok: false, error: "No account was found for this email." });
      }
      return sendJson(res, 200, { ok: true, progress });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid progress request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/presence") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const presence = updateLearnerPresence(payload || {});
      if (!presence) {
        return sendJson(res, 404, { ok: false, error: "No account was found for this email." });
      }
      return sendJson(res, 200, { ok: true, presence });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid presence request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/social/follow") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = updateFollowState(payload || {});
      if (!result.ok) {
        return sendJson(res, 400, { ok: false, error: result.error || "Could not update follow status." });
      }
      return sendJson(res, 200, {
        ok: true,
        social: getSocialSnapshot(result.viewerEmail)
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid follow request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/messages/send") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = sendDirectMessage(payload || {});
      if (!result.ok) return sendJson(res, 400, result);
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid message request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/calls/start") {
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = startLearnerCall(payload);
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid call request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/calls/action") {
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = updateLearnerCall(payload);
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid call action" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/calls/signal") {
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = addCallSignal(payload);
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid call signal" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/social/request") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = updateFollowRequestState(payload || {});
      if (!result.ok) {
        return sendJson(res, 400, { ok: false, error: result.error || "Could not update follow request." });
      }
      return sendJson(res, 200, {
        ok: true,
        social: getSocialSnapshot(result.viewerEmail),
        profile: result.targetEmail ? getStudentProfile(result.viewerEmail, result.targetEmail) : null
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid follow request action" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/social/block") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = updateBlockState(payload || {});
      if (!result.ok) {
        return sendJson(res, 400, { ok: false, error: result.error || "Could not update block status." });
      }
      return sendJson(res, 200, {
        ok: true,
        social: getSocialSnapshot(result.viewerEmail),
        profile: getStudentProfile(result.viewerEmail, result.targetEmail)
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid block request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/register") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const account = registerAccount(payload || {});
      if (!account) {
        return sendJson(res, 400, { ok: false, error: "This email is already in use." });
      }
      appendStudentEvent({
        type: "account_created",
        page: "index.html",
        label: "Created account",
        studentName: account.name,
        studentEmail: account.email,
        studentPhone: account.phone,
        studentLocation: account.location || "",
        details: {
          source: "register",
          location: account.location || ""
        }
      });
      return sendJson(res, 200, { ok: true, account: publicAccount(account) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid register request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/login") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = loginAccount(payload || {});
      if (!result?.ok) {
        if (result?.reason === "missing_account") {
          return sendJson(res, 404, { ok: false, error: "No account was found for this email. Please sign up first." });
        }
        if (result?.reason === "wrong_password") {
          return sendJson(res, 401, { ok: false, error: "Wrong password. Please try again." });
        }
        return sendJson(res, 401, { ok: false, error: "Wrong email or password." });
      }
      return sendJson(res, 200, { ok: true, account: publicAccount(result.account) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid login request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/request-reset") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await createPasswordReset(payload || {});
      if (!result?.ok) {
        if (result?.reason === "missing_email") {
          return sendJson(res, 400, { ok: false, error: "Please enter the account email first." });
        }
        if (result?.reason === "missing_account") {
          return sendJson(res, 404, { ok: false, error: "No account was found for this email. Please sign up first." });
        }
        return sendJson(res, 400, { ok: false, error: "Could not start password recovery." });
      }
      return sendJson(res, 200, {
        ok: true,
        code: result.code || null,
        deliveredByEmail: !!result.deliveredByEmail
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid password reset request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/auth/reset-password") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const account = resetPassword(payload || {});
      if (!account) {
        return sendJson(res, 400, { ok: false, error: "The code is wrong or expired." });
      }
      return sendJson(res, 200, { ok: true, account: publicAccount(account) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid new password request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/profile/update") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const account = updateStudentProfile(payload || {});
      if (!account) {
        return sendJson(res, 400, { ok: false, error: "Could not update this profile." });
      }
      return sendJson(res, 200, { ok: true, account: publicAccount(account) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid profile update request" });
    }
  }

  if (req.method === "GET" && parsed.pathname === "/api/push/public-key") {
    if (!PUSH_RUNTIME.enabled) {
      return sendJson(res, 200, {
        ok: false,
        supported: false,
        error: "Push notifications are not configured on the server yet."
      });
    }
    return sendJson(res, 200, {
      ok: true,
      supported: true,
      publicKey: PUSH_RUNTIME.publicKey
    });
  }

  if (req.method === "POST" && parsed.pathname === "/api/push/subscribe") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = upsertPushSubscription(payload || {});
      if (!result?.ok) {
        return sendJson(res, 400, { ok: false, error: result?.error || "Could not save push subscription." });
      }
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid push subscription request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/push/unsubscribe") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = removePushSubscription(payload || {});
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid push unsubscribe request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/push/activity") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const result = recordPushActivity(payload || {});
      return sendJson(res, 200, { ok: true, result });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid push activity request" });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/push/test") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const email = normalizeEmail(payload?.email);
      if (!email) {
        return sendJson(res, 400, { ok: false, error: "Email is required." });
      }
      const delivered = await sendPushNotificationToUser(email, {
        title: "🐆 Pilingo is waiting for you!",
        body: "📚 Time for today’s lesson!",
        tag: "pilingo-test",
        url: "/index.html",
        data: { type: "test" }
      });
      return sendJson(res, 200, { ok: true, delivered });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Could not send test notification." });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/app-settings") {
    if (!hasOwnerAccess(req)) {
      return sendJson(res, 403, {
        ok: false,
        error: "Owner access only"
      });
    }
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const settings = updateAppSettings(payload || {});
      return sendJson(res, 200, { ok: true, settings });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "Invalid app settings request" });
    }
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  return serveStatic(parsed.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Pilingo server running on http://localhost:${PORT}`);
  if (PUSH_RUNTIME.enabled) {
    console.log("Push notifications: enabled");
  } else {
    console.log("Push notifications: disabled");
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log("Telegram notifications: enabled");
  }
  if (RESEND_API_KEY && EMAIL_TO && EMAIL_FROM) {
    console.log("Email notifications: enabled");
  }
});

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, "[]", "utf8");
  if (!fs.existsSync(STATS_FILE)) fs.writeFileSync(STATS_FILE, "[]", "utf8");
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]", "utf8");
  if (!fs.existsSync(RESETS_FILE)) fs.writeFileSync(RESETS_FILE, "[]", "utf8");
  if (!fs.existsSync(APP_SETTINGS_FILE)) fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(defaultAppSettings(), null, 2), "utf8");
  if (!fs.existsSync(PUSH_SUBSCRIPTIONS_FILE)) fs.writeFileSync(PUSH_SUBSCRIPTIONS_FILE, "[]", "utf8");
  if (!fs.existsSync(VISITS_FILE)) fs.writeFileSync(VISITS_FILE, "[]", "utf8");
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]", "utf8");
  if (!fs.existsSync(CALLS_FILE)) fs.writeFileSync(CALLS_FILE, "[]", "utf8");
}

function readCalls() {
  try {
    const calls = JSON.parse(fs.readFileSync(CALLS_FILE, "utf8"));
    return Array.isArray(calls) ? calls : [];
  } catch (error) {
    return [];
  }
}

function writeCalls(calls) {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const recent = calls.filter((call) => new Date(call.updatedAt || call.createdAt || 0).getTime() > cutoff);
  fs.writeFileSync(CALLS_FILE, JSON.stringify(recent.slice(-500), null, 2), "utf8");
}

function callAccounts(callerEmail, recipientEmail) {
  const accounts = readAccounts();
  const caller = accounts.find((account) => account.email === callerEmail);
  const recipient = accounts.find((account) => account.email === recipientEmail);
  if (!caller || !recipient || callerEmail === recipientEmail) return null;
  if (!messageParticipantsAllowed(caller, recipient)) return null;
  return { caller, recipient };
}

function startLearnerCall(payload) {
  const callerEmail = normalizeEmail(payload?.callerEmail);
  const recipientEmail = normalizeEmail(payload?.recipientEmail);
  const mode = payload?.mode === "audio" ? "audio" : "video";
  const participants = callAccounts(callerEmail, recipientEmail);
  if (!participants) return { ok: false, error: "This learner cannot be called." };

  const calls = readCalls();
  const busy = calls.some((call) =>
    ["ringing", "active"].includes(call.status) &&
    new Date(call.updatedAt || call.createdAt || 0).getTime() > Date.now() - (10 * 60 * 1000) &&
    [call.callerEmail, call.recipientEmail].some((email) => [callerEmail, recipientEmail].includes(email))
  );
  if (busy) return { ok: false, error: "One of the learners is already in a call." };

  const now = new Date().toISOString();
  const call = {
    id: `call-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    callerEmail,
    recipientEmail,
    mode,
    status: "ringing",
    signals: [],
    createdAt: now,
    updatedAt: now
  };
  calls.push(call);
  writeCalls(calls);
  notifyCallRecipient(participants.caller, participants.recipient, call).catch(() => {});
  return { ok: true, call: publicCall(call, callerEmail) };
}

function updateLearnerCall(payload) {
  const email = normalizeEmail(payload?.email);
  const action = String(payload?.action || "");
  const calls = readCalls();
  const call = calls.find((item) => item.id === payload?.callId);
  if (!call || ![call.callerEmail, call.recipientEmail].includes(email)) {
    return { ok: false, error: "Call not found." };
  }
  if (action === "accept" && email === call.recipientEmail && call.status === "ringing") {
    call.status = "active";
  } else if (["decline", "end"].includes(action)) {
    call.status = action === "decline" ? "declined" : "ended";
  } else {
    return { ok: false, error: "This call action is unavailable." };
  }
  call.updatedAt = new Date().toISOString();
  writeCalls(calls);
  return { ok: true, call: publicCall(call, email) };
}

function addCallSignal(payload) {
  const senderEmail = normalizeEmail(payload?.senderEmail);
  const calls = readCalls();
  const call = calls.find((item) => item.id === payload?.callId);
  if (!call || ![call.callerEmail, call.recipientEmail].includes(senderEmail)) {
    return { ok: false, error: "Call not found." };
  }
  const targetEmail = senderEmail === call.callerEmail ? call.recipientEmail : call.callerEmail;
  const data = payload?.data;
  if (!data || typeof data !== "object") return { ok: false, error: "Invalid call signal." };
  const nextSeq = Number(call.signals?.at(-1)?.seq || 0) + 1;
  call.signals = Array.isArray(call.signals) ? call.signals : [];
  call.signals.push({ seq: nextSeq, senderEmail, targetEmail, data, createdAt: new Date().toISOString() });
  call.signals = call.signals.slice(-300);
  call.updatedAt = new Date().toISOString();
  writeCalls(calls);
  return { ok: true, seq: nextSeq };
}

function publicCall(call, viewerEmail) {
  const accounts = readAccounts();
  const otherEmail = call.callerEmail === viewerEmail ? call.recipientEmail : call.callerEmail;
  const other = accounts.find((account) => account.email === otherEmail);
  return {
    id: call.id,
    callerEmail: call.callerEmail,
    recipientEmail: call.recipientEmail,
    mode: call.mode,
    status: call.status,
    other: other ? publicAccount(other) : { email: otherEmail, name: "Learner" },
    createdAt: call.createdAt,
    updatedAt: call.updatedAt
  };
}

function pollCalls(email, after) {
  if (!email) return { call: null, signals: [] };
  const calls = readCalls();
  const call = [...calls].reverse().find((item) =>
    [item.callerEmail, item.recipientEmail].includes(email) &&
    new Date(item.updatedAt || 0).getTime() > Date.now() - (10 * 60 * 1000)
  );
  if (!call) return { call: null, signals: [] };
  const signals = (call.signals || []).filter((signal) => signal.targetEmail === email && signal.seq > after);
  return { call: publicCall(call, email), signals };
}

async function notifyCallRecipient(caller, recipient, call) {
  const label = call.mode === "audio" ? "voice" : "video";
  const badgeCount = Math.max(1, getUnreadMessageCount(recipient.email) + 1);
  await sendPushNotificationToUser(recipient.email, {
    title: `📞 Incoming ${label} call`,
    body: `${caller.name || "A learner"} is calling you on Pilingo.`,
    url: "/index.html#messages",
    appBadge: true,
    tag: `pilingo-call-${call.id}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [350, 180, 350, 180, 700],
    timestamp: Date.now(),
    data: {
      type: "incoming-call",
      callId: call.id,
      badgeCount
    }
  });
}

function readMessages() {
  try {
    const messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    return [];
  }
}

function writeMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages.slice(-20000), null, 2), "utf8");
}

function messageParticipantsAllowed(sender, recipient) {
  const senderBlocked = new Set((sender?.blocked || []).map(normalizeEmail));
  const recipientBlocked = new Set((recipient?.blocked || []).map(normalizeEmail));
  return !senderBlocked.has(recipient.email) && !recipientBlocked.has(sender.email);
}

function sendDirectMessage(payload) {
  const senderEmail = normalizeEmail(payload?.senderEmail);
  const recipientEmail = normalizeEmail(payload?.recipientEmail);
  const text = String(payload?.text || "").trim();
  if (!senderEmail || !recipientEmail || !text) {
    return { ok: false, error: "Sender, recipient, and message are required." };
  }
  if (senderEmail === recipientEmail) {
    return { ok: false, error: "Students cannot message themselves." };
  }
  if (text.length > 1000) {
    return { ok: false, error: "Messages can contain up to 1,000 characters." };
  }

  const accounts = readAccounts();
  const sender = accounts.find((account) => account.email === senderEmail);
  const recipient = accounts.find((account) => account.email === recipientEmail);
  if (!sender || !recipient) return { ok: false, error: "Both learners need registered accounts." };
  if (!messageParticipantsAllowed(sender, recipient)) {
    return { ok: false, error: "Messages are unavailable because one learner blocked the other." };
  }

  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    senderEmail,
    recipientEmail,
    text,
    readAt: "",
    createdAt: new Date().toISOString()
  };
  const messages = readMessages();
  messages.push(message);
  writeMessages(messages);

  notifyMessageRecipient(sender, recipient, message).catch(() => {});

  return { ok: true, message };
}

async function notifyMessageRecipient(sender, recipient, message) {
  const badgeCount = Math.max(1, getUnreadMessageCount(recipient.email));
  await sendPushNotificationToUser(recipient.email, {
    title: `💬 Message from ${sender.name || "a learner"}`,
    body: message.text.slice(0, 120),
    url: "/index.html#messages",
    appBadge: true,
    data: {
      type: "direct-message",
      badgeCount
    }
  });

  if (!RESEND_API_KEY || !EMAIL_FROM) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [recipient.email],
      subject: `${sender.name || "A learner"} sent you a message on Pilingo`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>You have a new Pilingo message</h2>
          <p><strong>${escapeHtml(sender.name || "A learner")}:</strong></p>
          <p style="padding:12px 14px;background:#fff7e8;border-radius:12px">${escapeHtml(message.text.slice(0, 500))}</p>
          <p><a href="https://pilingoacademy.com/index.html#messages">Open Pilingo to reply</a></p>
        </div>
      `
    })
  });
  if (!response.ok) {
    throw new Error(`Message email failed with status ${response.status}`);
  }
}

function getMessageThread(viewerEmail, targetEmail, markRead) {
  const accounts = readAccounts();
  const viewer = accounts.find((account) => account.email === viewerEmail);
  const target = accounts.find((account) => account.email === targetEmail);
  if (!viewer || !target || viewerEmail === targetEmail) {
    return { ok: false, error: "This conversation is unavailable." };
  }
  if (!messageParticipantsAllowed(viewer, target)) {
    return { ok: false, error: "This conversation is blocked." };
  }

  const messages = readMessages();
  const thread = messages.filter((message) =>
    (message.senderEmail === viewerEmail && message.recipientEmail === targetEmail) ||
    (message.senderEmail === targetEmail && message.recipientEmail === viewerEmail)
  );
  if (markRead) {
    const now = new Date().toISOString();
    let changed = false;
    messages.forEach((message) => {
      if (message.senderEmail === targetEmail && message.recipientEmail === viewerEmail && !message.readAt) {
        message.readAt = now;
        changed = true;
      }
    });
    if (changed) writeMessages(messages);
  }
  return {
    ok: true,
    participant: publicAccount(target),
    messages: thread.slice(-300)
  };
}

function getMessageConversations(viewerEmail) {
  if (!viewerEmail) return [];
  const accounts = readAccounts();
  const accountMap = new Map(accounts.map((account) => [account.email, account]));
  if (!accountMap.has(viewerEmail)) return [];

  const conversations = new Map();
  readMessages().forEach((message) => {
    if (message.senderEmail !== viewerEmail && message.recipientEmail !== viewerEmail) return;
    const otherEmail = message.senderEmail === viewerEmail ? message.recipientEmail : message.senderEmail;
    const other = accountMap.get(otherEmail);
    if (!other) return;
    const current = conversations.get(otherEmail) || {
      participant: publicAccount(other),
      lastMessage: null,
      unreadCount: 0
    };
    current.lastMessage = message;
    if (message.recipientEmail === viewerEmail && !message.readAt) current.unreadCount += 1;
    conversations.set(otherEmail, current);
  });
  return Array.from(conversations.values()).sort((a, b) =>
    new Date(b.lastMessage?.createdAt || 0).getTime() - new Date(a.lastMessage?.createdAt || 0).getTime()
  );
}

function getUnreadMessageCount(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 0;
  return readMessages().reduce((count, message) =>
    count + (message.recipientEmail === normalizedEmail && !message.readAt ? 1 : 0),
  0);
}

function readVisits() {
  try {
    const visits = JSON.parse(fs.readFileSync(VISITS_FILE, "utf8"));
    if (!Array.isArray(visits)) return [];
    const now = Date.now();
    let removedExpiredIp = false;
    const normalizedVisits = visits.map((visit) => {
      const createdAt = new Date(visit?.createdAt || 0).getTime();
      if (!createdAt || now - createdAt <= VISITOR_IP_RETENTION_MS) return visit;
      const { ipAddress, ...expiredVisit } = visit || {};
      if (ipAddress) removedExpiredIp = true;
      return expiredVisit;
    });
    if (removedExpiredIp) {
      fs.writeFileSync(VISITS_FILE, JSON.stringify(normalizedVisits.slice(-20000), null, 2), "utf8");
    }
    return normalizedVisits;
  } catch (error) {
    return [];
  }
}

function writeVisits(visits) {
  fs.writeFileSync(VISITS_FILE, JSON.stringify(visits.slice(-20000), null, 2), "utf8");
}

function getClientIp(req) {
  const candidates = [
    req.headers["cf-connecting-ip"],
    String(req.headers["x-forwarded-for"] || "").split(",")[0],
    req.headers["x-real-ip"],
    req.socket?.remoteAddress
  ];
  const raw = candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  return raw.replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

async function lookupCoarseLocation(ip) {
  if (!ip || isPrivateIp(ip) || !/^[0-9a-f:.]+$/i.test(ip)) {
    return { city: "Local", region: "", country: "Local", countryCode: "", continent: "" };
  }

  const lookups = [
    async () => {
      const data = await fetchLocationJson(
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,country_code,continent`
      );
      if (data?.success === false) throw new Error("Location unavailable");
      return {
        city: data?.city,
        region: data?.region,
        country: data?.country,
        countryCode: data?.country_code,
        continent: data?.continent
      };
    },
    async () => {
      const data = await fetchLocationJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
      if (data?.error) throw new Error("Location unavailable");
      return {
        city: data?.city,
        region: data?.region,
        country: data?.country_name,
        countryCode: data?.country_code,
        continent: data?.continent_code
      };
    }
  ];

  for (const lookup of lookups) {
    try {
      const location = await lookup();
      if (!location?.country) continue;
      return {
        city: String(location.city || "Unknown"),
        region: String(location.region || ""),
        country: String(location.country || "Unknown"),
        countryCode: String(location.countryCode || "").toUpperCase(),
        continent: String(location.continent || "Unknown")
      };
    } catch (error) {
      // Try the next provider when one is unavailable or rate-limited.
    }
  }

  return { city: "Unknown", region: "", country: "Unknown", countryCode: "", continent: "Unknown" };
}

function isPrivateIp(ip) {
  const value = String(ip || "").toLowerCase();
  return value === "::1" ||
    value === "127.0.0.1" ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:");
}

async function fetchLocationJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Pilingo coarse visit analytics" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Location lookup failed");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function recordVisit(req, payload) {
  const sessionId = String(payload?.sessionId || "").trim().slice(0, 100);
  if (!/^[a-z0-9_-]{12,100}$/i.test(sessionId)) {
    throw new Error("Invalid session");
  }

  const visits = readVisits();
  const existing = visits.find((item) => item.sessionId === sessionId);
  if (existing) return existing;

  const ipAddress = getClientIp(req);
  const location = await lookupCoarseLocation(ipAddress);
  const visit = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sessionId,
    ipAddress,
    city: location.city,
    region: location.region,
    country: location.country,
    countryCode: location.countryCode,
    continent: location.continent,
    entryPage: String(payload?.entryPage || "").slice(0, 160),
    referrerHost: String(payload?.referrerHost || "").slice(0, 160),
    timezone: String(payload?.timezone || "").slice(0, 100),
    createdAt: new Date().toISOString()
  };
  visits.push(visit);
  writeVisits(visits);
  sendNewVisitorNotifications(visit).catch(() => {});
  return visit;
}

async function sendNewVisitorNotifications(visit) {
  const locationParts = [
    visit.city,
    visit.region,
    visit.country,
    visit.continent ? `(${visit.continent})` : ""
  ].filter((part) => part && part !== "Unknown");
  const locationLabel = locationParts.join(", ") || "Location unavailable";
  const event = {
    type: "new_visitor",
    label: "New person opened Pilingo",
    studentName: "Website visitor",
    studentEmail: "",
    studentPhone: "",
    studentLocation: locationLabel,
    page: visit.entryPage || "/",
    createdAt: visit.createdAt,
    details: {
      city: visit.city,
      region: visit.region,
      country: visit.country,
      continent: visit.continent,
      referrerHost: visit.referrerHost
    }
  };

  const pushTasks = OWNER_EMAILS.map((email) =>
    sendPushNotificationToUser(email, {
      title: "🌍 New Pilingo visitor",
      body: `${locationLabel} opened ${visit.entryPage || "the app"}.`,
      url: "/index.html"
    })
  );
  await Promise.allSettled([
    sendNotifications(event),
    ...pushTasks
  ]);
}

function getVisitSummary() {
  const visits = readVisits();
  const countBy = (field) => {
    const counts = new Map();
    visits.forEach((visit) => {
      const value = String(visit?.[field] || "Unknown").trim() || "Unknown";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts, ([name, visits]) => ({ name, visits }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  };

  return {
    totalVisits: visits.length,
    countries: countBy("country"),
    cities: countBy("city"),
    continents: countBy("continent"),
    ipRetentionDays: Math.round(VISITOR_IP_RETENTION_MS / (24 * 60 * 60 * 1000)),
    recentVisits: visits.slice(-100).reverse().map(({ sessionId, ...visit }) => visit)
  };
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 0) return;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function readEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), "utf8");
}

function appendStudentEvent(payload) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: String(payload?.type || "activity"),
    page: String(payload?.page || ""),
    label: String(payload?.label || ""),
    studentName: String(payload?.studentName || "Unknown student"),
    studentEmail: String(payload?.studentEmail || ""),
    studentPhone: String(payload?.studentPhone || ""),
    studentLocation: String(payload?.studentLocation || ""),
    details: payload?.details && typeof payload.details === "object" ? payload.details : {},
    createdAt: new Date().toISOString()
  };

  const events = readEvents();
  events.push(event);
  writeEvents(events.slice(-400));

  if (isNamedStudentEvent(event)) {
    upsertStudentStats({
      studentName: event.studentName,
      studentEmail: event.studentEmail,
      studentPhone: event.studentPhone,
      studentLocation: event.studentLocation
    });
  }

  sendNotifications(event).catch(() => {});
  return event;
}

function readStudentStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeStudentStats(students) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(students, null, 2), "utf8");
}

function readAccounts() {
  try {
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    return Array.isArray(accounts) ? accounts.map(normalizeAccountRecord) : [];
  } catch (error) {
    return [];
  }
}

function writeAccounts(accounts) {
  const normalized = Array.isArray(accounts) ? accounts.map(normalizeAccountRecord) : [];
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(normalized, null, 2), "utf8");
}

function readPasswordResets() {
  try {
    return JSON.parse(fs.readFileSync(RESETS_FILE, "utf8"));
  } catch (error) {
    return [];
  }
}

function writePasswordResets(resets) {
  fs.writeFileSync(RESETS_FILE, JSON.stringify(resets, null, 2), "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function applyApiHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Pilingo-Owner-Token");
  res.setHeader("Cache-Control", "no-store");
}

function serveStatic(requestPath, res) {
  let filePath = requestPath === "/" ? "/index.html" : requestPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT, filePath);

  if (!absolutePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    };

    if (
      ext === ".html" ||
      ext === ".js" ||
      ext === ".css" ||
      ext === ".json" ||
      path.basename(absolutePath) === "sw.js" ||
      ext === ".webmanifest"
    ) {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
      headers.Pragma = "no-cache";
      headers.Expires = "0";
    }

    res.writeHead(200, headers);
    res.end(content);
  });
}

function upsertStudentStats(payload) {
  const name = String(payload.studentName || "Unknown student").trim() || "Unknown student";
  const email = String(payload.studentEmail || "").trim().toLowerCase();
  const phone = String(payload.studentPhone || "").trim();
  const location = String(payload.studentLocation || "").trim();
  const students = readStudentStats();
  const normalizedName = name.toLowerCase();
  const existingIndex = students.findIndex((student) => {
    const studentEmail = String(student.email || "").trim().toLowerCase();
    const studentPhone = String(student.phone || "").trim();
    const studentName = String(student.name || "").trim().toLowerCase();

    if (email && studentEmail === email) return true;
    if (phone && studentPhone === phone) return true;
    if (email && !studentEmail && normalizedName && normalizedName !== "unknown student" && studentName === normalizedName) {
      return true;
    }

    if (!email && !phone && normalizedName && normalizedName !== "unknown student" && studentName === normalizedName) {
      return true;
    }

    return false;
  });
  const existing = existingIndex >= 0 ? students[existingIndex] : null;

  const merged = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    email,
    phone,
    location,
    xp: Math.max(safeNumber(payload.xp, 0), safeNumber(existing?.xp, 0)),
    level: Math.max(safeNumber(payload.level, 0), safeNumber(existing?.level, 0)),
    streak: safeNumber(payload.streak, existing?.streak || 0),
    completedSections: Math.max(safeNumber(payload.completedSections, 0), safeNumber(existing?.completedSections, 0)),
    averageGrade: safeNumber(payload.averageGrade, existing?.averageGrade || 0),
    bestGrade: Math.max(safeNumber(payload.bestGrade, 0), safeNumber(existing?.bestGrade, 0)),
    lessonsFinished: Math.max(safeNumber(payload.lessonsFinished, 0), safeNumber(existing?.lessonsFinished, 0)),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    students[existingIndex] = merged;
  } else {
    students.push(merged);
  }

  writeStudentStats(students);
  return merged;
}

function statsFromLearningProgress(account) {
  const progress = account?.learningProgress && typeof account.learningProgress === "object"
    ? account.learningProgress
    : {};
  const parseJson = (key, fallback) => {
    try {
      return JSON.parse(progress[key] || JSON.stringify(fallback));
    } catch (error) {
      return fallback;
    }
  };
  const grades = Object.values(parseJson("pilingo_game1_grades", {}));
  const completedSections = parseJson("pilingo_game1_completed_sections", {});
  const completedParts = parseJson("pilingo_game1_completed_parts", []);
  const gradeValues = grades.map((record) => safeNumber(record?.bestPercent, 0));
  const xp = safeNumber(progress["en-ku_xp"], 0);

  return {
    studentName: account?.name,
    studentEmail: account?.email,
    studentPhone: account?.phone,
    studentLocation: account?.location,
    xp,
    level: xp < 50 ? 0 : xp < 120 ? 1 : xp < 220 ? 2 : xp < 350 ? 3 : xp < 500 ? 4 : 5,
    streak: safeNumber(progress.streak, 0),
    completedSections: Math.max(
      grades.length,
      Object.values(completedSections).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0)
    ),
    averageGrade: gradeValues.length
      ? Math.round(gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length)
      : 0,
    bestGrade: gradeValues.length ? Math.max(...gradeValues) : 0,
    lessonsFinished: Array.isArray(completedParts) ? completedParts.length : 0
  };
}

function ensureAccountStats(account) {
  if (!account?.email) return null;
  const derived = statsFromLearningProgress(account);
  const email = normalizeEmail(account.email);
  const phone = String(account.phone || "").trim();
  const name = String(account.name || "").trim().toLowerCase();
  const existing = readStudentStats().find((student) => {
    const studentEmail = normalizeEmail(student?.email);
    const studentPhone = String(student?.phone || "").trim();
    const studentName = String(student?.name || "").trim().toLowerCase();
    return studentEmail === email || (!!phone && studentPhone === phone) || (!studentEmail && studentName === name);
  });
  const needsSync = !existing ||
    normalizeEmail(existing.email) !== email ||
    safeNumber(derived.xp, 0) > safeNumber(existing.xp, 0) ||
    safeNumber(derived.completedSections, 0) > safeNumber(existing.completedSections, 0) ||
    safeNumber(derived.bestGrade, 0) > safeNumber(existing.bestGrade, 0) ||
    safeNumber(derived.lessonsFinished, 0) > safeNumber(existing.lessonsFinished, 0);
  return needsSync ? upsertStudentStats(derived) : existing;
}

function defaultAppSettings() {
  return {
    showLearnersList: true,
    showRankingList: true,
    updatedAt: new Date().toISOString()
  };
}

function normalizeAppSettings(settings) {
  const defaults = defaultAppSettings();
  return {
    showLearnersList: settings?.showLearnersList !== false,
    showRankingList: settings?.showRankingList !== false,
    updatedAt: String(settings?.updatedAt || defaults.updatedAt)
  };
}

function readAppSettings() {
  try {
    const raw = fs.readFileSync(APP_SETTINGS_FILE, "utf8");
    return normalizeAppSettings(JSON.parse(raw || "{}"));
  } catch (error) {
    return defaultAppSettings();
  }
}

function writeAppSettings(settings) {
  fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(normalizeAppSettings(settings), null, 2), "utf8");
}

function updateAppSettings(payload) {
  const current = readAppSettings();
  const next = normalizeAppSettings({
    ...current,
    ...(payload || {}),
    updatedAt: new Date().toISOString()
  });
  writeAppSettings(next);
  return next;
}

function isNamedStudentEvent(event) {
  const email = String(event?.studentEmail || "").trim().toLowerCase();
  const phone = String(event?.studentPhone || "").trim();
  const name = String(event?.studentName || "").trim().toLowerCase();
  return !!(email || phone || (name && name !== "unknown student"));
}

function publicAccount(account) {
  const isOwner = isOwnerEmail(account?.email);
  return {
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
    settings: normalizeStudentSettings(account.settings || {}),
    following: Array.isArray(account?.following) ? account.following.slice() : [],
    pendingFollowRequests: Array.isArray(account?.pendingFollowRequests) ? account.pendingFollowRequests.slice() : [],
    sentFollowRequests: Array.isArray(account?.sentFollowRequests) ? account.sentFollowRequests.slice() : [],
    blocked: Array.isArray(account?.blocked) ? account.blocked.slice() : [],
    learningProgress: normalizeLearningProgress(account?.learningProgress),
    progressUpdatedAt: String(account?.progressUpdatedAt || ""),
    isOwner,
    ownerPanelToken: isOwner ? OWNER_PANEL_TOKEN : ""
  };
}

function registerAccount(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = String(payload.phone || "").trim();
  const password = String(payload.password || "").trim();
  const location = String(payload.location || "").trim();
  if (!name || !email || !phone || !password) return null;

  const accounts = readAccounts();
  const exists = accounts.some((account) => String(account.email || "").trim().toLowerCase() === email);
  if (exists) return null;

  const account = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    email,
    phone,
    password,
    location,
    createdAt: new Date().toISOString(),
    avatarType: "emoji",
    avatarValue: "🐯",
    bio: "",
    statusMessage: "Ready to learn",
    settings: normalizeStudentSettings({}),
    learningProgress: {},
    following: [],
    pendingFollowRequests: [],
    sentFollowRequests: [],
    blocked: []
  };
  accounts.push(account);
  writeAccounts(accounts);
  upsertStudentStats({
    studentName: account.name,
    studentEmail: account.email,
    studentPhone: account.phone,
    studentLocation: account.location || "",
    xp: 0,
    level: 0,
    streak: 0,
    completedSections: 0,
    averageGrade: 0,
    bestGrade: 0,
    lessonsFinished: 0
  });
  return account;
}

function findAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const accounts = readAccounts();
  return accounts.find((account) =>
    String(account.email || "").trim().toLowerCase() === normalizedEmail
  ) || null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readPushSubscriptions() {
  try {
    const raw = fs.readFileSync(PUSH_SUBSCRIPTIONS_FILE, "utf8");
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.map(normalizePushSubscriptionRecord).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function writePushSubscriptions(list) {
  fs.writeFileSync(
    PUSH_SUBSCRIPTIONS_FILE,
    JSON.stringify((Array.isArray(list) ? list : []).map(normalizePushSubscriptionRecord).filter(Boolean), null, 2),
    "utf8"
  );
}

function normalizePushSubscriptionRecord(record) {
  const endpoint = String(record?.endpoint || record?.subscription?.endpoint || "").trim();
  const email = normalizeEmail(record?.email);
  if (!endpoint || !email) return null;

  return {
    email,
    endpoint,
    subscription: record?.subscription || null,
    userAgent: String(record?.userAgent || "").trim(),
    timezone: normalizeTimezone(record?.timezone),
    createdAt: String(record?.createdAt || new Date().toISOString()),
    updatedAt: String(record?.updatedAt || new Date().toISOString()),
    lastSeenAt: String(record?.lastSeenAt || ""),
    lastLessonCompletionAt: String(record?.lastLessonCompletionAt || ""),
    lastDailySentAt: String(record?.lastDailySentAt || ""),
    lastStreakSentAt: String(record?.lastStreakSentAt || ""),
    lastFollowUpSentAt: String(record?.lastFollowUpSentAt || ""),
    lastPage: String(record?.lastPage || "").trim()
  };
}

function normalizeAccountRecord(account) {
  const following = Array.isArray(account?.following)
    ? account.following.map((email) => normalizeEmail(email)).filter(Boolean)
    : [];
  const pendingFollowRequests = Array.isArray(account?.pendingFollowRequests)
    ? account.pendingFollowRequests.map((email) => normalizeEmail(email)).filter(Boolean)
    : [];
  const sentFollowRequests = Array.isArray(account?.sentFollowRequests)
    ? account.sentFollowRequests.map((email) => normalizeEmail(email)).filter(Boolean)
    : [];
  const blocked = Array.isArray(account?.blocked)
    ? account.blocked.map((email) => normalizeEmail(email)).filter(Boolean)
    : [];

  return {
    ...account,
    email: normalizeEmail(account?.email),
    phone: String(account?.phone || "").trim(),
    location: String(account?.location || "").trim(),
    avatarType: account?.avatarType === "image" ? "image" : "emoji",
    avatarValue: String(account?.avatarValue || "🐯").trim() || "🐯",
    bio: String(account?.bio || "").trim(),
    statusMessage: String(account?.statusMessage || "").trim(),
    learningProgress: normalizeLearningProgress(account?.learningProgress),
    settings: normalizeStudentSettings(account?.settings || {}),
    following: Array.from(new Set(following)),
    pendingFollowRequests: Array.from(new Set(pendingFollowRequests)),
    sentFollowRequests: Array.from(new Set(sentFollowRequests)),
    blocked: Array.from(new Set(blocked))
  };
}

const LEARNING_PROGRESS_KEYS = new Set([
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
]);

function normalizeLearningProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return {};

  const normalized = {};
  for (const [key, value] of Object.entries(progress)) {
    if (!LEARNING_PROGRESS_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    normalized[key] = value.slice(0, 500000);
  }
  return normalized;
}

function updateLearningProgress(payload) {
  const email = normalizeEmail(payload?.email);
  if (!email) return null;

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => normalizeEmail(account?.email) === email);
  if (index < 0) return null;

  const incoming = normalizeLearningProgress(payload?.progress);
  accounts[index] = normalizeAccountRecord({
    ...accounts[index],
    learningProgress: {
      ...normalizeLearningProgress(accounts[index]?.learningProgress),
      ...incoming
    },
    progressUpdatedAt: new Date().toISOString()
  });
  writeAccounts(accounts);
  return accounts[index].learningProgress;
}

function updateLearnerPresence(payload) {
  const email = normalizeEmail(payload?.email);
  if (!email) return null;

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => normalizeEmail(account?.email) === email);
  if (index < 0) return null;

  const now = new Date().toISOString();
  const online = payload?.online !== false;
  accounts[index] = normalizeAccountRecord({
    ...accounts[index],
    lastPresenceAt: now,
    lastPresencePage: String(payload?.page || "").slice(0, 160),
    presenceOnline: online
  });
  writeAccounts(accounts);
  return {
    online,
    lastPresenceAt: now,
    lastPresencePage: accounts[index].lastPresencePage
  };
}

function normalizeStudentSettings(settings) {
  return {
    profileVisibility: String(settings?.profileVisibility || "public") === "private" ? "private" : "public",
    studyReminders: settings?.studyReminders !== false,
    soundEffects: settings?.soundEffects !== false,
    pushNotificationsEnabled: settings?.pushNotificationsEnabled !== false,
    dailyReminders: settings?.dailyReminders !== false,
    streakReminders: settings?.streakReminders !== false,
    newLessonReminders: settings?.newLessonReminders !== false,
    notificationTime: normalizeNotificationTime(settings?.notificationTime),
    timezone: normalizeTimezone(settings?.timezone)
  };
}

function normalizeNotificationTime(value) {
  const raw = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : "18:00";
}

function normalizeTimezone(value) {
  const raw = String(value || "").trim();
  return raw || "UTC";
}

function loginAccount(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();
  if (!email || !password) return null;

  const account = findAccountByEmail(email);
  if (!account) {
    return { ok: false, reason: "missing_account" };
  }
  if (String(account.password || "") !== password) {
    return { ok: false, reason: "wrong_password" };
  }

  ensureAccountStats(account);
  return { ok: true, account };
}

function parseOwnerEmails(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isOwnerEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return !!(normalizedEmail && OWNER_EMAILS.includes(normalizedEmail));
}

function hasOwnerAccess(req) {
  const token = String(req.headers["x-pilingo-owner-token"] || "").trim();
  return !!(token && token === OWNER_PANEL_TOKEN);
}

function updateFollowState(payload) {
  const viewerEmail = normalizeEmail(payload?.viewerEmail);
  const targetEmail = normalizeEmail(payload?.targetEmail);
  const shouldFollow = payload?.follow !== false;

  if (!viewerEmail || !targetEmail) {
    return { ok: false, error: "Both students need an email address." };
  }

  if (viewerEmail === targetEmail) {
    return { ok: false, error: "Students cannot follow themselves." };
  }

  const accounts = readAccounts();
  const viewerIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === viewerEmail);
  const targetIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === targetEmail);

  if (viewerIndex < 0 || targetIndex < 0) {
    return { ok: false, error: "Both students need real accounts before following." };
  }

  const viewer = normalizeAccountRecord(accounts[viewerIndex]);
  const target = normalizeAccountRecord(accounts[targetIndex]);
  const nextFollowing = new Set(viewer.following || []);
  const nextViewerSent = new Set(viewer.sentFollowRequests || []);
  const nextViewerPending = new Set(viewer.pendingFollowRequests || []);
  const viewerBlocked = new Set(viewer.blocked || []);
  const nextTargetPending = new Set(target.pendingFollowRequests || []);
  const nextTargetSent = new Set(target.sentFollowRequests || []);
  const targetBlocked = new Set(target.blocked || []);

  if (shouldFollow) {
    if (viewerBlocked.has(targetEmail) || targetBlocked.has(viewerEmail)) {
      return { ok: false, error: "This student cannot be followed right now." };
    }
    if (!nextFollowing.has(targetEmail)) {
      nextViewerSent.add(targetEmail);
      nextTargetPending.add(viewerEmail);
    }
  } else {
    nextFollowing.delete(targetEmail);
    nextViewerSent.delete(targetEmail);
    nextViewerPending.delete(targetEmail);
    nextTargetPending.delete(viewerEmail);
    nextTargetSent.delete(viewerEmail);
  }

  accounts[viewerIndex] = {
    ...viewer,
    following: Array.from(nextFollowing),
    pendingFollowRequests: Array.from(nextViewerPending),
    sentFollowRequests: Array.from(nextViewerSent)
  };
  accounts[targetIndex] = {
    ...target,
    pendingFollowRequests: Array.from(nextTargetPending),
    sentFollowRequests: Array.from(nextTargetSent)
  };
  writeAccounts(accounts);

  return { ok: true, viewerEmail, targetEmail };
}

function updateFollowRequestState(payload) {
  const viewerEmail = normalizeEmail(payload?.viewerEmail);
  const targetEmail = normalizeEmail(payload?.targetEmail);
  const action = String(payload?.action || "").trim().toLowerCase();

  if (!viewerEmail || !targetEmail) {
    return { ok: false, error: "Both students need an email address." };
  }

  if (viewerEmail === targetEmail) {
    return { ok: false, error: "Students cannot update their own request." };
  }

  const accounts = readAccounts();
  const viewerIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === viewerEmail);
  const targetIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === targetEmail);

  if (viewerIndex < 0 || targetIndex < 0) {
    return { ok: false, error: "Both students need real accounts before updating requests." };
  }

  const viewer = normalizeAccountRecord(accounts[viewerIndex]);
  const target = normalizeAccountRecord(accounts[targetIndex]);

  const viewerFollowing = new Set(viewer.following || []);
  const viewerPending = new Set(viewer.pendingFollowRequests || []);
  const viewerSent = new Set(viewer.sentFollowRequests || []);
  const targetFollowing = new Set(target.following || []);
  const targetPending = new Set(target.pendingFollowRequests || []);
  const targetSent = new Set(target.sentFollowRequests || []);

  if (action === "accept") {
    if (!viewerPending.has(targetEmail) || !targetSent.has(viewerEmail)) {
      return { ok: false, error: "That follow request is no longer waiting." };
    }
    viewerPending.delete(targetEmail);
    targetSent.delete(viewerEmail);
    targetFollowing.add(viewerEmail);
  } else if (action === "decline") {
    viewerPending.delete(targetEmail);
    targetSent.delete(viewerEmail);
  } else if (action === "cancel") {
    viewerSent.delete(targetEmail);
    targetPending.delete(viewerEmail);
    viewerFollowing.delete(targetEmail);
  } else {
    return { ok: false, error: "Unknown request action." };
  }

  accounts[viewerIndex] = {
    ...viewer,
    following: Array.from(viewerFollowing),
    pendingFollowRequests: Array.from(viewerPending),
    sentFollowRequests: Array.from(viewerSent)
  };
  accounts[targetIndex] = {
    ...target,
    following: Array.from(targetFollowing),
    pendingFollowRequests: Array.from(targetPending),
    sentFollowRequests: Array.from(targetSent)
  };
  writeAccounts(accounts);

  return { ok: true, viewerEmail, targetEmail };
}

function updateBlockState(payload) {
  const viewerEmail = normalizeEmail(payload?.viewerEmail);
  const targetEmail = normalizeEmail(payload?.targetEmail);
  const shouldBlock = payload?.block !== false;

  if (!viewerEmail || !targetEmail) {
    return { ok: false, error: "Both students need an email address." };
  }

  if (viewerEmail === targetEmail) {
    return { ok: false, error: "Students cannot block themselves." };
  }

  const accounts = readAccounts();
  const viewerIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === viewerEmail);
  const targetIndex = accounts.findIndex((account) => normalizeEmail(account?.email) === targetEmail);

  if (viewerIndex < 0 || targetIndex < 0) {
    return { ok: false, error: "Both students need real accounts before blocking." };
  }

  const viewer = normalizeAccountRecord(accounts[viewerIndex]);
  const target = normalizeAccountRecord(accounts[targetIndex]);
  const nextBlocked = new Set(viewer.blocked || []);
  const nextFollowing = new Set(viewer.following || []);
  const nextViewerPending = new Set(viewer.pendingFollowRequests || []);
  const nextViewerSent = new Set(viewer.sentFollowRequests || []);
  const nextTargetFollowing = new Set(target.following || []);
  const nextTargetPending = new Set(target.pendingFollowRequests || []);
  const nextTargetSent = new Set(target.sentFollowRequests || []);

  if (shouldBlock) {
    nextBlocked.add(targetEmail);
    nextFollowing.delete(targetEmail);
    nextViewerPending.delete(targetEmail);
    nextViewerSent.delete(targetEmail);
    nextTargetFollowing.delete(viewerEmail);
    nextTargetPending.delete(viewerEmail);
    nextTargetSent.delete(viewerEmail);
  } else {
    nextBlocked.delete(targetEmail);
  }

  accounts[viewerIndex] = {
    ...viewer,
    blocked: Array.from(nextBlocked),
    following: Array.from(nextFollowing),
    pendingFollowRequests: Array.from(nextViewerPending),
    sentFollowRequests: Array.from(nextViewerSent)
  };
  accounts[targetIndex] = {
    ...target,
    following: Array.from(nextTargetFollowing),
    pendingFollowRequests: Array.from(nextTargetPending),
    sentFollowRequests: Array.from(nextTargetSent)
  };
  writeAccounts(accounts);

  return { ok: true, viewerEmail, targetEmail };
}

function updateStudentProfile(payload) {
  const email = normalizeEmail(payload?.email);
  if (!email) return null;

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => normalizeEmail(account?.email) === email);
  if (index < 0) return null;

  const current = normalizeAccountRecord(accounts[index]);
  const avatarType = payload?.avatarType === "image" ? "image" : "emoji";
  const avatarValue = String(payload?.avatarValue || current.avatarValue || "🐯").trim() || "🐯";
  const bio = String(payload?.bio || "").trim().slice(0, 180);
  const statusMessage = String(payload?.statusMessage || "").trim().slice(0, 120);
  const settings = normalizeStudentSettings(payload?.settings || current.settings || {});
  const name = String(payload?.name || current.name || "").trim();

  accounts[index] = {
    ...current,
    name: name || current.name,
    avatarType,
    avatarValue,
    bio,
    statusMessage,
    settings
  };

  writeAccounts(accounts);
  return accounts[index];
}

function initializePushRuntime() {
  if (!webPush) {
    return { enabled: false, publicKey: "", privateKey: "", reason: "web-push package is not installed" };
  }

  let keys = null;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = {
      publicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
      privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim()
    };
  } else {
    try {
      if (fs.existsSync(PUSH_KEYS_FILE)) {
        keys = JSON.parse(fs.readFileSync(PUSH_KEYS_FILE, "utf8") || "{}");
      }
    } catch (error) {
      keys = null;
    }

    if (!keys?.publicKey || !keys?.privateKey) {
      keys = webPush.generateVAPIDKeys();
      fs.writeFileSync(PUSH_KEYS_FILE, JSON.stringify(keys, null, 2), "utf8");
    }
  }

  const subject = `mailto:${EMAIL_FROM.match(/<([^>]+)>/)?.[1] || EMAIL_TO || "owner@pilingoacademy.com"}`;
  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return { enabled: true, publicKey: keys.publicKey, privateKey: keys.privateKey };
}

function upsertPushSubscription(payload) {
  if (!PUSH_RUNTIME.enabled) {
    return { ok: false, error: "Push notifications are not configured on the server yet." };
  }

  const email = normalizeEmail(payload?.email);
  const subscription = payload?.subscription || null;
  const endpoint = String(subscription?.endpoint || "").trim();
  if (!email || !endpoint) {
    return { ok: false, error: "A valid account email and push subscription are required." };
  }

  const subscriptions = readPushSubscriptions();
  const existingIndex = subscriptions.findIndex((item) => item.endpoint === endpoint);
  const now = new Date().toISOString();
  const current = existingIndex >= 0 ? subscriptions[existingIndex] : null;
  const record = normalizePushSubscriptionRecord({
    ...(current || {}),
    email,
    endpoint,
    subscription,
    userAgent: String(payload?.userAgent || current?.userAgent || "").trim(),
    timezone: normalizeTimezone(payload?.timezone || current?.timezone),
    createdAt: current?.createdAt || now,
    updatedAt: now,
    lastSeenAt: now,
    lastPage: String(payload?.page || current?.lastPage || "").trim()
  });

  if (existingIndex >= 0) {
    subscriptions[existingIndex] = record;
  } else {
    subscriptions.push(record);
  }

  writePushSubscriptions(subscriptions);
  return { ok: true, subscription: { endpoint: record.endpoint, email: record.email } };
}

function removePushSubscription(payload) {
  const email = normalizeEmail(payload?.email);
  const endpoint = String(payload?.endpoint || payload?.subscription?.endpoint || "").trim();
  const subscriptions = readPushSubscriptions();
  const filtered = subscriptions.filter((item) => {
    if (endpoint && item.endpoint === endpoint) return false;
    if (!endpoint && email && item.email === email) return false;
    return true;
  });
  writePushSubscriptions(filtered);
  return { removed: subscriptions.length - filtered.length };
}

function recordPushActivity(payload) {
  const email = normalizeEmail(payload?.email);
  if (!email) return { updated: 0 };

  const type = String(payload?.type || "page_open").trim().toLowerCase();
  const page = String(payload?.page || "").trim();
  const subscriptions = readPushSubscriptions();
  const now = new Date().toISOString();
  let updated = 0;

  subscriptions.forEach((item) => {
    if (item.email !== email) return;
    item.lastSeenAt = now;
    item.updatedAt = now;
    item.lastPage = page || item.lastPage;
    if (type === "lesson_complete" || type === "quiz_complete") {
      item.lastLessonCompletionAt = now;
    }
    updated += 1;
  });

  if (updated > 0) {
    writePushSubscriptions(subscriptions);
  }

  return { updated };
}

function getZonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour || 0) * 60) + Number(parts.minute || 0)
  };
}

function clockToMinutes(value) {
  const [hours, minutes] = normalizeNotificationTime(value).split(":").map((item) => Number(item));
  return (hours * 60) + minutes;
}

function addClockMinutes(value, extraMinutes) {
  const total = (clockToMinutes(value) + extraMinutes + (24 * 60)) % (24 * 60);
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sameLocalDay(isoTime, timeZone, nowDateKey) {
  if (!isoTime) return false;
  return getZonedDateParts(new Date(isoTime), timeZone).dateKey === nowDateKey;
}

function latestStatsByEmail() {
  const map = new Map();
  readStudentStats().forEach((student) => {
    const email = normalizeEmail(student?.email);
    if (email) map.set(email, student);
  });
  return map;
}

function latestAccountByEmail() {
  const map = new Map();
  readAccounts().forEach((account) => {
    const normalized = normalizeAccountRecord(account);
    if (normalized.email) map.set(normalized.email, normalized);
  });
  return map;
}

function reminderMessages(type) {
  const sets = {
    daily: [
      "🐆 Pilingo is waiting for you!",
      "📚 Time for today’s lesson!",
      "⭐ Learn for just 5 minutes today!",
      "📖 Your next lesson is waiting!"
    ],
    streak: [
      "🔥 Don’t lose your learning streak!",
      "🐆 Come back and continue learning!",
      "⭐ Learn for just 5 minutes today!"
    ],
    followup: [
      "🎉 A new lesson is ready!",
      "🐆 Come back and continue learning!",
      "📖 Your next lesson is waiting!"
    ]
  };
  const list = sets[type] || sets.daily;
  return list[Math.floor(Math.random() * list.length)];
}

async function sendPushNotificationRecord(record, payload) {
  if (!PUSH_RUNTIME.enabled || !record?.subscription) return false;

  const notificationPayload = JSON.stringify({
    title: payload.title || "🐯 Pilingo",
    body: payload.body || "",
    icon: "/pilingo-icon-192.png",
    badge: "/pilingo-icon-192.png",
    tag: payload.tag || "pilingo-reminder",
    appBadge: payload.appBadge === true,
    renotify: payload.renotify !== false,
    requireInteraction: !!payload.requireInteraction,
    silent: payload.silent === true,
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : undefined,
    timestamp: Number(payload.timestamp || Date.now()),
    url: payload.url || "/index.html",
    data: payload.data || {}
  });

  try {
    await webPush.sendNotification(record.subscription, notificationPayload);
    return true;
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      removePushSubscription({ endpoint: record.endpoint });
    }
    return false;
  }
}

async function sendPushNotificationToUser(email, payload) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 0;
  const subscriptions = readPushSubscriptions().filter((item) => item.email === normalizedEmail);
  let delivered = 0;
  for (const record of subscriptions) {
    if (await sendPushNotificationRecord(record, payload)) {
      delivered += 1;
    }
  }
  return delivered;
}

async function processPushReminders() {
  if (!PUSH_RUNTIME.enabled) return;

  const now = new Date();
  const subscriptions = readPushSubscriptions();
  if (!subscriptions.length) return;

  const accountsByEmail = latestAccountByEmail();
  const statsByEmail = latestStatsByEmail();
  let changed = false;

  for (const record of subscriptions) {
    const account = accountsByEmail.get(record.email);
    if (!account) continue;
    const settings = normalizeStudentSettings(account.settings || {});
    if (settings.pushNotificationsEnabled === false) continue;

    const zone = settings.timezone || record.timezone || "UTC";
    const nowParts = getZonedDateParts(now, zone);
    const lastSeenToday = sameLocalDay(record.lastSeenAt, zone, nowParts.dateKey);
    const dailyReady = nowParts.minutes >= clockToMinutes(settings.notificationTime);
    const streakReady = nowParts.minutes >= clockToMinutes(addClockMinutes(settings.notificationTime, 120));

    if (settings.dailyReminders !== false && dailyReady && !lastSeenToday && !sameLocalDay(record.lastDailySentAt, zone, nowParts.dateKey)) {
      const delivered = await sendPushNotificationRecord(record, {
        title: "🐯 Pilingo",
        body: reminderMessages("daily"),
        tag: `daily-${nowParts.dateKey}`,
        url: "/index.html",
        data: { type: "daily-reminder" }
      });
      if (delivered) {
        record.lastDailySentAt = now.toISOString();
        changed = true;
      }
    }

    const streakValue = Number(statsByEmail.get(record.email)?.streak || 0);
    if (settings.streakReminders !== false && streakValue > 0 && streakReady && !lastSeenToday && !sameLocalDay(record.lastStreakSentAt, zone, nowParts.dateKey)) {
      const delivered = await sendPushNotificationRecord(record, {
        title: "🐯 Pilingo",
        body: reminderMessages("streak"),
        tag: `streak-${nowParts.dateKey}`,
        url: "/index.html",
        data: { type: "streak-reminder" }
      });
      if (delivered) {
        record.lastStreakSentAt = now.toISOString();
        changed = true;
      }
    }

    const lessonAt = record.lastLessonCompletionAt ? new Date(record.lastLessonCompletionAt).getTime() : 0;
    const followUpSentAt = record.lastFollowUpSentAt ? new Date(record.lastFollowUpSentAt).getTime() : 0;
    const lastSeenAt = record.lastSeenAt ? new Date(record.lastSeenAt).getTime() : 0;
    const enoughTimePassed = lessonAt && (now.getTime() - lessonAt >= 2 * 60 * 60 * 1000);
    const notReturnedSinceLesson = !lastSeenAt || lastSeenAt <= (lessonAt + (5 * 60 * 1000));

    if (
      settings.newLessonReminders !== false &&
      enoughTimePassed &&
      followUpSentAt < lessonAt &&
      notReturnedSinceLesson
    ) {
      const delivered = await sendPushNotificationRecord(record, {
        title: "🐯 Pilingo",
        body: reminderMessages("followup"),
        tag: `followup-${lessonAt}`,
        url: "/engine.html",
        data: { type: "lesson-followup" }
      });
      if (delivered) {
        record.lastFollowUpSentAt = now.toISOString();
        changed = true;
      }
    }
  }

  if (changed) {
    writePushSubscriptions(subscriptions);
  }
}

function startPushReminderScheduler() {
  if (!PUSH_RUNTIME.enabled) return;
  setTimeout(() => {
    processPushReminders().catch(() => {});
  }, 15000);
  setInterval(() => {
    processPushReminders().catch(() => {});
  }, PUSH_REMINDER_INTERVAL_MS);
}

async function createPasswordReset(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "missing_email" };

  const accounts = readAccounts();
  const account = accounts.find((item) => String(item.email || "").trim().toLowerCase() === email);
  if (!account) return { ok: false, reason: "missing_account" };

  const resets = readPasswordResets().filter((item) => item.email !== email);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  resets.push({
    email,
    code,
    expiresAt: Date.now() + RESET_CODE_TTL_MS
  });
  writePasswordResets(resets);

  const delivery = await sendPasswordResetCode(account, code);
  return {
    ok: true,
    deliveredByEmail: !!delivery?.deliveredByEmail,
    code
  };
}

function resetPassword(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const code = String(payload.code || "").trim();
  const newPassword = String(payload.newPassword || "").trim();
  if (!email || !code || !newPassword) return null;

  const resets = readPasswordResets();
  const match = resets.find((item) => item.email === email && item.code === code && Number(item.expiresAt || 0) > Date.now());
  if (!match) return null;

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => String(account.email || "").trim().toLowerCase() === email);
  if (index < 0) return null;

  accounts[index].password = newPassword;
  writeAccounts(accounts);
  writePasswordResets(resets.filter((item) => !(item.email === email && item.code === code)));
  return accounts[index];
}

function getLeaderboard() {
  const merged = new Map();
  const normalizeName = (value) => String(value || "").trim().toLowerCase();
  const rememberStudent = (studentLike) => {
    const email = String(studentLike.email || studentLike.studentEmail || "").trim().toLowerCase();
    const phone = String(studentLike.phone || studentLike.studentPhone || "").trim();
    const name = String(studentLike.name || studentLike.studentName || "Unknown student").trim();
    const location = String(studentLike.location || studentLike.studentLocation || "").trim();
    const nameKey = normalizeName(name);
    const preferredKey = email || phone || nameKey;
    if (!preferredKey || nameKey === "unknown student") return null;

    let current = null;
    let currentKey = "";

    for (const [key, value] of merged.entries()) {
      const sameEmail = !!(email && value.email === email);
      const samePhone = !!(phone && value.phone === phone);
      const sameName = !!(
        !email &&
        !phone &&
        !value.email &&
        !value.phone &&
        nameKey &&
        normalizeName(value.name) === nameKey
      );
      if (sameEmail || samePhone || sameName) {
        current = value;
        currentKey = key;
        break;
      }
    }

    if (!current) {
      const createdAt = studentLike.createdAt || studentLike.updatedAt || new Date().toISOString();
      const base = {
        id: studentLike.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        email,
        phone,
        location,
        xp: 0,
        level: 0,
        streak: 0,
        completedSections: 0,
        averageGrade: 0,
        bestGrade: 0,
        lessonsFinished: 0,
        updatedAt: createdAt
      };
      merged.set(preferredKey, base);
      return base;
    }

    current.name = current.name || name;
    current.email = current.email || email;
    current.phone = current.phone || phone;
    current.location = current.location || location;
    current.updatedAt = current.updatedAt > (studentLike.updatedAt || studentLike.createdAt || current.updatedAt)
      ? current.updatedAt
      : (studentLike.updatedAt || studentLike.createdAt || current.updatedAt);

    if (currentKey && currentKey !== preferredKey && (email || phone)) {
      merged.delete(currentKey);
      merged.set(preferredKey, current);
    }

    return current;
  };

  readAccounts().forEach((account) => {
    ensureAccountStats(account);
    rememberStudent(account);
  });

  readEvents().forEach((event) => {
    if (!event) return;
    const hasIdentity = String(event.studentEmail || "").trim() || String(event.studentPhone || "").trim();
    const hasNamedStudent = String(event.studentName || "").trim() && String(event.studentName || "").trim().toLowerCase() !== "unknown student";
    if (!hasIdentity && !hasNamedStudent) return;
    rememberStudent({
      studentName: event.studentName,
      studentEmail: event.studentEmail,
      studentPhone: event.studentPhone,
      studentLocation: event.studentLocation,
      createdAt: event.createdAt,
      updatedAt: event.createdAt
    });
  });

  readStudentStats().forEach((student) => {
    const current = rememberStudent(student);
    if (!current) return;

    const key = current.email || current.phone || current.name.toLowerCase();
    merged.set(key, {
      ...current,
      name: current.name || String(student.name || "Unknown student").trim(),
      email: current.email || String(student.email || "").trim().toLowerCase(),
      phone: current.phone || String(student.phone || "").trim(),
      location: current.location || student.location || "",
      xp: Math.max(safeNumber(current.xp, 0), safeNumber(student.xp, 0)),
      level: Math.max(safeNumber(current.level, 0), safeNumber(student.level, 0)),
      streak: Math.max(safeNumber(current.streak, 0), safeNumber(student.streak, 0)),
      completedSections: Math.max(safeNumber(current.completedSections, 0), safeNumber(student.completedSections, 0)),
      averageGrade: Math.max(safeNumber(current.averageGrade, 0), safeNumber(student.averageGrade, 0)),
      bestGrade: Math.max(safeNumber(current.bestGrade, 0), safeNumber(student.bestGrade, 0)),
      lessonsFinished: Math.max(safeNumber(current.lessonsFinished, 0), safeNumber(student.lessonsFinished, 0)),
      updatedAt: current.updatedAt > student.updatedAt ? current.updatedAt : student.updatedAt
    });
  });

  return Array.from(merged.values())
    .map((student) => ({
      ...student,
      rankScore: leaderboardScore(student)
    }))
    .sort((a, b) =>
      b.xp - a.xp ||
      b.completedSections - a.completedSections ||
      b.bestGrade - a.bestGrade ||
      b.averageGrade - a.averageGrade ||
      b.lessonsFinished - a.lessonsFinished ||
      b.streak - a.streak ||
      b.rankScore - a.rankScore ||
      a.name.localeCompare(b.name)
    );
}

function getSocialSnapshot(viewerEmail) {
  const accounts = readAccounts();
  const leaderboard = getLeaderboard();
  const accountByEmail = new Map();
  const statsByEmail = new Map();
  const followersByEmail = new Map();
  const followingByEmail = new Map();
  const pendingByEmail = new Map();
  const sentByEmail = new Map();
  const blockedByEmail = new Map();
  const knownStudents = new Map();

  const rememberKnownStudent = (studentLike) => {
    const email = normalizeEmail(studentLike?.email || studentLike?.studentEmail);
    const phone = String(studentLike?.phone || studentLike?.studentPhone || "").trim();
    const name = String(studentLike?.name || studentLike?.studentName || "").trim();
    const key = email || phone || name.toLowerCase();
    if (!key) return null;

    const current = knownStudents.get(key) || {
      id: studentLike?.id || "",
      name: name || "Student",
      email,
      phone
    };

    current.id = current.id || studentLike?.id || "";
    current.name = current.name || name || "Student";
    current.email = current.email || email;
    current.phone = current.phone || phone;
    knownStudents.set(key, current);
    return current;
  };

  accounts.forEach((account) => {
    const normalized = normalizeAccountRecord(account);
    if (normalized.email) {
      accountByEmail.set(normalized.email, normalized);
    }
    rememberKnownStudent(normalized);
  });

  leaderboard.forEach((student, index) => {
    const key = normalizeEmail(student?.email) || String(student?.phone || "").trim() || String(student?.name || "").trim().toLowerCase();
    rememberKnownStudent(student);
    if (!key) return;
    statsByEmail.set(key, {
      rank: index + 1,
      xp: safeNumber(student?.xp, 0),
      level: safeNumber(student?.level, 0),
      streak: safeNumber(student?.streak, 0),
      completedSections: safeNumber(student?.completedSections, 0),
      averageGrade: safeNumber(student?.averageGrade, 0)
    });
  });

  accounts.forEach((account) => {
    const accountEmail = normalizeEmail(account?.email);
    if (!accountEmail) return;
    const normalizedAccount = normalizeAccountRecord(account);
    const following = normalizedAccount.following || [];
    const blocked = normalizedAccount.blocked || [];
    const pending = normalizedAccount.pendingFollowRequests || [];
    const sent = normalizedAccount.sentFollowRequests || [];
    followingByEmail.set(accountEmail, Array.from(new Set(following.map(normalizeEmail).filter(Boolean))));
    blockedByEmail.set(accountEmail, Array.from(new Set(blocked.map(normalizeEmail).filter(Boolean))));
    pendingByEmail.set(accountEmail, Array.from(new Set(pending.map(normalizeEmail).filter(Boolean))));
    sentByEmail.set(accountEmail, Array.from(new Set(sent.map(normalizeEmail).filter(Boolean))));
    following.forEach((followedEmail) => {
      const followed = normalizeEmail(followedEmail);
      if (!followed) return;
      const currentFollowers = followersByEmail.get(followed) || [];
      currentFollowers.push(accountEmail);
      followersByEmail.set(followed, currentFollowers);
    });
  });

  const students = Array.from(knownStudents.values()).map((student) => {
    const email = normalizeEmail(student?.email);
    const followers = Array.from(new Set(followersByEmail.get(email) || []));
    const following = Array.from(new Set(followingByEmail.get(email) || []));
    const pendingFollowRequests = Array.from(new Set(pendingByEmail.get(email) || []));
    const sentFollowRequests = Array.from(new Set(sentByEmail.get(email) || []));
    const viewerBlocked = Array.from(new Set(blockedByEmail.get(viewerEmail) || []));
    const blockedByStudent = Array.from(new Set(blockedByEmail.get(email) || []));
    const viewerPending = Array.from(new Set(pendingByEmail.get(viewerEmail) || []));
    const viewerSent = Array.from(new Set(sentByEmail.get(viewerEmail) || []));
    const statsKey = email || String(student?.phone || "").trim() || String(student?.name || "").trim().toLowerCase();
    const stats = statsByEmail.get(statsKey) || {};
    const account = accountByEmail.get(email) || null;
    return {
      id: student.id || account?.id || "",
      name: student.name || account?.name || "Student",
      email,
      phone: student.phone || account?.phone || "",
      hasAccount: !!account,
      avatarType: account?.avatarType || "emoji",
      avatarValue: account?.avatarValue || "🐯",
      bio: account?.bio || "",
      statusMessage: account?.statusMessage || "",
      settings: normalizeStudentSettings(account?.settings || {}),
      followersCount: followers.length,
      followingCount: following.length,
      followers,
      following,
      pendingFollowRequests,
      sentFollowRequests,
      blocked: Array.from(new Set(blockedByEmail.get(email) || [])),
      isCurrentStudent: email === viewerEmail,
      isFollowing: !!(viewerEmail && viewerEmail !== email && (followingByEmail.get(viewerEmail) || []).includes(email)),
      hasPendingRequestFrom: !!(viewerEmail && viewerEmail !== email && viewerPending.includes(email)),
      hasPendingRequestTo: !!(viewerEmail && viewerEmail !== email && viewerSent.includes(email)),
      isBlocked: !!(viewerEmail && viewerEmail !== email && viewerBlocked.includes(email)),
      blockedYou: !!(viewerEmail && viewerEmail !== email && blockedByStudent.includes(viewerEmail)),
      rank: safeNumber(stats.rank, 0),
      xp: safeNumber(stats.xp, 0),
      level: safeNumber(stats.level, 0),
      streak: safeNumber(stats.streak, 0),
      completedSections: safeNumber(stats.completedSections, 0),
      averageGrade: safeNumber(stats.averageGrade, 0)
    };
  }).sort((a, b) => {
    if (a.isCurrentStudent) return -1;
    if (b.isCurrentStudent) return 1;
    if (b.xp !== a.xp) return b.xp - a.xp;
    if (b.averageGrade !== a.averageGrade) return b.averageGrade - a.averageGrade;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const currentStudent = students.find((student) => student.isCurrentStudent) || null;
  const currentBlocked = currentStudent?.blocked || [];
  const followingStudents = currentStudent
    ? students.filter((student) => currentStudent.following.includes(student.email) && !student.blockedYou)
    : [];
  const followerStudents = currentStudent
    ? students.filter((student) => currentStudent.followers.includes(student.email) && !currentBlocked.includes(student.email))
    : [];
  const requestStudents = currentStudent
    ? students.filter((student) => currentStudent.pendingFollowRequests.includes(student.email) && !currentBlocked.includes(student.email))
    : [];
  const outgoingRequestStudents = currentStudent
    ? students.filter((student) => currentStudent.sentFollowRequests.includes(student.email) && !student.blockedYou)
    : [];
  const suggestedStudents = students.filter((student) =>
    !student.isCurrentStudent &&
    !(currentStudent?.following || []).includes(student.email) &&
    !(currentStudent?.sentFollowRequests || []).includes(student.email) &&
    !(currentStudent?.pendingFollowRequests || []).includes(student.email) &&
    !(currentBlocked || []).includes(student.email) &&
    !student.blockedYou
  ).slice(0, 8);

  return {
    currentStudent,
    followingStudents,
    followerStudents,
    requestStudents,
    outgoingRequestStudents,
    suggestedStudents,
    students
  };
}

function getStudentProfile(viewerEmail, targetEmail) {
  const snapshot = getSocialSnapshot(viewerEmail);
  const target = (snapshot.students || []).find((student) => normalizeEmail(student?.email) === targetEmail) || null;
  if (!target) return null;

  const current = snapshot.currentStudent || null;
  const currentBlocked = current?.blocked || [];

  return {
    ...target,
    followerStudents: (snapshot.students || []).filter((student) => (target.followers || []).includes(student.email)),
    followingStudents: (snapshot.students || []).filter((student) => (target.following || []).includes(student.email)),
    pendingRequestStudents: (snapshot.students || []).filter((student) => (target.pendingFollowRequests || []).includes(student.email)),
    sentRequestStudents: (snapshot.students || []).filter((student) => (target.sentFollowRequests || []).includes(student.email)),
    canFollow: !target.isCurrentStudent && !target.isBlocked && !target.blockedYou && !target.isFollowing && !target.hasPendingRequestTo,
    canBlock: !target.isCurrentStudent,
    visibleToViewer: !currentBlocked.includes(target.email),
    profileStatus: target.blockedYou
      ? "This student blocked you."
      : target.isBlocked
        ? "You blocked this student."
        : target.isFollowing
          ? "You are following this student."
          : target.hasPendingRequestFrom
            ? "This student asked to follow you."
            : target.hasPendingRequestTo
              ? "Your follow request is waiting."
              : "You can send a follow request."
  };
}

function getOwnerStudentRoster() {
  const students = new Map();
  const leaderboard = getLeaderboard();
  const leaderboardByEmail = new Map();

  const rememberStudent = (studentLike) => {
    const email = normalizeEmail(studentLike?.email || studentLike?.studentEmail);
    const phone = String(studentLike?.phone || studentLike?.studentPhone || "").trim();
    const name = String(studentLike?.name || studentLike?.studentName || "").trim();
    const location = String(studentLike?.location || studentLike?.studentLocation || "").trim();
    const key = email || phone || name.toLowerCase();
    if (!key) return null;

    const current = students.get(key) || {
      id: studentLike?.id || "",
      name: name || "Student",
      email,
      phone,
      location,
      createdAt: studentLike?.createdAt || "",
      lastSeenAt: "",
      lastPresenceAt: "",
      lastPresencePage: "",
      presenceOnline: false,
      latestAction: "",
      xp: 0,
      averageGrade: 0,
      completedSections: 0,
      rank: 0
    };

    current.id = current.id || studentLike?.id || "";
    current.name = current.name || name || "Student";
    current.email = current.email || email;
    current.phone = current.phone || phone;
    current.location = current.location || location;
    current.createdAt = current.createdAt || studentLike?.createdAt || "";
    students.set(key, current);
    return current;
  };

  leaderboard.forEach((student, index) => {
    const email = normalizeEmail(student?.email);
    if (email) {
      leaderboardByEmail.set(email, { ...student, rank: index + 1 });
    }
    const current = rememberStudent(student);
    if (!current) return;
    current.rank = index + 1;
    current.xp = safeNumber(student?.xp, current.xp);
    current.averageGrade = safeNumber(student?.averageGrade, current.averageGrade);
    current.completedSections = safeNumber(student?.completedSections, current.completedSections);
  });

  readAccounts().forEach((account) => {
    const current = rememberStudent(account);
    if (!current) return;
    current.createdAt = current.createdAt || account.createdAt || "";
    current.lastPresenceAt = String(account?.lastPresenceAt || "");
    current.lastPresencePage = String(account?.lastPresencePage || "");
    current.presenceOnline = account?.presenceOnline === true;
    const fromBoard = leaderboardByEmail.get(normalizeEmail(account.email));
    if (fromBoard) {
      current.rank = current.rank || fromBoard.rank || 0;
      current.xp = Math.max(current.xp, safeNumber(fromBoard.xp, 0));
      current.averageGrade = Math.max(current.averageGrade, safeNumber(fromBoard.averageGrade, 0));
      current.completedSections = Math.max(current.completedSections, safeNumber(fromBoard.completedSections, 0));
    }
  });

  readEvents().forEach((event) => {
    const current = rememberStudent(event);
    if (!current) return;
    const createdAt = String(event?.createdAt || "");
    if (!current.lastSeenAt || new Date(createdAt).getTime() > new Date(current.lastSeenAt).getTime()) {
      current.lastSeenAt = createdAt;
      current.latestAction = String(event?.label || event?.type || "Activity");
      current.location = current.location || String(event?.studentLocation || "").trim();
    }
  });

  const presenceCutoff = Date.now() - (75 * 1000);
  students.forEach((student) => {
    const presenceTime = new Date(student.lastPresenceAt || 0).getTime();
    student.online = Boolean(
      student.presenceOnline &&
      Number.isFinite(presenceTime) &&
      presenceTime >= presenceCutoff
    );
    if (presenceTime && (!student.lastSeenAt || presenceTime > new Date(student.lastSeenAt).getTime())) {
      student.lastSeenAt = student.lastPresenceAt;
      student.latestAction = student.online ? `Online on ${student.lastPresencePage || "Pilingo"}` : "Left the app";
    }
  });

  return Array.from(students.values())
    .sort((a, b) => {
      const aSeen = new Date(a.lastSeenAt || a.createdAt || 0).getTime();
      const bSeen = new Date(b.lastSeenAt || b.createdAt || 0).getTime();
      return bSeen - aSeen || String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function leaderboardScore(student) {
  return (
    (safeNumber(student.xp, 0) * 1000) +
    (safeNumber(student.completedSections, 0) * 200) +
    (safeNumber(student.bestGrade, 0) * 5) +
    (safeNumber(student.averageGrade, 0) * 3) +
    (safeNumber(student.lessonsFinished, 0) * 10) +
    (safeNumber(student.streak, 0) * 2)
  );
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function sendNotifications(event) {
  await Promise.allSettled([
    sendTelegramNotification(event),
    sendEmailNotification(event)
  ]);
}

async function sendTelegramNotification(event) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const text = [
    "Pilingo student activity",
    `Student: ${event.studentName || "Unknown student"}`,
    `Email: ${event.studentEmail || ""}`,
    `Phone: ${event.studentPhone || ""}`,
    `Location: ${event.studentLocation || ""}`,
    `Action: ${event.label || event.type || "Activity"}`,
    `Page: ${event.page || ""}`,
    `Time: ${event.createdAt || ""}`
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text
    })
  });
}

async function sendEmailNotification(event) {
  if (!RESEND_API_KEY || !EMAIL_TO || !EMAIL_FROM) return;

  const subject = `Pilingo student activity: ${event.label || event.type || "Activity"}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Pilingo student activity</h2>
      <p><strong>Student:</strong> ${escapeHtml(event.studentName || "Unknown student")}</p>
      <p><strong>Email:</strong> ${escapeHtml(event.studentEmail || "")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(event.studentPhone || "")}</p>
      <p><strong>Location:</strong> ${escapeHtml(event.studentLocation || "")}</p>
      <p><strong>Action:</strong> ${escapeHtml(event.label || event.type || "Activity")}</p>
      <p><strong>Page:</strong> ${escapeHtml(event.page || "")}</p>
      <p><strong>Time:</strong> ${escapeHtml(event.createdAt || "")}</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [EMAIL_TO],
      subject,
      html
    })
  });
}

async function sendPasswordResetCode(account, code) {
  const event = {
    studentName: account.name,
    studentEmail: account.email,
    studentPhone: account.phone,
    studentLocation: account.location || "",
    label: "Requested password reset",
    type: "password_reset",
    page: "index.html",
    createdAt: new Date().toISOString()
  };

  await Promise.allSettled([
    sendTelegramNotification(event),
    sendEmailNotification(event)
  ]);

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return { deliveredByEmail: false };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Pilingo password reset</h2>
      <p>Your reset code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(code)}</p>
      <p>This code works for 15 minutes.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [account.email],
      subject: "Your Pilingo password reset code",
      html
    })
  });

  return { deliveredByEmail: response.ok };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
