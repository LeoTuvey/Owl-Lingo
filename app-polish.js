const AppPolish = {
  _buttonPressReady:false,
  _activePressedButtons:new Set(),

  _getPressableButton(target){
    if(!target?.closest) return null;

    const el = target.closest('button, [role="button"]');
    if(!el) return null;
    if(el.matches(".continue-swipe")) return null;
    if(el.disabled || el.getAttribute("aria-disabled") === "true") return null;
    return el;
  },

  _applyPressedState(el, pointerType = "mouse"){
    if(!el || this._activePressedButtons.has(el)) return;

    this._activePressedButtons.add(el);
    el.classList.add("is-pressed");

    if(el.dataset.pressOriginalTransition === undefined){
      el.dataset.pressOriginalTransition = el.style.transition || "";
    }
    if(el.dataset.pressOriginalTransform === undefined){
      el.dataset.pressOriginalTransform = el.style.transform || "";
    }

    el.style.transition = [
      el.dataset.pressOriginalTransition,
      "transform 135ms cubic-bezier(0.2, 0.75, 0.25, 1)",
      "filter 135ms ease",
      "box-shadow 135ms ease"
    ].filter(Boolean).join(", ");
    el.dataset.pressPointerType = pointerType;
    el.style.transform = pointerType === "mouse"
      ? `${el.dataset.pressOriginalTransform || ""} translateY(4px) scale(0.965)`.trim()
      : (el.dataset.pressOriginalTransform || "");
    el.style.filter = "brightness(0.97)";
  },

  _releasePressedState(el){
    if(!el || !this._activePressedButtons.has(el)) return;

    this._activePressedButtons.delete(el);
    el.classList.remove("is-pressed");
    el.style.transform = el.dataset.pressOriginalTransform || "";
    el.style.filter = "";
    delete el.dataset.pressPointerType;

    window.setTimeout(() => {
      if(!this._activePressedButtons.has(el)){
        el.style.transition = el.dataset.pressOriginalTransition || "";
      }
    }, 150);
  },

  initButtonPressEffects(){
    if(this._buttonPressReady || !document?.body) return;
    this._buttonPressReady = true;

    document.addEventListener("pointerdown", (event) => {
      const button = this._getPressableButton(event.target);
      if(button) this._applyPressedState(button, event.pointerType || "mouse");
    }, { capture:true, passive:true });

    document.addEventListener("pointerup", () => {
      this._activePressedButtons.forEach((button) => this._releasePressedState(button));
    }, { capture:true, passive:true });

    document.addEventListener("pointercancel", () => {
      this._activePressedButtons.forEach((button) => this._releasePressedState(button));
    }, { capture:true, passive:true });

    document.addEventListener("keydown", (event) => {
      if(event.repeat) return;
      if(event.key !== "Enter" && event.key !== " ") return;
      const button = this._getPressableButton(event.target);
      if(button) this._applyPressedState(button);
    }, true);

    document.addEventListener("keyup", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      const button = this._getPressableButton(event.target);
      if(button) this._releasePressedState(button);
    }, true);

    window.addEventListener("blur", () => {
      this._activePressedButtons.forEach((button) => this._releasePressedState(button));
    });

    document.addEventListener("visibilitychange", () => {
      if(document.hidden){
        this._activePressedButtons.forEach((button) => this._releasePressedState(button));
      }
    });
  },

  setMood(state){
    if(window.playPilingoAnimation){
      if(state === "correct") playPilingoAnimation("smile");
      else if(state === "wrong") playPilingoAnimation("think");
      else if(state === "levelup") playPilingoAnimation("celebrate");
    }

    const owl =
      document.getElementById("owl") ||
      document.getElementById("owlGuide");

    if(!owl) return;

    owl.classList.remove("happy","sad","celebrate","levelup");

    if(state === "correct") owl.classList.add("happy");
    else if(state === "wrong") owl.classList.add("sad");
    else if(state === "levelup") owl.classList.add("celebrate");
  },

  xpPopup(amount){

    if (!document?.body) return;

    const value = Number(amount) || 0;

    const el = document.createElement("div");

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div id="xpPopupMascot" style="width:52px;height:52px;"></div>
        <span>+${value} XP</span>
      </div>
    `;

    Object.assign(el.style, {
      position: "fixed",
      top: "20%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#58cc02",
      color: "white",
      padding: "10px 16px",
      borderRadius: "20px",
      fontWeight: "bold",
      zIndex: "9999",
      opacity: "0",
      transition: "opacity 0.3s"
    });

    document.body.appendChild(el);
    if(window.PilingoMascot){
      PilingoMascot.mount("#xpPopupMascot", {
        size: 52,
        screen: "xp",
        compact: true,
        float: false,
        state: "celebrate"
      });
    }

    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });

    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }, 900);
  },

  unlockBadge(id){

    try {
      const badges = JSON.parse(localStorage.getItem("badges") || "[]");

      if(!badges.includes(id)){
        badges.push(id);
        localStorage.setItem("badges", JSON.stringify(badges));
        this.showBadgePopup(id);
      }
    } catch {}
  },

  showBadgePopup(id){

    if (!document?.body) return;

    const el = document.createElement("div");

    el.innerHTML = "🏅 Badge Unlocked: " + id;

    Object.assign(el.style, {
      position: "fixed",
      top: "40%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      background: "#000",
      color: "#fff",
      padding: "20px",
      borderRadius: "15px",
      zIndex: "9999"
    });

    document.body.appendChild(el);

    setTimeout(() => el.remove(), 1500);
  },

  getStreakLevel(){

    try {
      const streak =
        typeof window.Engine?.updateStreak === "function"
          ? window.Engine.updateStreak()
          : 0;

      const safe = Number(streak) || 0;

      if(safe >= 10) return "🔥🔥🔥";
      if(safe >= 5) return "🔥🔥";
      if(safe >= 1) return "🔥";

      return "";

    } catch {
      return "";
    }
  },

  firstTimeCheck(){

    try {
      const seen = localStorage.getItem("seenIntro");

      if(!seen){
        localStorage.setItem("seenIntro", "true");

        const path = window.location.pathname || "";
        const isIndex =
          path.endsWith("index.html") || path === "/";

        if(!isIndex){
          window.location.href = "index.html";
        }
      }
    } catch {}
  },

  flash(type){

    if (!document?.body) return;

    const safeType = ["correct","wrong","levelup"].includes(type)
      ? type
      : "default";

    const existing = document.getElementById("owl-flash");
    if(existing) existing.remove();

    const el = document.createElement("div");
    el.id = "owl-flash";

    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "9999",
      opacity: "0.12"
    });

    const colors = {
      correct: "green",
      wrong: "red",
      levelup: "gold",
      default: "white"
    };

    el.style.background = colors[safeType];

    document.body.appendChild(el);

    setTimeout(() => el.remove(), 250);
  }
};

window.AppPolish = AppPolish;

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => AppPolish.initButtonPressEffects(), { once:true });
} else {
  AppPolish.initButtonPressEffects();
}
