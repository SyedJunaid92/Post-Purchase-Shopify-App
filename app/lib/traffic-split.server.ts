export function hashReferenceId(referenceId: string): number {
  let hash = 0;
  for (let i = 0; i < referenceId.length; i++) {
    hash = (hash << 5) - hash + referenceId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

export function shouldShowForTraffic(
  referenceId: string,
  trafficPercentage: number,
): boolean {
  if (trafficPercentage >= 100) return true;
  if (trafficPercentage <= 0) return false;
  return hashReferenceId(referenceId) < trafficPercentage;
}

export type ComboVariant = "trial_unlock" | "quiz" | "survey";

export function resolveComboVariant(
  referenceId: string,
  split: { trial_unlock: number; quiz: number; survey: number },
): ComboVariant {
  const bucket = hashReferenceId(referenceId);
  const trialEnd = split.trial_unlock;
  const quizEnd = trialEnd + split.quiz;

  if (bucket < trialEnd) return "trial_unlock";
  if (bucket < quizEnd) return "quiz";
  return "survey";
}
