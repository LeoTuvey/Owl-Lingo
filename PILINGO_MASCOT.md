# Pilingo mascot component

`pilingo-mascot.js` is the single reusable mascot rig used across the Pilingo app.
It is an inline SVG, so it stays transparent, sharp at every size, and small
enough for mobile without downloading a separate video for each reaction.

## Mount

```html
<div id="mascot"></div>
<script src="pilingo-mascot.js"></script>
<script>
  PilingoMascot.mount("#mascot", { size: 128, state: "idle" });
</script>
```

## Play a state

```js
playPilingoAnimation("wave", "#mascot");
playPilingoAnimation("read", "#mascot");
playPilingoAnimation("trophy", "#mascot");
```

States: `idle`, `blink`, `walk`, `run`, `jump`, `wave`, `high-five`,
`thumbs-up`, `point-left`, `point-right`, `nod`, `shake`, `read`, `write`,
`think`, `listen`, `talk`, `laugh`, `smile`, `clap`, `dance`, `celebrate`,
`trophy`, `star`, `heart`, `sleep`, `yawn`, `stretch`, `surprised`, `sad`,
and `encourage`.

## App events

```js
PilingoMascot.react("beforeLesson", "#mascot");
PilingoMascot.react("correct", "#mascot");
PilingoMascot.react("levelUnlocked", "#mascot");
```

Supported event names: `beforeLesson`, `afterLesson`, `afterQuiz`, `correct`,
`wrong`, `levelUnlocked`, `trophyEarned`, `dailyStreak`, `welcome`, `loading`,
and `empty`.

## Lesson and quiz reward moment

```js
showPilingoReward({
  title: "Lesson complete!",
  message: "Fantastic work—keep learning!",
  animation: "celebrate",
  duration: 2000
});
```

This displays a short full-screen, video-like animated encouragement sequence
without loading a separate video file.

## Audio lip sync

Pass the same HTML audio element used for playback:

```js
syncPilingoToAudio(document.querySelector("audio"), "#mascot");
```

The mouth responds to the audio energy in real time and returns to idle when
playback finishes.

## Rendering

The component targets smooth browser-native animation and honors
`prefers-reduced-motion`. SVG is used instead of Lottie/WebM because this
character is a live, reusable rig whose parts and props are controlled at
runtime. `replaceRenderer()` remains the swap point for a future Rive or Lottie
renderer.
