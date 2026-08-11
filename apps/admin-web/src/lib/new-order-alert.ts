export const NEW_ORDER_CHIME = [
  { offset: 0, frequency: 1046, duration: 0.16, gain: 0.2 },
  { offset: 0.19, frequency: 784, duration: 0.2, gain: 0.18 },
  { offset: 0.55, frequency: 1046, duration: 0.16, gain: 0.2 },
  { offset: 0.74, frequency: 784, duration: 0.22, gain: 0.18 },
  { offset: 1.12, frequency: 1318, duration: 0.18, gain: 0.2 },
  { offset: 1.33, frequency: 1046, duration: 0.28, gain: 0.18 }
] as const;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedContext ??= new AudioContextClass();
  return sharedContext;
}

export async function playNewOrderAlert(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  if (context.state !== "running") return false;
  const start = context.currentTime + 0.02;

  for (const note of NEW_ORDER_CHIME) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + note.offset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + note.duration + 0.02);
  }
  return true;
}
