// audio.js — TTS Narrator System (Web Speech API, Thai)

const Narrator = (() => {
  const queue = [];
  let speaking = false;
  let enabled = true;

  // Find best Thai voice available
  function getThaiVoice() {
    const voices = speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === 'th-TH') ||
      voices.find(v => v.lang.startsWith('th')) ||
      null
    );
  }

  function processQueue() {
    if (!enabled || speaking || queue.length === 0) return;
    speaking = true;
    const text = queue.shift();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.rate = 0.88;
    utter.pitch = 0.9;
    utter.volume = 1.0;

    const voice = getThaiVoice();
    if (voice) utter.voice = voice;

    utter.onend = () => {
      speaking = false;
      setTimeout(processQueue, 400);
    };
    utter.onerror = () => {
      speaking = false;
      setTimeout(processQueue, 400);
    };

    speechSynthesis.speak(utter);
  }

  // Some browsers need voices loaded async
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {};
  }

  return {
    speak(text) {
      if (!text) return;
      queue.push(text);
      processQueue();
    },
    clearQueue() {
      queue.length = 0;
      speechSynthesis.cancel();
      speaking = false;
    },
    setEnabled(val) {
      enabled = val;
      if (!val) { speechSynthesis.cancel(); speaking = false; }
    },
    isEnabled: () => enabled,
  };
})();

// Expose globally
window.Narrator = Narrator;
