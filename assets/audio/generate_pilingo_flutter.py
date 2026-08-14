import math
import random
import wave
from array import array

SAMPLE_RATE = 44100
DURATION = 4.2
FRAME_COUNT = int(SAMPLE_RATE * DURATION)
left = [0.0] * FRAME_COUNT
right = [0.0] * FRAME_COUNT
random.seed(418)


def add_pluck(start, frequency, level=0.34, pan=0.0):
    start_frame = int(start * SAMPLE_RATE)
    length = int(0.72 * SAMPLE_RATE)
    for offset in range(length):
        frame = start_frame + offset
        if frame >= FRAME_COUNT:
            break
        t = offset / SAMPLE_RATE
        attack = min(1.0, t / 0.006)
        envelope = attack * math.exp(-6.2 * t)
        tone = (
            math.sin(2 * math.pi * frequency * t)
            + 0.31 * math.sin(2 * math.pi * frequency * 2.01 * t + 0.35)
            + 0.09 * math.sin(2 * math.pi * frequency * 3.98 * t + 0.8)
        )
        transient = (random.random() * 2 - 1) * math.exp(-48 * t) * 0.055
        sample = (tone * 0.66 + transient) * envelope * level
        left[frame] += sample * math.sqrt((1 - pan) / 2)
        right[frame] += sample * math.sqrt((1 + pan) / 2)


melody = [
    (0.00, 783.99), (0.18, 987.77), (0.36, 1174.66), (0.54, 987.77),
    (0.88, 880.00), (1.06, 1046.50), (1.24, 1318.51), (1.42, 1046.50),
    (1.76, 987.77), (1.94, 1174.66), (2.12, 1396.91), (2.30, 1174.66),
]

for index, (start, frequency) in enumerate(melody):
    pan = -0.28 if index % 2 == 0 else 0.28
    add_pluck(start, frequency, 0.36, pan)
    add_pluck(start + 0.145, frequency / 2, 0.075, -pan * 0.7)
    add_pluck(start + 0.29, frequency, 0.035, pan * 0.5)

# A barely audible warm bed keeps the ringtone pleasant without making it heavy.
for frequency, start, length in [(196.0, 0.0, 1.25), (220.0, 0.88, 1.25), (246.94, 1.76, 1.35)]:
    start_frame = int(start * SAMPLE_RATE)
    for offset in range(int(length * SAMPLE_RATE)):
        frame = start_frame + offset
        if frame >= FRAME_COUNT:
            break
        t = offset / SAMPLE_RATE
        envelope = min(1.0, t / 0.18) * math.exp(-1.9 * t) * 0.028
        sample = math.sin(2 * math.pi * frequency * t) * envelope
        left[frame] += sample
        right[frame] += sample

peak = max(max(abs(value) for value in left), max(abs(value) for value in right), 0.001)
scale = 0.82 / peak
pcm = array("h")
for frame in range(FRAME_COUNT):
    fade = min(1.0, (DURATION - frame / SAMPLE_RATE) / 0.12)
    pcm.append(int(max(-1, min(1, left[frame] * scale * fade)) * 32767))
    pcm.append(int(max(-1, min(1, right[frame] * scale * fade)) * 32767))

with wave.open("assets/audio/pilingo-flutterlight.wav", "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(SAMPLE_RATE)
    output.writeframes(pcm.tobytes())
