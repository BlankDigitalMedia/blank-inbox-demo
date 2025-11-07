export const SOUND_OPTIONS = [
  { id: "you-got-mail", label: "You Got Mail", file: "/sounds/you-got-mail.mp3" },
  { id: "cowabunga", label: "Cowabunga", file: "/sounds/cowabunga.mp3" },
  { id: "pizza-time-tmnt", label: "Pizza Time (TMNT)", file: "/sounds/pizza-time-tmnt.mp3" },
  { id: "tmnt-theme", label: "TMNT Theme", file: "/sounds/tmnt-theme.mp3" },
] as const;

export const DEFAULT_INCOMING = "you-got-mail";
export const DEFAULT_OUTGOING = "cowabunga";

export type SoundId = typeof SOUND_OPTIONS[number]["id"];

export function getSoundFile(soundId: string): string {
  const sound = SOUND_OPTIONS.find((s) => s.id === soundId);
  return sound?.file ?? (soundId === DEFAULT_INCOMING ? SOUND_OPTIONS[0].file : SOUND_OPTIONS[1].file);
}

export function isValidSoundId(soundId: string): soundId is SoundId {
  return SOUND_OPTIONS.some((s) => s.id === soundId);
}

