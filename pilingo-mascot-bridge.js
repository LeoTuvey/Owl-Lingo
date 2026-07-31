(function(){
  if(!window.PilingoMascot || document.querySelector("#lessonMascot, #engineMascot, #homeMascot")) return;

  const style = document.createElement("style");
  style.textContent = `
    .pilingo-lesson-guide{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:40;width:104px;height:112px;pointer-events:none}
    .pilingo-lesson-guide .pilingo-mascot{pointer-events:auto}
    @media(max-width:520px){.pilingo-lesson-guide{width:78px;height:86px;opacity:.96}}
  `;
  document.head.appendChild(style);

  const slot = document.createElement("div");
  slot.id = "pilingoLessonGuide";
  slot.className = "pilingo-lesson-guide";
  slot.setAttribute("aria-live", "polite");
  document.body.appendChild(slot);
  PilingoMascot.mount(slot, { size:104, screen:"lesson-guide", compact:true, state:"idle" });

  function react(kind){
    const config = kind === "correct"
      ? { animation:"thumbs-up", category:"correct", duration:1250, speak:false }
      : kind === "wrong"
        ? { animation:"encourage", category:"wrong", duration:1700, speak:false }
        : { animation:"celebrate", category:"lessonComplete", duration:2200, speak:false };
    PilingoMascot.showMessage(Object.assign({ target:slot }, config));
  }

  document.addEventListener("click", function(event){
    if(!event.target.closest("button")) return;
    window.setTimeout(function(){
      const feedback = document.querySelector("#feedback");
      const text = (feedback?.textContent || "").toLowerCase();
      if(text.includes("correct") || text.includes("rast") || text.includes("rätt")) react("correct");
      else if(text.includes("try") || text.includes("dîsa") || text.includes("försök")) react("wrong");
    }, 40);
  });

  const observer = new MutationObserver(function(){
    const text = (document.querySelector(".card")?.innerText || "").toLowerCase();
    if(text.includes("you finished this lesson") || text.includes("lesson complete")){
      react("complete");
      PilingoMascot.showReward({
        title:"Amazing work!",
        message:"You finished the lesson. Keep going!",
        animation:"celebrate",
        duration:2000,
        speak:false
      });
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });
})();
