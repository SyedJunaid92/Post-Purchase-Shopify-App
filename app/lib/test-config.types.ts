import {
  formatPolarisIconLabel,
  resolveTrialFeatureIcon,
} from "./polaris-icons";
import { parseDescriptionLines as parseRichDescriptionLines } from "./rich-text.utils";

export type ProductFields = {
  productId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  variantId: string | null;
  variantLegacyId: string | null;
  productPrice: string | null;
  customDescription: string | null;
  discountPercentage: number;
  /** Shopify selling plan GID, e.g. gid://shopify/SellingPlan/123 */
  sellingPlanId: string | null;
  sellingPlanName: string | null;
  /** Numeric selling plan ID for post-purchase add_subscription */
  sellingPlanLegacyId: string | null;
  initialShippingPrice: number;
  recurringShippingPrice: number;
};

export type FunnelImagePlacement = "top" | "bottom";

export type FunnelImage = {
  id: string;
  url: string;
  placement: FunnelImagePlacement;
  alt?: string;
};

export function newFunnelImage(
  placement: FunnelImagePlacement = "top",
): FunnelImage {
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url: "",
    placement,
  };
}

/** Strip empty URLs — use when building checkout payloads. */
export function normalizeFunnelImages(
  images: FunnelImage[] | null | undefined,
): FunnelImage[] {
  return (images ?? [])
    .map((image) => ({
      id: image.id || newFunnelImage().id,
      url: image.url?.trim() ?? "",
      placement: (image.placement === "bottom" ? "bottom" : "top") as FunnelImagePlacement,
      alt: image.alt?.trim() || undefined,
    }))
    .filter((image) => image.url.length > 0);
}

/** Merge stored config with defaults for editor + persistence. */
export function mergeFunnelImages(
  images: FunnelImage[] | null | undefined,
): FunnelImage[] {
  return (images ?? []).map((image) => ({
    id: image.id || newFunnelImage().id,
    url: image.url ?? "",
    placement: (image.placement === "bottom" ? "bottom" : "top") as FunnelImagePlacement,
    alt: image.alt,
  }));
}

// ─── PRODUCT OFFER (Type 1) ─────────────────────────────────────────────────

export type ProductOfferConfig = {
  headline: string;
  subheadline: string;
  body: string;
} & ProductFields;

// ─── TRIAL UNLOCK (Type 2) — Confetti + trial funnel ────────────────────────

export type TrialFeature = {
  id: string;
  /** Primary feature heading */
  title?: string;
  /** Supporting copy under the title */
  description?: string;
  /** Legacy single-line label (maps to title when title is empty) */
  text?: string;
  imageUrl?: string | null;
  /** Polaris icon type supported by s-icon / s-select */
  icon?: string | null;
};

export type SocialProofItem = {
  id: string;
  /** Optional caption for an avatar or proof item */
  text?: string;
  /** Customer avatar or proof image */
  imageUrl?: string | null;
};

export type TrialUnlockConfig = {
  loadingText: string;
  celebrationHeadline: string;
  celebrationSubheadline: string;
  celebrationPrimaryCta: string;
  celebrationSkipCta: string;
  featuresTitle: string;
  featuresContinueCta: string;
  features: TrialFeature[];
  socialProofTitle: string;
  socialProofSubtitle: string;
  socialProofRating: string;
  socialProofRatingLabel: string;
  socialProofContinueCta: string;
  socialProofItems: SocialProofItem[];
  emailCaptureLabel: string;
  signupCommitment1: string;
  signupCommitment2: string;
  signupSkipCta: string;
  termsTitle: string;
  termsContent: string;
  termsCheckboxLabel: string;
  ctaText: string;
  confirmationHeadline: string;
  confirmationSubheadline: string;
  confirmationStatusText: string;
  trialDays: number;
  product: ProductFields;
};

// ─── SCORED QUIZ (Type 3) ───────────────────────────────────────────────────

export type QuizOption = {
  label: string;
  score: number;
};

export type QuizQuestion = {
  id: string;
  text: string;
  options: QuizOption[];
  images: FunnelImage[];
};

export type ScoredQuizConfig = {
  introHeadline: string;
  introSubheadline: string;
  introBody: string;
  introImages: FunnelImage[];
  passThresholdPercent: number;
  questions: QuizQuestion[];
  analyzingSteps: string[];
  passHeadline: string;
  passSubheadline: string;
  passImages: FunnelImage[];
  failHeadline: string;
  failMessage: string;
  failImages: FunnelImage[];
  failStatusMessage: string;
  passAddToOrderCta: string;
  passConsentRequiredCta: string;
  passContinueCta: string;
  failContinueCta: string;
  passProduct: ProductFields;
};

// ─── SURVEY + REWARD (Type 4) ───────────────────────────────────────────────

export type InfoCard = {
  id: string;
  title: string;
  description: string;
  images: FunnelImage[];
  /** @deprecated Migrated to `images` on load */
  imageUrl?: string;
};

export function normalizeInfoCard(
  card: Partial<InfoCard> | null | undefined,
): InfoCard {
  const legacyUrl = card?.imageUrl?.trim() ?? "";
  let images = mergeFunnelImages(card?.images);
  if (!images.some((image) => image.url.trim()) && legacyUrl) {
    images = [{ ...newFunnelImage("top"), url: legacyUrl }];
  }

  return {
    id: card?.id ?? `ic_${Date.now()}`,
    title: card?.title ?? "",
    description: card?.description ?? "",
    images,
  };
}

export type SurveyQuestion = {
  id: string;
  text: string;
  options: string[];
  images: FunnelImage[];
};

export type SurveyStep =
  | { type: "question"; question: SurveyQuestion }
  | { type: "info_card"; infoCard: InfoCard };

export type SurveyRewardConfig = {
  introHeadline: string;
  introSubheadline: string;
  introBody: string;
  introImages: FunnelImage[];
  steps: SurveyStep[];
  rewardHeadline: string;
  rewardDescription: string;
  rewardImages: FunnelImage[];
  rewardAddToOrderCta: string;
  rewardConsentRequiredCta: string;
  rewardContinueCta: string;
  rewardProduct: ProductFields;
};

// ─── COMBO SPLIT TEST (Type 5) ──────────────────────────────────────────────

export type ComboTrafficSplit = {
  trial_unlock: number;
  quiz: number;
  survey: number;
};

export type ComboTestConfig = {
  trafficSplit: ComboTrafficSplit;
  trialUnlock: TrialUnlockConfig;
  quiz: ScoredQuizConfig;
  survey: SurveyRewardConfig;
};

// ─── DEFAULTS & UTILITIES ───────────────────────────────────────────────────

export const EMPTY_PRODUCT: ProductFields = {
  productId: null,
  productTitle: null,
  productImageUrl: null,
  variantId: null,
  variantLegacyId: null,
  productPrice: null,
  customDescription: null,
  discountPercentage: 0,
  sellingPlanId: null,
  sellingPlanName: null,
  sellingPlanLegacyId: null,
  initialShippingPrice: 0,
  recurringShippingPrice: 0,
};

export const SCORED_QUIZ_CTA_DEFAULTS = {
  passAddToOrderCta: "Add 7-Day Free Trial to My Order",
  passConsentRequiredCta: "Accept subscription policy to continue",
  passContinueCta: "Continue to order confirmation",
  failStatusMessage: "Your original order is confirmed and on its way.",
  failContinueCta: "Continue to order confirmation",
} as const;

export const SURVEY_REWARD_CTA_DEFAULTS = {
  rewardAddToOrderCta: "Claim my reward",
  rewardConsentRequiredCta: "Accept subscription policy to claim",
  rewardContinueCta: "Continue to order confirmation",
} as const;

export const DEFAULT_PRODUCT_OFFER_CONFIG = (): ProductOfferConfig => ({
  headline: "Special offer just for you",
  subheadline: "Add this to your order before you go",
  body: "",
  ...EMPTY_PRODUCT,
});

export const DEFAULT_TRIAL_UNLOCK_CONFIG = (): TrialUnlockConfig => ({
  loadingText: "Processing your order…",
  celebrationHeadline: "You've unlocked a 14-day trial!",
  celebrationSubheadline: "",
  celebrationPrimaryCta: "See what's included",
  celebrationSkipCta: "Skip this step",
  featuresTitle: "",
  featuresContinueCta: "Continue",
  features: [
    {
      id: "f1",
      title: "End-to-end encrypted privacy",
      description:
        "Your data is always protected with enterprise-grade encryption.",
      icon: "shield",
      imageUrl: null,
    },
    {
      id: "f2",
      title: "Progress tracking & insights",
      description: "Monitor your results and get insights to keep improving.",
      icon: "chart",
      imageUrl: null,
    },
  ],
  socialProofTitle: "Trusted by thousands",
  socialProofSubtitle: "Join 10,000+ happy customers",
  socialProofRating: "4.9",
  socialProofRatingLabel: "average rating",
  socialProofContinueCta: "Continue",
  socialProofItems: [],
  emailCaptureLabel: "",
  signupCommitment1:
    "Cancel anytime. No commitments — skip or cancel anytime.",
  signupCommitment2:
    "Reminder before billing. We'll email you before day 10 and day 13.",
  signupSkipCta: "No thanks",
  termsTitle: "Terms & billing",
  termsContent:
    "Auto-billing after trial ends. Cancel anytime from your account. Reminder emails on day 10 and day 13. No refunds on partial periods.",
  termsCheckboxLabel: "I agree to the terms and billing details",
  ctaText: "Agree & continue",
  confirmationHeadline: "You're all set!",
  confirmationSubheadline:
    "We've sent a confirmation email with your trial access. We'll remind you before billing on day 10 and day 13.",
  confirmationStatusText: "Subscription trial added to your order",
  trialDays: 14,
  product: { ...EMPTY_PRODUCT },
});

export const DEFAULT_SCORED_QUIZ_CONFIG = (): ScoredQuizConfig => ({
  introHeadline: "Not for everyone — that's the point",
  introSubheadline: "Answer a few quick questions to see if you qualify.",
  introBody: "",
  introImages: [],
  passThresholdPercent: 50,
  analyzingSteps: [
    "Reviewing your answers",
    "Calculating compatibility",
    "Preparing your offer",
  ],
  passHeadline: "You're a great fit!",
  passSubheadline: "We're adding your exclusive offer to your order.",
  passImages: [],
  failHeadline: "You're doing better than you think!",
  failMessage:
    "This experience isn't the right fit right now. Follow us for tips and updates.",
  failImages: [],
  failStatusMessage: "",
  passAddToOrderCta: "",
  passConsentRequiredCta: "",
  passContinueCta: "",
  failContinueCta: "",
  passProduct: { ...EMPTY_PRODUCT },
  questions: [
    {
      id: "q1",
      text: "",
      images: [],
      options: [
        { label: "Option 1", score: 1 },
        { label: "Option 2", score: 2 },
        { label: "Option 3", score: 3 },
        { label: "Option 4", score: 4 },
      ],
    },
    {
      id: "q2",
      text: "",
      images: [],
      options: [
        { label: "Option 1", score: 1 },
        { label: "Option 2", score: 2 },
        { label: "Option 3", score: 3 },
        { label: "Option 4", score: 4 },
      ],
    },
  ],
});

export const DEFAULT_SURVEY_REWARD_CONFIG = (): SurveyRewardConfig => ({
  introHeadline: "Quick survey, free reward",
  introSubheadline:
    "Take 30 seconds to share your experience and unlock an exclusive reward.",
  introBody: "",
  introImages: [],
  steps: [
    {
      type: "question",
      question: {
        id: "q1",
        text: "",
        images: [],
        options: ["Option 1", "Option 2", "Option 3", "Option 4"],
      },
    },
    {
      type: "info_card",
      infoCard: {
        id: "ic1",
        title: "",
        description: "",
        images: [],
      },
    },
    {
      type: "question",
      question: {
        id: "q2",
        text: "",
        images: [],
        options: ["Option 1", "Option 2", "Option 3", "Option 4"],
      },
    },
  ],
  rewardHeadline: "Your reward is ready!",
  rewardDescription:
    "Thank you for completing the survey. Here's your exclusive reward.",
  rewardImages: [],
  rewardAddToOrderCta: "",
  rewardConsentRequiredCta: "",
  rewardContinueCta: "",
  rewardProduct: { ...EMPTY_PRODUCT },
});

export const DEFAULT_COMBO_TEST_CONFIG = (): ComboTestConfig => ({
  trafficSplit: {
    trial_unlock: 34,
    quiz: 33,
    survey: 33,
  },
  trialUnlock: DEFAULT_TRIAL_UNLOCK_CONFIG(),
  quiz: DEFAULT_SCORED_QUIZ_CONFIG(),
  survey: DEFAULT_SURVEY_REWARD_CONFIG(),
});

export function parseDescriptionLines(text: string | null | undefined): string[] {
  return parseRichDescriptionLines(text);
}

export function normalizeProductFields(
  product: Partial<ProductFields> | null | undefined,
): ProductFields {
  return {
    ...EMPTY_PRODUCT,
    ...product,
    discountPercentage: product?.discountPercentage ?? 0,
    initialShippingPrice: product?.initialShippingPrice ?? 0,
    recurringShippingPrice: product?.recurringShippingPrice ?? 0,
  };
}

export function getFeatureTitle(
  feature: Pick<TrialFeature, "title" | "text">,
): string {
  return String(feature.title ?? feature.text ?? "").trim();
}

export function getTrialFeatureIconLabel(
  icon: string | null | undefined,
): string | null {
  const resolved = resolveTrialFeatureIcon(icon);
  if (!resolved) return icon?.trim() || null;
  return formatPolarisIconLabel(resolved);
}

export function featureHasContent(feature: TrialFeature): boolean {
  return Boolean(
    getFeatureTitle(feature) ||
    feature.description?.trim() ||
    feature.imageUrl?.trim() ||
    feature.icon?.trim(),
  );
}

export function socialProofItemHasContent(item: SocialProofItem): boolean {
  return Boolean(item.text?.trim() || item.imageUrl?.trim());
}

function normalizeTextImageItems(
  items: unknown,
  idPrefix: string,
  options?: { includeDescription?: boolean; includeIcon?: boolean },
): TrialFeature[] {
  if (!Array.isArray(items)) return [];

  const normalized: TrialFeature[] = [];

  items.forEach((item, index) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) return;
      normalized.push({
        id: `${idPrefix}${index}`,
        title: text,
        text,
        imageUrl: null,
        icon: null,
      });
      return;
    }
    if (item && typeof item === "object") {
      const record = item as Partial<TrialFeature>;
      const title = String(record.title ?? record.text ?? "").trim();
      const description = options?.includeDescription
        ? String(record.description ?? "").trim()
        : "";
      const imageUrl = record.imageUrl?.trim() || null;
      const icon = options?.includeIcon ? record.icon?.trim() || null : null;
      if (!title && !description && !imageUrl && !icon) return;
      normalized.push({
        id: String(record.id ?? `${idPrefix}${index}`),
        title,
        description: description || undefined,
        text: title,
        imageUrl,
        icon,
      });
    }
  });

  return normalized;
}

export function normalizeTrialFeatures(features: unknown): TrialFeature[] {
  return normalizeTextImageItems(features, "f", {
    includeDescription: true,
    includeIcon: true,
  });
}

export function normalizeSocialProofItems(items: unknown): SocialProofItem[] {
  return normalizeTextImageItems(items, "sp").map((item) => ({
    id: item.id,
    text: getFeatureTitle(item) || undefined,
    imageUrl: item.imageUrl,
  }));
}

export function normalizeTrialUnlockConfig(
  config: Partial<TrialUnlockConfig> | null | undefined,
): TrialUnlockConfig {
  const base = DEFAULT_TRIAL_UNLOCK_CONFIG();
  if (!config) return base;

  return {
    ...base,
    ...config,
    features: normalizeTrialFeatures(config.features),
    socialProofItems: normalizeSocialProofItems(config.socialProofItems),
    product: normalizeProductFields(config.product),
  };
}

export function normalizeScoredQuizConfig(
  config: Partial<ScoredQuizConfig> | null | undefined,
): ScoredQuizConfig {
  const base = DEFAULT_SCORED_QUIZ_CONFIG();
  if (!config) return base;

  return {
    ...base,
    ...config,
    introImages: mergeFunnelImages(config.introImages ?? base.introImages),
    passImages: mergeFunnelImages(config.passImages ?? base.passImages),
    failImages: mergeFunnelImages(config.failImages ?? base.failImages),
    questions: (config.questions ?? base.questions).map((question) => ({
      ...question,
      images: mergeFunnelImages(question.images),
    })),
    passProduct: { ...base.passProduct, ...config.passProduct },
  };
}

export function normalizeSurveyRewardConfig(
  config: Partial<SurveyRewardConfig> | null | undefined,
): SurveyRewardConfig {
  const base = DEFAULT_SURVEY_REWARD_CONFIG();
  if (!config) return base;

  return {
    ...base,
    ...config,
    introImages: mergeFunnelImages(config.introImages ?? base.introImages),
    rewardImages: mergeFunnelImages(config.rewardImages ?? base.rewardImages),
    steps: (config.steps ?? base.steps).map((step) => {
      if (step.type === "question") {
        return {
          ...step,
          question: {
            ...step.question,
            images: mergeFunnelImages(step.question.images),
          },
        };
      }
      return {
        ...step,
        infoCard: normalizeInfoCard(step.infoCard),
      };
    }),
    rewardProduct: { ...base.rewardProduct, ...config.rewardProduct },
  };
}

export function normalizeComboTestConfig(
  config: Partial<ComboTestConfig> | null | undefined,
): ComboTestConfig {
  const base = DEFAULT_COMBO_TEST_CONFIG();
  if (!config) return base;

  return {
    trafficSplit: { ...base.trafficSplit, ...config.trafficSplit },
    trialUnlock: normalizeTrialUnlockConfig(config.trialUnlock),
    quiz: normalizeScoredQuizConfig(config.quiz),
    survey: normalizeSurveyRewardConfig(config.survey),
  };
}
