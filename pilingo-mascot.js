(function(){
  const STYLE_ID = "pilingo-mascot-styles";
  const BUBBLE_LAYER_ID = "pilingo-mascot-bubble-layer";
  const DEFAULT_STATE = "idle";
  const TRANSIENT_STATES = new Set([
    "wave", "high-five", "thumbs-up", "point-left", "point-right", "nod", "shake",
    "smile", "jump", "laugh", "think", "read", "write", "talk", "listen", "clap",
    "dance", "celebrate", "trophy", "star", "heart", "sleep", "yawn", "stretch",
    "surprised", "sad", "encourage"
  ]);
  const INSTANCES = new Map();
  const MESSAGE_GROUPS = {
    correct: [
      "Excellent!",
      "Great job!",
      "Well done!",
      "You're doing great!",
      "Fantastic!",
      "Keep going!",
      "Awesome!",
      "You got it!"
    ],
    wrong: [
      "Almost!",
      "Try again!",
      "You can do it!",
      "Keep practicing!",
      "Don't give up!",
      "Let's try once more!",
      "You're improving!"
    ],
    lessonComplete: [
      "Lesson Complete!",
      "Excellent work!",
      "You finished the lesson!",
      "Amazing progress!",
      "Keep learning!"
    ],
    quizComplete: [
      "Quiz Complete!",
      "You did it!",
      "Great work!",
      "Ready for the next challenge?",
      "Let's continue!"
    ],
    achievement: [
      "Amazing progress!",
      "You're on fire!",
      "Big win!",
      "Keep shining!",
      "That was strong!"
    ]
  };

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .pilingo-mascot{
        --pilingo-size: 128px;
        --pilingo-drop: 0 10px 22px rgba(27, 52, 18, 0.18);
        --pilingo-speed: 1;
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--pilingo-size);
        max-width: 100%;
        filter: drop-shadow(var(--pilingo-drop));
        transform-origin: center bottom;
      }

      .pilingo-mascot.is-reaction-zoom{
        animation: pilingoReactionZoom 0.58s cubic-bezier(0.2, 0.84, 0.24, 1.06);
      }

      .pilingo-mascot svg{
        width: 100%;
        height: auto;
        overflow: visible;
        display: block;
      }

      .pilingo-mascot.is-compact{
        --pilingo-drop: 0 6px 14px rgba(27, 52, 18, 0.14);
      }

      .pilingo-mascot.is-home{
        --pilingo-drop: 0 12px 24px rgba(157, 112, 8, 0.22);
      }

      .pilingo-mascot.is-speaking [data-face="mouth-happy"],
      .pilingo-mascot.is-speaking [data-face="mouth-small"]{
        display:none;
      }

      .pilingo-mascot.is-speaking [data-face="mouth-open"]{
        display:block;
        animation:pilingoTalkMouth 0.32s infinite ease-in-out;
      }

      .pilingo-mascot.is-speaking [data-part="head"]{
        animation:pilingoTalkHead 0.58s infinite ease-in-out;
      }

      .pilingo-mascot-bubble-layer{
        position:fixed;
        inset:0;
        pointer-events:none;
        z-index:12000;
      }

      .pilingo-reward-video{
        position:fixed;
        inset:0;
        z-index:15000;
        display:grid;
        place-items:center;
        padding:24px;
        background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.98),rgba(255,247,205,.96) 46%,rgba(224,250,230,.96));
        opacity:0;
        transition:opacity .2s ease;
        overflow:hidden;
      }
      .pilingo-reward-video.show{opacity:1}
      .pilingo-reward-video-card{text-align:center;position:relative;z-index:2;animation:pilingoRewardCard .55s cubic-bezier(.2,.9,.25,1.2)}
      .pilingo-reward-video-mascot{width:min(260px,62vw);height:min(300px,52vh);display:grid;place-items:center;margin:auto}
      .pilingo-reward-video-mascot img{
        width:100%;
        height:100%;
        object-fit:contain;
        display:block;
        filter:drop-shadow(0 18px 18px rgba(77,55,8,.2));
        animation:pilingoNewMascotCelebrate .72s ease-in-out infinite;
      }
      .pilingo-reward-video h2{margin:2px 0 8px;color:#195f37;font-size:clamp(30px,7vw,58px);font-weight:1000}
      .pilingo-reward-video p{margin:0;color:#4a5b4e;font-size:clamp(17px,3.8vw,23px);font-weight:900}
      .pilingo-reward-video-spark{position:absolute;font-size:clamp(24px,5vw,52px);animation:pilingoRewardSpark 1.2s ease-in-out infinite}
      .pilingo-reward-video-spark.s1{left:12%;top:18%}.pilingo-reward-video-spark.s2{right:12%;top:22%;animation-delay:.2s}
      .pilingo-reward-video-spark.s3{left:20%;bottom:15%;animation-delay:.4s}.pilingo-reward-video-spark.s4{right:20%;bottom:14%;animation-delay:.6s}

      .pilingo-speech-bubble{
        position:fixed;
        max-width:min(260px, calc(100vw - 24px));
        background:linear-gradient(180deg, #ffffff 0%, #fffaf0 100%);
        border:3px solid #f1d16f;
        border-radius:22px;
        box-shadow:0 18px 34px rgba(36, 52, 27, 0.18);
        color:#28411d;
        padding:12px 14px;
        font-size:14px;
        line-height:1.4;
        font-weight:900;
        opacity:0;
        transform:translateY(10px) scale(0.96);
        transition:opacity 180ms ease, transform 180ms ease;
      }

      .pilingo-speech-bubble.show{
        opacity:1;
        transform:translateY(0) scale(1);
      }

      .pilingo-speech-bubble::after{
        content:"";
        position:absolute;
        width:18px;
        height:18px;
        background:#fffaf0;
        border-right:3px solid #f1d16f;
        border-bottom:3px solid #f1d16f;
        transform:rotate(45deg);
        bottom:-11px;
        right:28px;
      }

      .pilingo-speech-bubble.is-left::after{
        right:auto;
        left:28px;
      }

      .pilingo-speech-bubble-score{
        display:block;
        margin-top:6px;
        color:#0e7a41;
        font-size:13px;
        font-weight:1000;
      }

      .pilingo-mascot.is-float{
        animation: pilingoFloat 4s ease-in-out infinite;
      }

      .pilingo-mascot [data-part="pilingo"]{ transform-origin: 200px 235px; }
      .pilingo-mascot [data-part="head"]{ transform-origin: 200px 120px; }
      .pilingo-mascot [data-part="left-arm"]{ transform-origin: 155px 205px; }
      .pilingo-mascot [data-part="right-arm"]{ transform-origin: 245px 205px; }
      .pilingo-mascot [data-part="left-leg"]{ transform-origin: 172px 315px; }
      .pilingo-mascot [data-part="right-leg"]{ transform-origin: 228px 315px; }
      .pilingo-mascot [data-part="tail"]{ transform-origin: 260px 300px; }
      .pilingo-mascot [data-part="brow-left"],
      .pilingo-mascot [data-part="brow-right"]{ transform-origin: center center; }
      .pilingo-mascot [data-prop]{ display:none; }

      .pilingo-mascot [data-face="eyes-smile"],
      .pilingo-mascot [data-face="mouth-open"],
      .pilingo-mascot [data-face="mouth-small"]{
        display: none;
      }

      .pilingo-mascot.is-idle [data-part="pilingo"]{ animation: pilingoIdle calc(2.4s / var(--pilingo-speed)) infinite ease-in-out; }
      .pilingo-mascot.is-idle [data-part="tail"]{ animation: pilingoTail calc(1.6s / var(--pilingo-speed)) infinite ease-in-out; }
      .pilingo-mascot.is-idle [data-face="eye-left"],
      .pilingo-mascot.is-idle [data-face="eye-right"]{ animation: pilingoBlink calc(4.2s / var(--pilingo-speed)) infinite; }

      .pilingo-mascot.is-blink [data-face="eye-left"],
      .pilingo-mascot.is-blink [data-face="eye-right"]{ animation: pilingoBlink 0.45s 1 both; }

      .pilingo-mascot.is-smile [data-face="mouth-happy"]{ display: block; }
      .pilingo-mascot.is-smile [data-part="pilingo"]{ animation: pilingoSmile 0.9s ease-in-out infinite; }
      .pilingo-mascot.is-smile [data-part="tail"]{ animation: pilingoTail 1s ease-in-out infinite; }

      .pilingo-mascot.is-wave [data-part="right-arm"]{ animation: pilingoWave 0.75s infinite ease-in-out; }
      .pilingo-mascot.is-wave [data-part="pilingo"]{ animation: pilingoBounce 0.75s infinite ease-in-out; }

      .pilingo-mascot.is-walk [data-part="pilingo"]{ animation: pilingoWalk 0.65s infinite ease-in-out; }
      .pilingo-mascot.is-walk [data-part="left-leg"]{ animation: pilingoLegForward 0.65s infinite ease-in-out; }
      .pilingo-mascot.is-walk [data-part="right-leg"]{ animation: pilingoLegBack 0.65s infinite ease-in-out; }
      .pilingo-mascot.is-walk [data-part="left-arm"]{ animation: pilingoArmBack 0.65s infinite ease-in-out; }
      .pilingo-mascot.is-walk [data-part="right-arm"]{ animation: pilingoArmForward 0.65s infinite ease-in-out; }
      .pilingo-mascot.is-walk [data-part="tail"]{ animation: pilingoTail 0.65s infinite ease-in-out; }

      .pilingo-mascot.is-run{ --pilingo-speed: 1.35; }
      .pilingo-mascot.is-run [data-part="pilingo"]{ animation: pilingoWalk 0.44s infinite ease-in-out; }
      .pilingo-mascot.is-run [data-part="left-leg"]{ animation: pilingoLegForward 0.44s infinite ease-in-out; }
      .pilingo-mascot.is-run [data-part="right-leg"]{ animation: pilingoLegBack 0.44s infinite ease-in-out; }
      .pilingo-mascot.is-run [data-part="left-arm"]{ animation: pilingoArmBack 0.44s infinite ease-in-out; }
      .pilingo-mascot.is-run [data-part="right-arm"]{ animation: pilingoArmForward 0.44s infinite ease-in-out; }
      .pilingo-mascot.is-run [data-part="tail"]{ animation: pilingoTail 0.42s infinite ease-in-out; }

      .pilingo-mascot.is-jump [data-part="pilingo"]{ animation: pilingoJump 0.9s infinite ease-in-out; }
      .pilingo-mascot.is-jump [data-part="tail"]{ animation: pilingoTail 0.75s infinite ease-in-out; }

      .pilingo-mascot.is-laugh [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-laugh [data-face="mouth-open"]{ display: block; }
      .pilingo-mascot.is-laugh [data-face="eyes-smile"]{ display: block; }
      .pilingo-mascot.is-laugh [data-face="eye-left"],
      .pilingo-mascot.is-laugh [data-face="eye-right"]{ display: none; }
      .pilingo-mascot.is-laugh [data-part="pilingo"]{ animation: pilingoLaugh 0.35s infinite ease-in-out; }

      .pilingo-mascot.is-think [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-think [data-face="mouth-small"]{ display: block; }
      .pilingo-mascot.is-think [data-part="head"]{ animation: pilingoThink 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-think [data-part="brow-left"]{ animation: pilingoBrowLeft 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-think [data-part="brow-right"]{ animation: pilingoBrowRight 1.1s infinite ease-in-out; }

      .pilingo-mascot.is-read [data-face="mouth-small"]{ display: block; }
      .pilingo-mascot.is-read [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-read [data-part="head"]{ animation: pilingoRead 1.3s infinite ease-in-out; }
      .pilingo-mascot.is-read [data-part="left-arm"]{ animation: pilingoReadLeftArm 1.3s infinite ease-in-out; }
      .pilingo-mascot.is-read [data-part="right-arm"]{ animation: pilingoReadRightArm 1.3s infinite ease-in-out; }

      .pilingo-mascot.is-write [data-face="mouth-small"]{ display: block; }
      .pilingo-mascot.is-write [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-write [data-part="left-arm"]{ animation: pilingoWriteLeftArm 0.7s infinite ease-in-out; }
      .pilingo-mascot.is-write [data-part="right-arm"]{ animation: pilingoWriteRightArm 0.7s infinite ease-in-out; }
      .pilingo-mascot.is-write [data-part="head"]{ animation: pilingoRead 1.1s infinite ease-in-out; }

      .pilingo-mascot.is-talk [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-talk [data-face="mouth-open"]{ display: block; }
      .pilingo-mascot.is-talk [data-part="head"]{ animation: pilingoTalk 0.72s infinite ease-in-out; }

      .pilingo-mascot.is-listen [data-face="mouth-small"]{ display: block; }
      .pilingo-mascot.is-listen [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-listen [data-part="head"]{ animation: pilingoListen 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-listen [data-part="right-ear-bob"]{ animation: pilingoEarBob 1.1s infinite ease-in-out; }

      .pilingo-mascot.is-celebrate [data-part="pilingo"]{ animation: pilingoCelebrate 0.8s infinite ease-in-out; }
      .pilingo-mascot.is-celebrate [data-part="left-arm"]{ animation: pilingoArmUpLeft 0.8s infinite ease-in-out; }
      .pilingo-mascot.is-celebrate [data-part="right-arm"]{ animation: pilingoArmUpRight 0.8s infinite ease-in-out; }
      .pilingo-mascot.is-celebrate [data-decor="confetti"]{ display: block; animation: pilingoConfetti 1s infinite ease-in-out; }

      .pilingo-mascot.is-sad [data-face="mouth-happy"]{ display: none; }
      .pilingo-mascot.is-sad [data-face="mouth-small"]{ display: block; }
      .pilingo-mascot.is-sad [data-part="pilingo"]{ animation: pilingoSad 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-sad [data-part="tail"]{ animation: pilingoTailSad 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-sad [data-part="brow-left"]{ animation: pilingoBrowLeftSad 1.1s infinite ease-in-out; }
      .pilingo-mascot.is-sad [data-part="brow-right"]{ animation: pilingoBrowRightSad 1.1s infinite ease-in-out; }

      .pilingo-mascot.is-high-five [data-part="right-arm"],
      .pilingo-mascot.is-thumbs-up [data-part="right-arm"]{ animation:pilingoHighFive .7s ease-in-out infinite; }
      .pilingo-mascot.is-point-left [data-part="left-arm"]{ animation:pilingoPointLeft .8s ease-in-out infinite; }
      .pilingo-mascot.is-point-right [data-part="right-arm"]{ animation:pilingoPointRight .8s ease-in-out infinite; }
      .pilingo-mascot.is-nod [data-part="head"]{ animation:pilingoNod .65s ease-in-out infinite; }
      .pilingo-mascot.is-shake [data-part="head"]{ animation:pilingoShake .55s ease-in-out infinite; }
      .pilingo-mascot.is-clap [data-part="left-arm"]{ animation:pilingoClapLeft .48s ease-in-out infinite; }
      .pilingo-mascot.is-clap [data-part="right-arm"]{ animation:pilingoClapRight .48s ease-in-out infinite; }
      .pilingo-mascot.is-dance [data-part="pilingo"]{ animation:pilingoDance .72s ease-in-out infinite; }
      .pilingo-mascot.is-dance [data-part="left-arm"]{ animation:pilingoArmUpLeft .72s ease-in-out infinite; }
      .pilingo-mascot.is-dance [data-part="right-arm"]{ animation:pilingoArmUpRight .72s ease-in-out infinite reverse; }
      .pilingo-mascot.is-sleep [data-part="pilingo"]{ animation:pilingoSleep 2.4s ease-in-out infinite; }
      .pilingo-mascot.is-sleep [data-face="eye-left"],
      .pilingo-mascot.is-sleep [data-face="eye-right"]{ transform:scaleY(.08); }
      .pilingo-mascot.is-yawn [data-face="mouth-happy"]{ display:none; }
      .pilingo-mascot.is-yawn [data-face="mouth-open"]{ display:block; animation:pilingoYawn 1.2s ease-in-out infinite; }
      .pilingo-mascot.is-stretch [data-part="pilingo"]{ animation:pilingoStretch 1.1s ease-in-out infinite; }
      .pilingo-mascot.is-stretch [data-part="left-arm"]{ animation:pilingoArmUpLeft 1.1s ease-in-out infinite; }
      .pilingo-mascot.is-stretch [data-part="right-arm"]{ animation:pilingoArmUpRight 1.1s ease-in-out infinite; }
      .pilingo-mascot.is-surprised [data-face="mouth-happy"]{ display:none; }
      .pilingo-mascot.is-surprised [data-face="mouth-open"]{ display:block; }
      .pilingo-mascot.is-surprised [data-part="pilingo"]{ animation:pilingoSurprised .7s ease-in-out infinite; }
      .pilingo-mascot.is-encourage [data-part="pilingo"]{ animation:pilingoEncourage .9s ease-in-out infinite; }
      .pilingo-mascot.is-encourage [data-part="right-arm"]{ animation:pilingoHighFive .9s ease-in-out infinite; }
      .pilingo-mascot.is-trophy [data-prop="trophy"],
      .pilingo-mascot.is-star [data-prop="star"],
      .pilingo-mascot.is-heart [data-prop="heart"],
      .pilingo-mascot.is-read [data-prop="book"],
      .pilingo-mascot.is-write [data-prop="paper"],
      .pilingo-mascot.is-write [data-prop="pencil"]{ display:block; }
      .pilingo-mascot.is-trophy [data-part="pilingo"],
      .pilingo-mascot.is-star [data-part="pilingo"],
      .pilingo-mascot.is-heart [data-part="pilingo"]{ animation:pilingoPrize 1s ease-in-out infinite; }

      .pilingo-mascot [data-decor="confetti"]{ display: none; }

      @keyframes pilingoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      @keyframes pilingoReactionZoom {
        0% { transform: translateY(14px) scale(0.82); }
        52% { transform: translateY(-6px) scale(1.08); }
        100% { transform: translateY(0) scale(1); }
      }
      @keyframes pilingoIdle { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      @keyframes pilingoBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes pilingoSmile { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-6px) scale(1.02)} }
      @keyframes pilingoLaugh { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-7px) rotate(1deg)} }
      @keyframes pilingoCelebrate { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-35px) scale(1.04)} }
      @keyframes pilingoWalk { 0%,100%{transform:translateX(-8px) translateY(0)} 50%{transform:translateX(8px) translateY(-6px)} }
      @keyframes pilingoJump { 0%,100%{transform:translateY(0)} 35%{transform:translateY(-26px) scale(1.03)} 70%{transform:translateY(0) scale(0.98)} }
      @keyframes pilingoWave { 0%,100%{transform:rotate(-15deg)} 50%{transform:rotate(-70deg)} }
      @keyframes pilingoTail { 0%,100%{transform:rotate(-9deg)} 50%{transform:rotate(16deg)} }
      @keyframes pilingoTailSad { 0%,100%{transform:rotate(-16deg)} 50%{transform:rotate(-24deg)} }
      @keyframes pilingoBlink { 0%,92%,100%{transform:scaleY(1)} 95%{transform:scaleY(.08)} }
      @keyframes pilingoArmUpLeft { 0%,100%{transform:rotate(0)} 50%{transform:rotate(120deg)} }
      @keyframes pilingoArmUpRight { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-120deg)} }
      @keyframes pilingoLegForward { 0%,100%{transform:rotate(-14deg)} 50%{transform:rotate(16deg)} }
      @keyframes pilingoLegBack { 0%,100%{transform:rotate(16deg)} 50%{transform:rotate(-14deg)} }
      @keyframes pilingoArmForward { 0%,100%{transform:rotate(14deg)} 50%{transform:rotate(-18deg)} }
      @keyframes pilingoArmBack { 0%,100%{transform:rotate(-18deg)} 50%{transform:rotate(14deg)} }
      @keyframes pilingoConfetti { 0%{transform:translateY(-20px);opacity:1} 100%{transform:translateY(45px);opacity:.25} }
      @keyframes pilingoThink { 0%,100%{transform:rotate(0deg) translateY(0)} 50%{transform:rotate(6deg) translateY(-2px)} }
      @keyframes pilingoBrowLeft { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-2px) rotate(-10deg)} }
      @keyframes pilingoBrowRight { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(1px) rotate(6deg)} }
      @keyframes pilingoRead { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(2px) rotate(-4deg)} }
      @keyframes pilingoReadLeftArm { 0%,100%{transform:rotate(12deg)} 50%{transform:rotate(28deg)} }
      @keyframes pilingoReadRightArm { 0%,100%{transform:rotate(-18deg)} 50%{transform:rotate(-40deg)} }
      @keyframes pilingoWriteLeftArm { 0%,100%{transform:rotate(8deg)} 50%{transform:rotate(24deg)} }
      @keyframes pilingoWriteRightArm { 0%,100%{transform:rotate(-26deg)} 50%{transform:rotate(-54deg)} }
      @keyframes pilingoTalk { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
      @keyframes pilingoListen { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-5deg)} }
      @keyframes pilingoEarBob { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
      @keyframes pilingoSad { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }
      @keyframes pilingoBrowLeftSad { 0%,100%{transform:rotate(0)} 50%{transform:rotate(8deg) translateY(2px)} }
      @keyframes pilingoBrowRightSad { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-8deg) translateY(2px)} }
      @keyframes pilingoTalkHead { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
      @keyframes pilingoTalkMouth { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.82)} }
      @keyframes pilingoHighFive { 0%,100%{transform:rotate(-36deg)} 50%{transform:rotate(-82deg)} }
      @keyframes pilingoPointLeft { 0%,100%{transform:rotate(38deg) translateX(0)} 50%{transform:rotate(52deg) translateX(-7px)} }
      @keyframes pilingoPointRight { 0%,100%{transform:rotate(-38deg) translateX(0)} 50%{transform:rotate(-52deg) translateX(7px)} }
      @keyframes pilingoNod { 0%,100%{transform:rotate(0) translateY(0)} 50%{transform:rotate(2deg) translateY(8px)} }
      @keyframes pilingoShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px) rotate(-3deg)} 75%{transform:translateX(8px) rotate(3deg)} }
      @keyframes pilingoClapLeft { 0%,100%{transform:rotate(8deg)} 50%{transform:rotate(-48deg) translate(15px,-4px)} }
      @keyframes pilingoClapRight { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(48deg) translate(-15px,-4px)} }
      @keyframes pilingoDance { 0%,100%{transform:translateY(0) rotate(-7deg)} 50%{transform:translateY(-18px) rotate(7deg)} }
      @keyframes pilingoSleep { 0%,100%{transform:translateY(8px) rotate(-3deg) scaleY(.985)} 50%{transform:translateY(8px) rotate(-3deg) scaleY(1.015)} }
      @keyframes pilingoYawn { 0%,100%{transform:scale(.65)} 50%{transform:scale(1.15)} }
      @keyframes pilingoStretch { 0%,100%{transform:scaleY(1)} 50%{transform:translateY(-10px) scaleY(1.08)} }
      @keyframes pilingoSurprised { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-14px) scale(1.04)} }
      @keyframes pilingoEncourage { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
      @keyframes pilingoPrize { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
      @keyframes pilingoRewardCard{from{transform:translateY(40px) scale(.72);opacity:0}to{transform:none;opacity:1}}
      @keyframes pilingoRewardSpark{0%,100%{transform:translateY(0) rotate(-8deg) scale(.9)}50%{transform:translateY(-18px) rotate(8deg) scale(1.16)}}
      @keyframes pilingoNewMascotCelebrate{0%,100%{transform:translateY(0) rotate(-1deg) scale(1)}50%{transform:translateY(-14px) rotate(1deg) scale(1.025)}}

      @media (prefers-reduced-motion: reduce){
        .pilingo-mascot, .pilingo-mascot *{ animation-duration:.001ms !important; animation-iteration-count:1 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBubbleLayer(){
    let layer = document.getElementById(BUBBLE_LAYER_ID);
    if(layer) return layer;

    layer = document.createElement("div");
    layer.id = BUBBLE_LAYER_ID;
    layer.className = "pilingo-mascot-bubble-layer";
    document.body.appendChild(layer);
    return layer;
  }

  function buildMarkup(label){
    return `
      <svg viewBox="0 0 400 420" class="is-idle" aria-label="${escapeAttr(label || "Pilingo animated mascot")}" role="img">
        <g data-decor="confetti">
          <circle cx="80" cy="65" r="5" fill="#ff6b6b"></circle>
          <rect x="300" y="55" width="10" height="10" fill="#ffd93d" transform="rotate(20 305 60)"></rect>
          <circle cx="335" cy="100" r="5" fill="#2ed573"></circle>
          <rect x="65" y="115" width="10" height="10" fill="#4dabf7" transform="rotate(45 70 120)"></rect>
          <circle cx="290" cy="135" r="4" fill="#ff922b"></circle>
        </g>
        <g data-part="pilingo">
          <g data-part="tail">
            <path d="M260 300 C330 310 335 230 292 225 C270 222 280 250 300 252 C318 255 305 290 260 276" fill="#ffb21a" stroke="#1e1e1e" stroke-width="6" stroke-linecap="round"></path>
            <path d="M304 250 C318 255 305 290 260 276" fill="none" stroke="#1e1e1e" stroke-width="8" stroke-linecap="round"></path>
          </g>
          <g data-part="left-leg">
            <path d="M165 285 C145 330 148 372 178 372 C194 372 194 355 185 328 C179 310 182 295 190 285 Z" fill="#ffb21a" stroke="#1e1e1e" stroke-width="5"></path>
            <ellipse cx="174" cy="373" rx="27" ry="15" fill="#fff1cf" stroke="#1e1e1e" stroke-width="4"></ellipse>
          </g>
          <g data-part="right-leg">
            <path d="M235 285 C255 330 252 372 222 372 C206 372 206 355 215 328 C221 310 218 295 210 285 Z" fill="#ffb21a" stroke="#1e1e1e" stroke-width="5"></path>
            <ellipse cx="226" cy="373" rx="27" ry="15" fill="#fff1cf" stroke="#1e1e1e" stroke-width="4"></ellipse>
          </g>
          <g data-part="body">
            <ellipse cx="200" cy="245" rx="73" ry="98" fill="#ffb21a" stroke="#1e1e1e" stroke-width="6"></ellipse>
            <ellipse cx="200" cy="260" rx="43" ry="70" fill="#fff1cf"></ellipse>
            <circle cx="150" cy="205" r="7" fill="#1e1e1e"></circle>
            <circle cx="250" cy="205" r="7" fill="#1e1e1e"></circle>
            <circle cx="154" cy="250" r="6" fill="#1e1e1e"></circle>
            <circle cx="246" cy="250" r="6" fill="#1e1e1e"></circle>
            <circle cx="168" cy="300" r="5" fill="#1e1e1e"></circle>
            <circle cx="232" cy="300" r="5" fill="#1e1e1e"></circle>
          </g>
          <g data-part="backpack">
            <path d="M105 175 C85 215 85 290 115 315 C130 330 147 315 140 295 C125 250 132 210 150 180 Z" fill="#2e7d32" stroke="#1e1e1e" stroke-width="5"></path>
            <circle cx="118" cy="230" r="18" fill="#43a047" stroke="#1e1e1e" stroke-width="3"></circle>
            <text x="112" y="237" font-size="20" font-weight="bold" fill="white">P</text>
          </g>
          <g data-part="left-arm">
            <path d="M145 200 C105 215 92 250 115 265 C132 276 145 246 167 224 Z" fill="#ffb21a" stroke="#1e1e1e" stroke-width="5"></path>
            <circle cx="112" cy="263" r="17" fill="#fff1cf" stroke="#1e1e1e" stroke-width="4"></circle>
          </g>
          <g data-part="right-arm">
            <path d="M255 200 C303 190 320 151 298 137 C281 126 264 164 236 206 Z" fill="#ffb21a" stroke="#1e1e1e" stroke-width="5"></path>
            <circle cx="299" cy="136" r="17" fill="#fff1cf" stroke="#1e1e1e" stroke-width="4"></circle>
          </g>
          <g data-part="head">
            <g data-part="right-ear-bob">
              <path d="M119 73 Q143 50 171 70 Q164 105 132 111 Q118 96 119 73Z" fill="#f5a900" stroke="#5b3508" stroke-width="5"></path>
              <path d="M281 73 Q257 50 229 70 Q236 105 268 111 Q282 96 281 73Z" fill="#f5a900" stroke="#5b3508" stroke-width="5"></path>
            </g>
            <path d="M128 77 Q146 66 160 76 Q153 92 134 96Z" fill="#ef8e77"></path>
            <path d="M272 77 Q254 66 240 76 Q247 92 266 96Z" fill="#ef8e77"></path>
            <ellipse cx="200" cy="128" rx="82" ry="74" fill="#ffb21a" stroke="#5b3508" stroke-width="6"></ellipse>
            <ellipse cx="170" cy="150" rx="35" ry="30" fill="#fff1cf"></ellipse>
            <ellipse cx="230" cy="150" rx="35" ry="30" fill="#fff1cf"></ellipse>
            <ellipse cx="200" cy="164" rx="38" ry="30" fill="#fff1cf"></ellipse>
            <ellipse cx="200" cy="145" rx="14" ry="10" fill="#1e1e1e"></ellipse>
            <path d="M200 154 C197 162 192 166 185 166" fill="none" stroke="#1e1e1e" stroke-width="4" stroke-linecap="round"></path>
            <path d="M200 154 C203 162 208 166 215 166" fill="none" stroke="#1e1e1e" stroke-width="4" stroke-linecap="round"></path>

            <path data-part="brow-left" d="M156 98 Q171 88 186 99" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round"></path>
            <path data-part="brow-right" d="M214 99 Q229 88 244 98" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round"></path>

            <g data-face="eye-left">
              <ellipse cx="171" cy="124" rx="16" ry="21" fill="white" stroke="#1e1e1e" stroke-width="4"></ellipse>
              <circle cx="174" cy="127" r="9" fill="#ffd21f" stroke="#1e1e1e" stroke-width="3"></circle>
              <circle cx="176" cy="128" r="5" fill="#1e1e1e"></circle>
              <circle cx="171" cy="121" r="3" fill="white"></circle>
            </g>
            <g data-face="eye-right">
              <ellipse cx="229" cy="124" rx="16" ry="21" fill="white" stroke="#1e1e1e" stroke-width="4"></ellipse>
              <circle cx="226" cy="127" r="9" fill="#ffd21f" stroke="#1e1e1e" stroke-width="3"></circle>
              <circle cx="224" cy="128" r="5" fill="#1e1e1e"></circle>
              <circle cx="229" cy="121" r="3" fill="white"></circle>
            </g>
            <g data-face="eyes-smile">
              <path d="M156 125 Q171 112 186 125" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round"></path>
              <path d="M214 125 Q229 112 244 125" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round"></path>
            </g>

            <path data-face="mouth-happy" d="M177 174 Q200 197 223 174" fill="none" stroke="#1e1e1e" stroke-width="6" stroke-linecap="round"></path>
            <path data-face="mouth-open" d="M178 171 Q200 208 222 171 Q200 188 178 171" fill="#ff6b6b" stroke="#1e1e1e" stroke-width="5"></path>
            <path data-face="mouth-small" d="M188 178 Q200 184 212 178" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round"></path>

            <path d="M177 72 Q184 82 186 94 M200 67 Q200 82 200 94 M223 72 Q216 82 214 94" fill="none" stroke="#c97900" stroke-width="7" stroke-linecap="round"></path>
          </g>
          <g data-prop="book">
            <path d="M126 270 Q164 252 199 276 L199 347 Q161 327 126 340Z" fill="#176b3a" stroke="#5b3508" stroke-width="5"></path>
            <path d="M274 270 Q236 252 201 276 L201 347 Q239 327 274 340Z" fill="#238a50" stroke="#5b3508" stroke-width="5"></path>
          </g>
          <g data-prop="paper"><rect x="150" y="287" width="112" height="72" rx="8" fill="#fffdf4" stroke="#5b3508" stroke-width="5"></rect></g>
          <g data-prop="pencil" transform="rotate(-22 258 276)"><rect x="250" y="238" width="10" height="82" rx="4" fill="#ffd43b" stroke="#5b3508" stroke-width="3"></rect></g>
          <g data-prop="trophy"><path d="M163 254 H237 L227 315 Q200 338 173 315Z" fill="#ffc928" stroke="#8d5b00" stroke-width="5"></path><path d="M173 270 Q138 264 146 299 Q153 317 180 308 M227 270 Q262 264 254 299 Q247 317 220 308" fill="none" stroke="#8d5b00" stroke-width="8"></path><rect x="189" y="325" width="22" height="24" fill="#ffc928"></rect><rect x="168" y="345" width="64" height="14" rx="7" fill="#d99b00"></rect></g>
          <g data-prop="star"><path d="M200 250 L217 286 L257 291 L228 318 L236 357 L200 338 L164 357 L172 318 L143 291 L183 286Z" fill="#ffd43b" stroke="#8d5b00" stroke-width="6"></path></g>
          <g data-prop="heart"><path d="M200 355 C170 330 142 309 147 280 C152 250 188 249 200 275 C212 249 248 250 253 280 C258 309 230 330 200 355Z" fill="#ef476f" stroke="#8f1834" stroke-width="6"></path></g>
        </g>
      </svg>
    `;
  }

  function escapeAttr(value){
    return String(value || "").replace(/"/g, "&quot;");
  }

  function resolveTarget(target){
    if(!target) return null;
    if(typeof target === "string") return document.querySelector(target);
    return target;
  }

  function setState(instance, state){
    if(!instance?.host) return;
    const safeState = state || DEFAULT_STATE;
    instance.host.classList.remove(...instance.states);
    instance.host.classList.add("is-" + safeState);
    instance.state = safeState;
  }

  function pickMessage(category){
    const list = MESSAGE_GROUPS[category] || MESSAGE_GROUPS.correct;
    return list[Math.floor(Math.random() * list.length)];
  }

  function clearBubble(instance){
    if(!instance) return;
    if(instance._bubbleTimer){
      clearTimeout(instance._bubbleTimer);
      instance._bubbleTimer = null;
    }
    if(instance._bubbleEl){
      instance._bubbleEl.remove();
      instance._bubbleEl = null;
    }
    if(instance.host){
      instance.host.classList.remove("is-speaking");
    }
  }

  function positionBubble(instance, bubble){
    const rect = instance.host.getBoundingClientRect();
    const bubbleWidth = bubble.offsetWidth || 220;
    const bubbleHeight = bubble.offsetHeight || 70;
    const preferLeft = rect.left > window.innerWidth * 0.55;
    const top = rect.top - bubbleHeight - 12 < 10
      ? Math.min(window.innerHeight - bubbleHeight - 12, rect.bottom + 10)
      : rect.top - bubbleHeight - 12;
    let left = preferLeft
      ? rect.left - bubbleWidth + 36
      : rect.right - 36;
    left = Math.max(12, Math.min(window.innerWidth - bubbleWidth - 12, left));

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
    bubble.classList.toggle("is-left", !preferLeft);
  }

  function showBubble(instance, text, options = {}){
    if(!instance?.host || !text) return null;
    injectStyles();
    const layer = ensureBubbleLayer();
    clearBubble(instance);

    const bubble = document.createElement("div");
    bubble.className = "pilingo-speech-bubble";
    bubble.innerHTML = `${escapeHtml(text).replace(/\n/g, "<br>")}${options.score ? `<span class="pilingo-speech-bubble-score">${escapeHtml(options.score)}</span>` : ""}`;
    layer.appendChild(bubble);
    positionBubble(instance, bubble);
    requestAnimationFrame(() => bubble.classList.add("show"));
    instance.host.classList.add("is-speaking");

    const duration = options.duration || 2200;
    instance._bubbleEl = bubble;
    instance._bubbleTimer = window.setTimeout(() => {
      bubble.classList.remove("show");
      window.setTimeout(() => {
        if(instance._bubbleEl === bubble){
          bubble.remove();
          instance._bubbleEl = null;
        }
      }, 180);
      instance.host.classList.remove("is-speaking");
      instance._bubbleTimer = null;
    }, duration);

    return bubble;
  }

  function showRewardVideo(options = {}){
    document.querySelector(".pilingo-reward-video")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "pilingo-reward-video";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", options.title || "Lesson complete");
    overlay.innerHTML = `
      <span class="pilingo-reward-video-spark s1">✦</span>
      <span class="pilingo-reward-video-spark s2">★</span>
      <span class="pilingo-reward-video-spark s3">✦</span>
      <span class="pilingo-reward-video-spark s4">★</span>
      <div class="pilingo-reward-video-card">
        <div class="pilingo-reward-video-mascot">
          <img src="${escapeAttr(options.asset || "assets/mascot/pilingo-celebrate.png?v=1")}" alt="Pilingo celebrating">
        </div>
        <h2>${escapeHtml(options.title || "Amazing work!")}</h2>
        <p>${escapeHtml(options.message || "Keep learning—you are doing great!")}</p>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    const duration = Number(options.duration) || 2400;
    window.setTimeout(() => {
      overlay.classList.remove("show");
      window.setTimeout(() => overlay.remove(), 220);
    }, duration);
    if(options.speak !== false) speakMessage(options.message || "Keep learning. You are doing great!", options);
    return overlay;
  }

  function triggerZoom(instance, duration){
    if(!instance?.host) return;
    if(instance._zoomTimer){
      clearTimeout(instance._zoomTimer);
      instance._zoomTimer = null;
    }

    instance.host.classList.remove("is-reaction-zoom");
    void instance.host.offsetWidth;
    instance.host.classList.add("is-reaction-zoom");

    instance._zoomTimer = window.setTimeout(() => {
      instance.host.classList.remove("is-reaction-zoom");
      instance._zoomTimer = null;
    }, Math.max(620, duration || 0));
  }

  function speakMessage(message, config = {}){
    if(!message || config.speak === false) return;

    if(window.PilingoAudio?.speak){
      window.PilingoAudio.speak(message, {
        lang: config.lang || config.voiceLang || "en-US",
        preferFemale: config.preferFemale !== false
      });
      return;
    }

    if(!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = config.lang || config.voiceLang || "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1.25;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function syncToAudio(instance, audio){
    if(!instance?.host || !audio || !(window.AudioContext || window.webkitAudioContext)) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = instance._audioContext || new AudioContext();
    const analyser = instance._audioAnalyser || context.createAnalyser();
    analyser.fftSize = 64;
    if(!instance._audioSource){
      instance._audioSource = context.createMediaElementSource(audio);
      instance._audioSource.connect(analyser);
      analyser.connect(context.destination);
    }
    instance._audioContext = context;
    instance._audioAnalyser = analyser;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    setState(instance, "talk");
    const tick = () => {
      if(audio.paused || audio.ended){
        instance.host.classList.remove("is-speaking");
        setState(instance, DEFAULT_STATE);
        instance._lipSyncFrame = null;
        return;
      }
      analyser.getByteFrequencyData(samples);
      const energy = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      instance.host.classList.toggle("is-speaking", energy > 18);
      instance._lipSyncFrame = requestAnimationFrame(tick);
    };
    if(instance._lipSyncFrame) cancelAnimationFrame(instance._lipSyncFrame);
    context.resume();
    tick();
    return instance;
  }

  function scheduleReturn(instance, nextState, duration){
    if(instance._timer){
      clearTimeout(instance._timer);
      instance._timer = null;
    }

    if(!TRANSIENT_STATES.has(instance.state)) return;

    instance._timer = window.setTimeout(() => {
      setState(instance, nextState || DEFAULT_STATE);
      instance._timer = null;
    }, duration || 1200);
  }

  function createInstance(target, options = {}){
    injectStyles();

    const host = document.createElement("div");
    host.className = [
      "pilingo-mascot",
      options.compact ? "is-compact" : "",
      options.float !== false ? "is-float" : "",
      options.screen ? `is-${options.screen}` : ""
    ].filter(Boolean).join(" ");
    host.style.setProperty("--pilingo-size", `${Number(options.size) || 128}px`);
    host.dataset.renderer = "svg";
    host.dataset.outfit = options.outfit || "default";
    host.innerHTML = buildMarkup(options.label);

    const instance = {
      host,
      screen: options.screen || "generic",
      state: DEFAULT_STATE,
      states: [
        "is-idle", "is-blink", "is-smile", "is-wave", "is-walk", "is-run",
        "is-jump", "is-laugh", "is-think", "is-read", "is-write", "is-talk",
        "is-listen", "is-celebrate", "is-sad", "is-high-five", "is-thumbs-up",
        "is-point-left", "is-point-right", "is-nod", "is-shake", "is-clap",
        "is-dance", "is-trophy", "is-star", "is-heart", "is-sleep", "is-yawn",
        "is-stretch", "is-surprised", "is-encourage"
      ],
      renderer: "svg",
      play(state, playOptions = {}){
        setState(instance, state);
        scheduleReturn(instance, playOptions.returnTo || DEFAULT_STATE, playOptions.duration || stateDurations[state] || 1100);
      },
      setOutfit(outfit){
        host.dataset.outfit = outfit || "default";
      },
      showMessage(message, messageOptions = {}){
        return showBubble(instance, message, messageOptions);
      }
    };

    target.innerHTML = "";
    target.appendChild(host);
    INSTANCES.set(target, instance);
    setState(instance, options.state || DEFAULT_STATE);
    return instance;
  }

  const stateDurations = {
    blink: 350,
    smile: 900,
    wave: 1200,
    jump: 1000,
    laugh: 1300,
    think: 1400,
    read: 1500,
    write: 1500,
    talk: 1200,
    listen: 1200,
    celebrate: 1600,
    sad: 1200
    , "high-five": 1100, "thumbs-up": 1200, "point-left": 1200,
    "point-right": 1200, nod: 1000, shake: 1000, clap: 1300, dance: 1800,
    trophy: 1800, star: 1600, heart: 1600, sleep: 2400, yawn: 1500,
    stretch: 1500, surprised: 1200, encourage: 1800
  };

  const api = {
    mount(target, options){
      const resolved = resolveTarget(target);
      if(!resolved) return null;
      return INSTANCES.get(resolved) || createInstance(resolved, options);
    },
    play(state, target, options){
      const resolved = resolveTarget(target);
      const instance = resolved ? INSTANCES.get(resolved) : Array.from(INSTANCES.values())[0];
      if(!instance) return null;
      instance.play(state, options || {});
      return instance;
    },
    getInstance(target){
      const resolved = resolveTarget(target);
      return resolved ? INSTANCES.get(resolved) || null : null;
    },
    playForScreen(screen, state, options){
      const instance = Array.from(INSTANCES.values()).find((item) => item.screen === screen);
      if(instance) instance.play(state, options || {});
      return instance || null;
    },
    showMessage(config = {}){
      const target = config.target ? resolveTarget(config.target) : null;
      const instance =
        (target ? INSTANCES.get(target) : null) ||
        (config.screen ? Array.from(INSTANCES.values()).find((item) => item.screen === config.screen) : null) ||
        Array.from(INSTANCES.values())[0];

      if(!instance) return null;

      const animation = config.animation || "smile";
      const message = config.message || pickMessage(config.category || "correct");
      const duration = config.duration || 2200;
      const score = config.score || "";

      instance.play(animation, {
        returnTo: config.returnTo || DEFAULT_STATE,
        duration: Math.max(duration, stateDurations[animation] || 1100)
      });
      return showBubble(instance, message, { duration, score });
    },
    showReaction(config = {}){
      const target = config.target ? resolveTarget(config.target) : null;
      const instance =
        (target ? INSTANCES.get(target) : null) ||
        (config.screen ? Array.from(INSTANCES.values()).find((item) => item.screen === config.screen) : null) ||
        Array.from(INSTANCES.values())[0];

      if(!instance) return null;

      const animation = config.animation || "celebrate";
      const message = config.message || pickMessage(config.category || "lessonComplete");
      const duration = config.duration || 2600;
      const score = config.score || "";

      if(config.zoomIn !== false){
        triggerZoom(instance, duration);
      }

      instance.play(animation, {
        returnTo: config.returnTo || DEFAULT_STATE,
        duration: Math.max(duration, stateDurations[animation] || 1100)
      });

      const bubble = showBubble(instance, message, { duration, score });
      speakMessage(message, config);
      return bubble;
    },
    clearMessage(target){
      const resolved = resolveTarget(target);
      const instance = resolved ? INSTANCES.get(resolved) : Array.from(INSTANCES.values())[0];
      if(instance) clearBubble(instance);
    },
    syncToAudio(audio, target){
      const resolved = resolveTarget(target);
      const instance = resolved ? INSTANCES.get(resolved) : Array.from(INSTANCES.values())[0];
      return syncToAudio(instance, audio);
    },
    showReward(options){
      return showRewardVideo(options || {});
    },
    react(eventName, target, options = {}){
      const reactions = {
        beforeLesson:["wave", "Welcome! Let's learn together!"],
        afterLesson:["celebrate", "Lesson complete! Amazing work!"],
        afterQuiz:["trophy", "Quiz complete! You did it!"],
        correct:["thumbs-up", "Excellent!"],
        wrong:["encourage", "Almost! You can do it!"],
        levelUnlocked:["star", "A new level is unlocked!"],
        trophyEarned:["trophy", "You earned a trophy!"],
        dailyStreak:["celebrate", "Your streak is growing!"],
        welcome:["wave", "Welcome to Pilingo!"],
        loading:["walk", ""],
        empty:["point-left", "Let's find something to learn!"]
      };
      const reaction = reactions[eventName] || ["smile", ""];
      return api.showMessage(Object.assign({
        target, animation:reaction[0], message:reaction[1], duration:1800
      }, options));
    },
    replaceRenderer(){
      return "svg";
    }
  };

  window.PilingoMascot = api;
  window.playPilingoAnimation = function(state, target, options){
    return api.play(state, target, options);
  };
  window.showPilingoMessage = function(config){
    return api.showMessage(config || {});
  };
  window.showPilingoReaction = function(config){
    return api.showReaction(config || {});
  };
  window.syncPilingoToAudio = function(audio, target){
    return api.syncToAudio(audio, target);
  };
  window.showPilingoReward = function(options){
    return api.showReward(options || {});
  };
})();
