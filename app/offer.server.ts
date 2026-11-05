import type { ProductFields, FunnelImage } from "./lib/test-config.types";
import {
  parseDescriptionLines,
  normalizeTrialFeatures,
  normalizeSocialProofItems,
  normalizeFunnelImages,
} from "./lib/test-config.types";
import {
  optimizeFunnelImagesForCheckout,
  optimizeShopifyImageUrl,
} from "./lib/shopify-image.utils";
import type { Test } from "./lib/tests.server";
import type {
  ProductOfferConfig,
  TrialUnlockConfig,
  ScoredQuizConfig,
  SurveyRewardConfig,
  ComboTestConfig,
} from "./lib/test-config.types";
import {
  resolveComboVariant,
  type ComboVariant,
} from "./lib/traffic-split.server";

type Discount = {
  value: number;
  valueType: "percentage" | "fixed_amount";
  title: string;
};

export type AddVariantChange = {
  type: "add_variant";
  variantId: number;
  quantity: number;
  discount?: Discount;
};

export type AddSubscriptionChange = {
  type: "add_subscription";
  variantId: number;
  quantity: number;
  sellingPlanId: number;
  initialShippingPrice: number;
  recurringShippingPrice: number;
  discount?: Discount;
  shippingOption?: {
    title: string;
    presentmentTitle: string;
  };
};

export type OfferChange = AddVariantChange | AddSubscriptionChange;

export type PostPurchaseOffer = {
  id: number;
  headline: string;
  subheadline: string;
  productTitle: string;
  productImageURL: string;
  productDescription: string[];
  productDescriptionHtml?: string;
  originalPrice: string;
  discountedPrice: string;
  isSubscription: boolean;
  sellingPlanName: string | null;
  changes: OfferChange[];
  /** Shop currency of originalPrice and discountedPrice. */
  priceCurrency?: string | null;
};

export type PostPurchaseFlowPayload = {
  enabled: boolean;
  testId: string;
  testType: Test["type"] | ComboVariant;
  testName: string;
  trafficPercentage: number;
  comboParentId?: string;
  comboVariant?: ComboVariant;
  offers: PostPurchaseOffer[];
  flow?: {
    loadingText?: string;
    celebrationHeadline?: string;
    celebrationSubheadline?: string;
    celebrationPrimaryCta?: string;
    celebrationSkipCta?: string;
    featuresTitle?: string;
    featuresContinueCta?: string;
    features?: Array<
      | string
      | {
          id?: string;
          title?: string;
          text?: string;
          description?: string;
          imageUrl?: string | null;
          icon?: string | null;
        }
    >;
    socialProofTitle?: string;
    socialProofSubtitle?: string;
    socialProofRating?: string;
    socialProofRatingLabel?: string;
    socialProofContinueCta?: string;
    socialProofItems?: Array<
      string | { id?: string; text?: string; imageUrl?: string | null }
    >;
    emailCaptureLabel?: string;
    signupCommitment1?: string;
    signupCommitment2?: string;
    signupSkipCta?: string;
    termsTitle?: string;
    termsContent?: string;
    termsCheckboxLabel?: string;
    ctaText?: string;
    confirmationHeadline?: string;
    confirmationSubheadline?: string;
    confirmationStatusText?: string;
    trialDays?: number;
    introHeadline?: string;
    introSubheadline?: string;
    introBody?: string;
    introImages?: FunnelImage[];
    body?: string;
    passThresholdPercent?: number;
    questions?: ScoredQuizConfig["questions"];
    analyzingSteps?: string[];
    passHeadline?: string;
    passSubheadline?: string;
    passImages?: FunnelImage[];
    failHeadline?: string;
    failMessage?: string;
    failImages?: FunnelImage[];
    failStatusMessage?: string;
    passAddToOrderCta?: string;
    passConsentRequiredCta?: string;
    passContinueCta?: string;
    failContinueCta?: string;
    autoAddOnPass?: boolean;
    steps?: SurveyRewardConfig["steps"];
    rewardHeadline?: string;
    rewardDescription?: string;
    rewardImages?: FunnelImage[];
    rewardAddToOrderCta?: string;
    rewardConsentRequiredCta?: string;
    rewardContinueCta?: string;
  };
};

function buildDiscount(product: ProductFields): Discount | undefined {
  if (product.discountPercentage <= 0) return undefined;
  return {
    value: product.discountPercentage,
    valueType: "percentage",
    title: `${product.discountPercentage}% off`,
  };
}

function buildChangesFromProduct(product: ProductFields): OfferChange[] {
  if (!product.variantLegacyId) return [];

  const variantId = parseInt(product.variantLegacyId, 10);
  if (!variantId) return [];

  const discount = buildDiscount(product);

  if (product.sellingPlanLegacyId) {
    const sellingPlanId = parseInt(product.sellingPlanLegacyId, 10);
    if (!sellingPlanId) return [];

    const change: AddSubscriptionChange = {
      type: "add_subscription",
      variantId,
      quantity: 1,
      sellingPlanId,
      initialShippingPrice: product.initialShippingPrice ?? 0,
      recurringShippingPrice: product.recurringShippingPrice ?? 0,
      shippingOption: {
        title: "Subscription shipping",
        presentmentTitle: "Subscription shipping",
      },
    };
    if (discount) change.discount = discount;
    return [change];
  }

  const change: AddVariantChange = {
    type: "add_variant",
    variantId,
    quantity: 1,
  };
  if (discount) change.discount = discount;
  return [change];
}

export function buildOfferFromProduct(
  product: ProductFields,
  meta: { headline: string; subheadline: string; offerId?: number },
): PostPurchaseOffer | null {
  if (!product.variantLegacyId || !product.productTitle) return null;

  const changes = buildChangesFromProduct(product);
  if (!changes.length) return null;

  const price = product.productPrice ?? "0.00";
  const discount = product.discountPercentage ?? 0;
  const discounted =
    discount > 0
      ? (parseFloat(price) * (1 - discount / 100)).toFixed(2)
      : price;

  return {
    id: meta.offerId ?? 1,
    headline: meta.headline,
    subheadline: meta.subheadline,
    productTitle: product.productTitle,
    productImageURL: optimizeShopifyImageUrl(product.productImageUrl),
    productDescription: parseDescriptionLines(product.customDescription),
    productDescriptionHtml: product.customDescription ?? "",
    originalPrice: price,
    discountedPrice: discounted,
    isSubscription: Boolean(product.sellingPlanLegacyId),
    sellingPlanName: product.sellingPlanName,
    changes,
  };
}

function mapQuizQuestions(questions: ScoredQuizConfig["questions"]) {
  return questions.map((question) => ({
    ...question,
    images: optimizeFunnelImagesForCheckout(
      normalizeFunnelImages(question.images),
    ),
  }));
}

function mapSurveySteps(steps: SurveyRewardConfig["steps"]) {
  return steps.map((step) => {
    if (step.type === "question") {
      return {
        ...step,
        question: {
          ...step.question,
          images: optimizeFunnelImagesForCheckout(
            normalizeFunnelImages(step.question.images),
          ),
        },
      };
    }
    return {
      ...step,
      infoCard: {
        ...step.infoCard,
        images: optimizeFunnelImagesForCheckout(
          normalizeFunnelImages(step.infoCard.images),
        ),
      },
    };
  });
}

function optimizeTrialFeaturesForCheckout(
  features: ReturnType<typeof normalizeTrialFeatures>,
) {
  return features.map((feature) =>
    typeof feature === "string"
      ? feature
      : {
          ...feature,
          imageUrl: feature.imageUrl
            ? optimizeShopifyImageUrl(feature.imageUrl)
            : feature.imageUrl,
        },
  );
}

function optimizeSocialProofForCheckout(
  items: ReturnType<typeof normalizeSocialProofItems>,
) {
  return items.map((item) =>
    typeof item === "string"
      ? item
      : {
          ...item,
          imageUrl: item.imageUrl
            ? optimizeShopifyImageUrl(item.imageUrl)
            : item.imageUrl,
        },
  );
}

function buildTrialUnlockPayload(
  test: Test,
  config: TrialUnlockConfig,
): PostPurchaseFlowPayload | null {
  const offer = buildOfferFromProduct(config.product, {
    headline: config.celebrationHeadline,
    subheadline: config.celebrationSubheadline,
    offerId: 1,
  });
  if (!offer) return null;

  return {
    enabled: true,
    testId: test.id,
    testType: "trial_unlock",
    testName: test.name,
    trafficPercentage: test.trafficPercentage,
    offers: [offer],
    flow: {
      loadingText: config.loadingText,
      celebrationHeadline: config.celebrationHeadline,
      celebrationSubheadline: config.celebrationSubheadline,
      celebrationPrimaryCta: config.celebrationPrimaryCta,
      celebrationSkipCta: config.celebrationSkipCta,
      featuresTitle: config.featuresTitle,
      featuresContinueCta: config.featuresContinueCta,
      features: optimizeTrialFeaturesForCheckout(
        normalizeTrialFeatures(config.features),
      ),
      socialProofTitle: config.socialProofTitle,
      socialProofSubtitle: config.socialProofSubtitle,
      socialProofRating: config.socialProofRating,
      socialProofRatingLabel: config.socialProofRatingLabel,
      socialProofContinueCta: config.socialProofContinueCta,
      socialProofItems: optimizeSocialProofForCheckout(
        normalizeSocialProofItems(config.socialProofItems),
      ),
      emailCaptureLabel: config.emailCaptureLabel,
      signupCommitment1: config.signupCommitment1,
      signupCommitment2: config.signupCommitment2,
      signupSkipCta: config.signupSkipCta,
      termsTitle: config.termsTitle,
      termsContent: config.termsContent,
      termsCheckboxLabel: config.termsCheckboxLabel,
      ctaText: config.ctaText,
      confirmationHeadline: config.confirmationHeadline,
      confirmationSubheadline: config.confirmationSubheadline,
      confirmationStatusText: config.confirmationStatusText,
      trialDays: config.trialDays,
    },
  };
}

function buildQuizPayload(
  test: Test,
  config: ScoredQuizConfig,
): PostPurchaseFlowPayload | null {
  if (!config.questions?.length) return null;

  const passOffer = buildOfferFromProduct(config.passProduct, {
    headline: config.passHeadline,
    subheadline: config.passSubheadline,
    offerId: 1,
  });

  return {
    enabled: true,
    testId: test.id,
    testType: "quiz",
    testName: test.name,
    trafficPercentage: test.trafficPercentage,
    offers: passOffer ? [passOffer] : [],
    flow: {
      introHeadline: config.introHeadline,
      introSubheadline: config.introSubheadline,
      introBody: config.introBody,
      introImages: optimizeFunnelImagesForCheckout(
        normalizeFunnelImages(config.introImages),
      ),
      passThresholdPercent: config.passThresholdPercent,
      questions: mapQuizQuestions(config.questions),
      analyzingSteps: config.analyzingSteps,
      passHeadline: config.passHeadline,
      passSubheadline: config.passSubheadline,
      passImages: optimizeFunnelImagesForCheckout(
        normalizeFunnelImages(config.passImages),
      ),
      failHeadline: config.failHeadline,
      failMessage: config.failMessage,
      failImages: optimizeFunnelImagesForCheckout(
        normalizeFunnelImages(config.failImages),
      ),
      failStatusMessage: config.failStatusMessage,
      passAddToOrderCta: config.passAddToOrderCta,
      passConsentRequiredCta: config.passConsentRequiredCta,
      passContinueCta: config.passContinueCta,
      failContinueCta: config.failContinueCta,
      autoAddOnPass: Boolean(passOffer),
    },
  };
}

function buildSurveyPayload(
  test: Test,
  config: SurveyRewardConfig,
): PostPurchaseFlowPayload | null {
  if (!config.steps?.length) return null;

  const rewardOffer = buildOfferFromProduct(config.rewardProduct, {
    headline: config.rewardHeadline,
    subheadline: config.rewardDescription,
    offerId: 1,
  });

  return {
    enabled: true,
    testId: test.id,
    testType: "survey",
    testName: test.name,
    trafficPercentage: test.trafficPercentage,
    offers: rewardOffer ? [rewardOffer] : [],
    flow: {
      introHeadline: config.introHeadline,
      introSubheadline: config.introSubheadline,
      introBody: config.introBody,
      introImages: optimizeFunnelImagesForCheckout(
        normalizeFunnelImages(config.introImages),
      ),
      steps: mapSurveySteps(config.steps),
      rewardHeadline: config.rewardHeadline,
      rewardDescription: config.rewardDescription,
      rewardImages: optimizeFunnelImagesForCheckout(
        normalizeFunnelImages(config.rewardImages),
      ),
      rewardAddToOrderCta: config.rewardAddToOrderCta,
      rewardConsentRequiredCta: config.rewardConsentRequiredCta,
      rewardContinueCta: config.rewardContinueCta,
      autoAddOnPass: Boolean(rewardOffer),
    },
  };
}

export function buildFlowFromTest(
  test: Test,
  referenceId?: string,
): PostPurchaseFlowPayload | null {
  if (test.status !== "active") return null;

  if (test.type === "product_offer") {
    const config = test.config as ProductOfferConfig;
    const offer = buildOfferFromProduct(config, {
      headline: config.headline,
      subheadline: config.subheadline,
    });
    if (!offer) return null;

    return {
      enabled: true,
      testId: test.id,
      testType: test.type,
      testName: test.name,
      trafficPercentage: test.trafficPercentage,
      offers: [offer],
      flow: {
        body: config.body,
      },
    };
  }

  if (test.type === "trial_unlock") {
    return buildTrialUnlockPayload(test, test.config as TrialUnlockConfig);
  }

  if (test.type === "quiz") {
    return buildQuizPayload(test, test.config as ScoredQuizConfig);
  }

  if (test.type === "survey") {
    return buildSurveyPayload(test, test.config as SurveyRewardConfig);
  }

  if (test.type === "combo") {
    const config = test.config as ComboTestConfig;
    const split = config.trafficSplit ?? {
      trial_unlock: 34,
      quiz: 33,
      survey: 33,
    };
    const variant = referenceId
      ? resolveComboVariant(referenceId, split)
      : "trial_unlock";

    let subPayload: PostPurchaseFlowPayload | null = null;
    if (variant === "trial_unlock") {
      subPayload = buildTrialUnlockPayload(test, config.trialUnlock);
    } else if (variant === "quiz") {
      subPayload = buildQuizPayload(test, config.quiz);
    } else {
      subPayload = buildSurveyPayload(test, config.survey);
    }

    if (!subPayload) return null;

    return {
      ...subPayload,
      comboParentId: test.id,
      comboVariant: variant,
      testName: test.name,
      trafficPercentage: test.trafficPercentage,
    };
  }

  return null;
}

export function getSelectedOffer(
  offers: PostPurchaseOffer[],
  offerId: number,
): PostPurchaseOffer | undefined {
  return offers.find((offer) => offer.id === offerId);
}

export function calculateQuizScorePercent(
  answers: { questionId: string; score: number }[],
  questions: ScoredQuizConfig["questions"],
): number {
  if (!questions.length) return 0;

  const maxPerQuestion = questions.map((q) =>
    Math.max(...q.options.map((o) => o.score), 1),
  );
  const maxTotal = maxPerQuestion.reduce((sum, n) => sum + n, 0);
  const actualTotal = answers.reduce((sum, a) => sum + a.score, 0);

  if (maxTotal <= 0) return 0;
  return Math.round((actualTotal / maxTotal) * 100);
}
