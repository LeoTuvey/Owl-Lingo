const PilingoRatings = {
  endpoint: location.hostname.endsWith("github.io")
    ? "https://pilingo.onrender.com/api/ratings"
    : "/api/ratings",
  selected:0,
  saving:false,

  accountEmail(){
    return String(window.PilingoAuth?.loadAccount?.()?.email || "").trim().toLowerCase();
  },

  async request(url, options = {}){
    const response = await fetch(url, { cache:"no-store", ...options });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || payload?.ok === false){
      throw new Error(payload?.error || "Could not save your rating.");
    }
    return payload;
  },

  paint(payload = {}){
    const average = Number(payload.average || 0);
    const count = Number(payload.count || 0);
    this.selected = Number(payload.userRating || this.selected || 0);
    const averageNode = document.getElementById("appRatingAverage");
    const countNode = document.getElementById("appRatingCount");
    const statusNode = document.getElementById("appRatingStatus");
    if(averageNode && Object.prototype.hasOwnProperty.call(payload, "average")) averageNode.textContent = count ? average.toFixed(1) : "New";
    if(countNode && Object.prototype.hasOwnProperty.call(payload, "count")) countNode.textContent = count === 1 ? "1 learner rating" : `${count} learner ratings`;
    document.querySelectorAll("[data-app-rating]").forEach((button) => {
      const value = Number(button.dataset.appRating || 0);
      button.classList.toggle("selected", value <= this.selected);
      button.setAttribute("aria-pressed", value === this.selected ? "true" : "false");
    });
    if(statusNode && !statusNode.dataset.message){
      statusNode.textContent = this.selected ? `Your rating: ${this.selected} out of 5.` : "Tap a star to rate Pilingo.";
    }
  },

  async load(){
    const email = this.accountEmail();
    if(!email) return;
    try {
      this.paint(await this.request(`${this.endpoint}?email=${encodeURIComponent(email)}`));
    } catch(error) {
      const statusNode = document.getElementById("appRatingStatus");
      if(statusNode) statusNode.textContent = "Ratings will appear when you are online.";
    }
  },

  async rate(value){
    if(this.saving) return;
    const email = this.accountEmail();
    const statusNode = document.getElementById("appRatingStatus");
    if(!email){
      if(statusNode) statusNode.textContent = "Please sign in before rating Pilingo.";
      return;
    }
    this.selected = Number(value);
    this.paint({ userRating:this.selected });
    this.saving = true;
    if(statusNode){
      statusNode.dataset.message = "saving";
      statusNode.textContent = "Saving your rating…";
    }
    try {
      const payload = await this.request(this.endpoint, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ email, rating:this.selected })
      });
      if(statusNode){
        statusNode.dataset.message = "saved";
        statusNode.textContent = "Thanks—your rating is now public.";
      }
      this.paint(payload);
    } catch(error) {
      if(statusNode){
        statusNode.dataset.message = "error";
        statusNode.textContent = error?.message || "Could not save your rating.";
      }
    } finally {
      this.saving = false;
      window.setTimeout(() => {
        if(statusNode) delete statusNode.dataset.message;
      }, 2400);
    }
  },

  init(){
    document.querySelectorAll("[data-app-rating]").forEach((button) => {
      button.addEventListener("click", () => this.rate(Number(button.dataset.appRating)));
    });
    this.load();
  }
};

window.PilingoRatings = PilingoRatings;
