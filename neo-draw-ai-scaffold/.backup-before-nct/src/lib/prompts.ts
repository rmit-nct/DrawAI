export const DRAWING_PROMPTS = [
  "cat", "house", "tree", "car", "sun", "star", "flower", "fish",
  "bird", "cloud", "mountain", "boat", "umbrella", "bicycle", "guitar",
];

export function getRandomPrompt(): string {
  return DRAWING_PROMPTS[Math.floor(Math.random() * DRAWING_PROMPTS.length)];
}
