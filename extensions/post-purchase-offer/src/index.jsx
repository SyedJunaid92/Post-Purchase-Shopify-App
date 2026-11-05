import { useCallback, useEffect, useRef, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  BuyerConsent,
  CalloutBanner,
  Checkbox,
  Heading,
  Image,
  Text,
  TextContainer,
  Separator,
  Tiles,
  TextBlock,
  Layout,
  Spinner,
  View,
} from "@shopify/post-purchase-ui-extensions-react";
import { parseRichTextBlocks, stripRichTextToPlain } from "./rich-text.js";

const APP_URL =
  process.env.SHOPIFY_APP_URL || "https://post-purchase-app-five.vercel.app";

const CHECKOUT_IMAGE_WIDTH = 560;

function optimizeCheckoutImageUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";
  if (
    !trimmed.includes("cdn.shopify.com") &&
    !trimmed.includes("shopifycdn.com")
  ) {
    return trimmed;
  }
  if (/[?&]width=\d+/.test(trimmed)) return trimmed;
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}width=${CHECKOUT_IMAGE_WIDTH}`;
}

function hashReferenceId(referenceId) {
  let hash = 0;
  for (let i = 0; i < referenceId.length; i++) {
    hash = (hash << 5) - hash + referenceId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

function shouldShowForTraffic(referenceId, trafficPercentage) {
  if (trafficPercentage >= 100) return true;
  if (trafficPercentage <= 0) return false;
  return hashReferenceId(referenceId) < trafficPercentage;
}

function isRenderablePayload(data) {
  if (!data?.enabled) return false;
  if (data.testType === "quiz") {
    return Boolean(data.flow?.questions?.length);
  }
  if (data.testType === "survey") {
    return Boolean(data.flow?.steps?.length);
  }
  if (data.testType === "trial_unlock") {
    return Boolean(data.offers?.length);
  }
  return Boolean(data.offers?.length);
}

/** Shopify: subscription post-purchase changes need a shipping address on the order. */
function orderHasShippingAddress(inputData) {
  const code =
    inputData?.initialPurchase?.destinationCountryCode ??
    inputData?.destinationCountryCode;
  return code != null && String(code).trim() !== "";
}

function changesetHasShippingError(result) {
  const errors = result?.errors ?? [];
  return errors.some(
    (error) => error.code === "subscription_no_shipping_address_error",
  );
}

async function calculateSubscriptionOffer(calculateChangeset, changes) {
  if (!changes?.length) {
    return { blocked: false, calculatedPurchase: null };
  }

  try {
    const result = await calculateChangeset({ changes });
    if (result?.status === "unprocessed" && changesetHasShippingError(result)) {
      return { blocked: true, calculatedPurchase: null };
    }
    return {
      blocked: false,
      calculatedPurchase: result?.calculatedPurchase ?? null,
    };
  } catch {
    return { blocked: false, calculatedPurchase: null };
  }
}

async function logEvent(inputData, payload, eventType, eventData = {}) {
  if (!APP_URL) return;
  try {
    await fetch(`${APP_URL}/api/analytics`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inputData.token}`,
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        referenceId: inputData.initialPurchase.referenceId,
        shopDomain: inputData.shop?.domain,
        testId: payload?.comboParentId ?? payload?.testId,
        eventType,
        eventData: {
          testType: payload?.testType,
          comboVariant: payload?.comboVariant,
          ...eventData,
        },
      }),
    });
  } catch {
    // analytics must not block UX
  }
}

function useAnalyticsOnce(inputData, payload) {
  const loggedRef = useRef(new Set());

  const logOnce = useCallback(
    async (eventType, eventData = {}) => {
      const referenceId = inputData?.initialPurchase?.referenceId;
      if (!referenceId) return;
      const stepKey = eventData.step ? String(eventData.step) : "";
      const questionKey = eventData.questionId
        ? String(eventData.questionId)
        : "";
      const suffix = questionKey || stepKey;
      const key = suffix
        ? `${referenceId}:${eventType}:${suffix}`
        : `${referenceId}:${eventType}`;
      if (loggedRef.current.has(key)) return;
      loggedRef.current.add(key);
      await logEvent(inputData, payload, eventType, eventData);
    },
    [inputData, payload],
  );

  const logStepOnce = useCallback(
    (step) => logOnce("step_viewed", { step }),
    [logOnce],
  );

  return { logOnce, logStepOnce };
}

function calculateScorePercent(answers, questions) {
  if (!questions?.length) return 0;
  const maxPerQuestion = questions.map((q) =>
    Math.max(...q.options.map((o) => o.score), 1),
  );
  const maxTotal = maxPerQuestion.reduce((sum, n) => sum + n, 0);
  const actualTotal = answers.reduce((sum, a) => sum + a.score, 0);
  if (maxTotal <= 0) return 0;
  return Math.round((actualTotal / maxTotal) * 100);
}

extend(
  "Checkout::PostPurchase::ShouldRender",
  async ({ inputData, storage }) => {
    if (!APP_URL) {
      return { render: false };
    }

    const referenceId = inputData.initialPurchase?.referenceId;
    const prior = storage.initialData ?? {};
    const lineItems =
      inputData.initialPurchase?.lineItems?.map((item) => ({
        productId: item.product?.id,
        variantId: item.product?.variant?.id,
        quantity: item.quantity,
      })) ?? [];

    try {
      const response = await fetch(`${APP_URL}/api/offer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${inputData.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceId,
          shopDomain: inputData.shop?.domain,
          lineItems,
        }),
      });

      if (!response.ok) {
        return { render: false };
      }

      const data = await response.json();
      const hasShippingAddress = orderHasShippingAddress(inputData);
      const enriched = {
        ...data,
        hasShippingAddress,
      };

      if (!isRenderablePayload(enriched)) {
        return { render: false };
      }

      await storage.update(enriched);

      const show = shouldShowForTraffic(
        referenceId,
        enriched.trafficPercentage ?? 100,
      );

      if (show) {
        if (prior._loggedTestShown !== referenceId) {
          void logEvent(inputData, enriched, "test_shown", {
            testType: enriched.testType,
            testName: enriched.testName,
            comboVariant: enriched.comboVariant,
            hasShippingAddress,
          }).then(() =>
            storage.update({
              ...enriched,
              _loggedTestShown: referenceId,
            }),
          );
        }
      } else {
        void logEvent(inputData, enriched, "test_skipped_traffic", {
          testType: enriched.testType,
        });
      }

      return { render: show };
    } catch {
      return { render: false };
    }
  },
);

render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  const { storage } = useExtensionInput();
  const data = storage.initialData ?? {};

  if (data.testType === "trial_unlock") {
    return <TrialUnlockFlow />;
  }
  if (data.testType === "quiz") {
    return <ScoredQuizFlow />;
  }
  if (data.testType === "survey") {
    return <SurveyRewardFlow />;
  }

  return <ProductOfferFlow />;
}

// ─── PRODUCT OFFER FLOW (Type 1) ────────────────────────────────────────────

function isSubscriptionOffer(offer) {
  if (!offer) return false;
  if (offer.isSubscription) return true;
  return offer.changes?.[0]?.type === "add_subscription";
}

async function applySignedChangeset(
  applyChangeset,
  token,
  offer,
  buyerConsent,
) {
  const subscription = isSubscriptionOffer(offer);
  const result = await applyChangeset(token, {
    buyerConsentToSubscriptions: subscription ? buyerConsent : false,
  });
  const errors = result?.errors ?? [];
  return { ok: errors.length === 0, errors };
}

async function fetchChangesetToken(
  inputData,
  offerId,
  shopDomain,
  bodyExtra = {},
) {
  return fetch(`${APP_URL}/api/sign-changeset`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${inputData.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      referenceId: inputData.initialPurchase.referenceId,
      changes: offerId,
      shopDomain,
      ...bodyExtra,
    }),
  })
    .then((response) => response.json())
    .then((response) => response.token)
    .catch(() => null);
}

function handleApplyErrors(
  errors,
  setBuyerConsentError,
  setApplyError,
  fallback,
) {
  const consentError = errors.find(
    (error) => error.code === "buyer_consent_required",
  );
  if (consentError) {
    setBuyerConsentError?.("You need to accept the subscription policy.");
    return;
  }

  const shippingError = errors.find(
    (error) => error.code === "subscription_no_shipping_address_error",
  );
  if (shippingError) {
    setApplyError?.(
      "This subscription needs a shipping address on your order. It isn't available for digital-only or pickup checkouts.",
    );
    return;
  }

  setApplyError?.(
    errors[0]?.message || fallback || "Could not add this to your order.",
  );
}

function SubscriptionShippingNotice() {
  return (
    <FunnelCard interactive>
      <BlockStack spacing="tight">
        <Text emphasized>Shipping address required</Text>
        <TextBlock subdued>
          Subscription offers can only be added when your order includes a
          shipping address. This checkout used digital delivery, local pickup,
          or no shipping — so this subscription can&apos;t be added after
          payment.
        </TextBlock>
      </BlockStack>
    </FunnelCard>
  );
}

async function signAndApplyOffer({
  inputData,
  offer,
  applyChangeset,
  shopDomain,
  buyerConsent,
  bodyExtra = {},
}) {
  const token = await fetchChangesetToken(
    inputData,
    offer.id,
    shopDomain,
    bodyExtra,
  );
  if (!token) {
    return {
      ok: false,
      errors: [{ message: "Could not process your request." }],
    };
  }
  return applySignedChangeset(applyChangeset, token, offer, buyerConsent);
}

const SHELL_LAYOUT_MEDIA = [
  { viewportSize: "small", sizes: [1], maxInlineSize: 0.92 },
  { viewportSize: "medium", sizes: [1], maxInlineSize: 420 },
  { viewportSize: "large", sizes: [1], maxInlineSize: 480 },
];

/** Product row with explicit gutter between image and content */
const TRIAL_PRODUCT_LAYOUT_MEDIA = [
  { viewportSize: "small", sizes: [108, 20, "fill"], maxInlineSize: 1 },
  { viewportSize: "medium", sizes: [124, 28, "fill"], maxInlineSize: 420 },
  { viewportSize: "large", sizes: [136, 32, "fill"], maxInlineSize: 480 },
];

/** Shopify-recommended product row: fixed image column + fill content column */
const PRODUCT_ROW_LAYOUT_MEDIA = [
  { viewportSize: "small", sizes: [96, 0, "fill"], maxInlineSize: 1 },
  { viewportSize: "medium", sizes: [120, 0, "fill"], maxInlineSize: 420 },
  { viewportSize: "large", sizes: [140, 0, "fill"], maxInlineSize: 480 },
];

/** Centered page shell for product offer (desktop gutters + mobile stack) */
const PRODUCT_OFFER_SHELL_MEDIA = [
  { viewportSize: "small", sizes: [1, 0, 1], maxInlineSize: 0.92 },
  { viewportSize: "medium", sizes: [1, 420, 1] },
  { viewportSize: "large", sizes: [1, 560, 1] },
];

/** Image + details within the centered product-offer column */
const PRODUCT_OFFER_LAYOUT_MEDIA = [
  { viewportSize: "small", sizes: [1, 0, 1], maxInlineSize: 1 },
  { viewportSize: "medium", sizes: [180, 16, "fill"], maxInlineSize: 1 },
  { viewportSize: "large", sizes: [220, 24, "fill"], maxInlineSize: 1 },
];

function ProductOfferPageShell({ children }) {
  return (
    <Layout media={PRODUCT_OFFER_SHELL_MEDIA}>
      <BlockStack />
      <FunnelScreenPadding>
        <BlockStack spacing="loose">{children}</BlockStack>
      </FunnelScreenPadding>
      <BlockStack />
    </Layout>
  );
}

function FunnelScreenPadding({ children }) {
  return (
    <View inlinePadding="base" blockPadding="loose">
      {children}
    </View>
  );
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveActionCta(label, fallback, total) {
  const text = hasText(label) ? label.trim() : fallback;
  return total ? `${text} · ${formatCurrency(total)}` : text;
}

function hasRichText(value) {
  if (!value?.trim()) return false;
  if (/<img\b/i.test(value)) return true;
  return hasText(stripRichTextToPlain(value));
}

function RichTextSpan({ span, size, baseEmphasized = false }) {
  return (
    <Text size={size} emphasized={baseEmphasized || span.bold || undefined}>
      {span.text}
    </Text>
  );
}

function RichTextParagraph({
  spans,
  size = "medium",
  emphasized = false,
  subdued = false,
  alignment = "center",
}) {
  if (!spans.length) return null;

  return (
    <TextContainer alignment={alignment}>
      <TextBlock subdued={subdued || undefined}>
        {spans.map((span, index) => (
          <RichTextSpan
            key={index}
            span={span}
            size={size}
            baseEmphasized={emphasized}
          />
        ))}
      </TextBlock>
    </TextContainer>
  );
}

function RichTextContent({
  content,
  size = "medium",
  emphasized = false,
  subdued = false,
  alignment = "center",
  asHeading = false,
}) {
  if (!hasRichText(content)) return null;

  const blocks = parseRichTextBlocks(content);
  if (!blocks.length) return null;

  if (asHeading && blocks.length === 1 && blocks[0].type === "paragraph") {
    return (
      <TextContainer alignment={alignment}>
        <Heading>
          {blocks[0].spans.map((span, index) => (
            <RichTextSpan key={index} span={span} size={size} />
          ))}
        </Heading>
      </TextContainer>
    );
  }

  return (
    <BlockStack spacing="tight">
      {blocks.map((block, index) => {
        if (block.type === "image") {
          return (
            <FunnelCard key={index} interactive>
              <TextContainer alignment={alignment}>
                <Image
                  description={block.alt || "Content image"}
                  source={optimizeCheckoutImageUrl(block.url)}
                />
              </TextContainer>
            </FunnelCard>
          );
        }

        if (block.type === "list") {
          return (
            <BlockStack key={index} spacing="extraTight">
              {block.items.map((item, itemIndex) => (
                <TextContainer key={itemIndex} alignment={alignment}>
                  <TextBlock subdued={subdued || undefined}>
                    <Text size={size}>• </Text>
                    {item.map((span, spanIndex) => (
                      <RichTextSpan
                        key={spanIndex}
                        span={span}
                        size={size}
                        baseEmphasized={emphasized}
                      />
                    ))}
                  </TextBlock>
                </TextContainer>
              ))}
            </BlockStack>
          );
        }

        return (
          <RichTextParagraph
            key={index}
            spans={block.spans}
            size={size}
            emphasized={emphasized}
            subdued={subdued}
            alignment={alignment}
          />
        );
      })}
    </BlockStack>
  );
}

const IMAGE_CAROUSEL_LAYOUT = [
  { viewportSize: "small", sizes: [48, "fill", 48], maxInlineSize: 1 },
  { viewportSize: "medium", sizes: [48, "fill", 48], maxInlineSize: 480 },
  { viewportSize: "large", sizes: [48, "fill", 48], maxInlineSize: 560 },
];

function normalizeFlowImages(images) {
  return (images ?? []).filter((image) => hasText(image?.url));
}

function getImagesByPlacement(images, placement) {
  return normalizeFlowImages(images).filter(
    (image) => (image.placement ?? "top") === placement,
  );
}

function ImageCarousel({ images, description = "Image" }) {
  const slides = normalizeFlowImages(images);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.map((slide) => slide.id ?? slide.url).join("|")]);

  if (!slides.length) return null;

  if (slides.length === 1) {
    const slide = slides[0];
    return (
      <FunnelCard interactive>
        <TextContainer alignment="center">
          <Image
            description={slide.alt || description}
            source={optimizeCheckoutImageUrl(slide.url)}
          />
        </TextContainer>
      </FunnelCard>
    );
  }

  const current = slides[index] ?? slides[0];
  const goPrev = () =>
    setIndex((currentIndex) =>
      currentIndex <= 0 ? slides.length - 1 : currentIndex - 1,
    );
  const goNext = () =>
    setIndex((currentIndex) =>
      currentIndex >= slides.length - 1 ? 0 : currentIndex + 1,
    );

  return (
    <FunnelCard interactive>
      <BlockStack spacing="tight">
        <TextContainer alignment="center">
          <Image
            description={current.alt || `${description} ${index + 1}`}
            source={optimizeCheckoutImageUrl(current.url)}
          />
        </TextContainer>
        <Layout media={IMAGE_CAROUSEL_LAYOUT}>
          <View minInlineSize={48} minBlockSize={48}>
            <Button plain onPress={goPrev}>
              ‹
            </Button>
          </View>
          <BlockStack spacing="extraTight">
            <TextContainer alignment="center">
              <TextBlock subdued size="small">
                {index + 1} of {slides.length}
              </TextBlock>
            </TextContainer>
            <TextContainer alignment="center">
              <Layout spacing="tight">
                {slides.map((slide, slideIndex) => (
                  <Button
                    key={slide.id ?? slideIndex}
                    plain
                    onPress={() => setIndex(slideIndex)}
                  >
                    {slideIndex === index ? "●" : "○"}
                  </Button>
                ))}
              </Layout>
            </TextContainer>
          </BlockStack>
          <View minInlineSize={48} minBlockSize={48}>
            <Button plain onPress={goNext}>
              ›
            </Button>
          </View>
        </Layout>
      </BlockStack>
    </FunnelCard>
  );
}

function FunnelImagePlacementSection({ images, placement, description }) {
  const slides = getImagesByPlacement(images, placement);
  if (!slides.length) return null;
  return <ImageCarousel images={slides} description={description} />;
}

function FunnelContentWithImages({ images, description, children }) {
  const hasImages = normalizeFlowImages(images).length > 0;
  if (!hasImages) return children;

  return (
    <BlockStack spacing="base">
      <FunnelImagePlacementSection
        images={images}
        placement="top"
        description={description}
      />
      {children}
      <FunnelImagePlacementSection
        images={images}
        placement="bottom"
        description={description}
      />
    </BlockStack>
  );
}

function filterTextList(items) {
  return (items ?? []).filter((item) => hasText(item));
}

function getFeatureTitle(feature) {
  if (!feature) return "";
  return hasText(feature.title)
    ? feature.title.trim()
    : hasText(feature.text)
      ? feature.text.trim()
      : "";
}

function featureHasContent(feature) {
  return Boolean(
    getFeatureTitle(feature) ||
    hasText(feature.description) ||
    hasText(feature.imageUrl) ||
    hasText(feature.icon),
  );
}

function featureIconGlyph(icon) {
  if (!hasText(icon)) return null;
  const key = icon.trim().toLowerCase();

  if (key === "shield" || key.startsWith("shield")) return "🛡";
  if (key === "chart" || key.startsWith("chart")) return "📈";
  if (key === "lock" || key === "person-lock") return "🔒";
  if (key === "unlock") return "🔓";
  if (key.startsWith("star")) return "⭐";
  if (key.startsWith("check")) return "✓";
  if (key.startsWith("heart")) return "♥";
  if (key.includes("gift")) return "🎁";
  if (key.includes("rocket")) return "🚀";
  if (key.includes("confetti")) return "🎉";
  if (key.startsWith("bolt")) return "⚡";
  if (key.includes("globe")) return "🌐";
  if (key.includes("email") || key.includes("envelope")) return "✉";
  if (key.includes("phone")) return "📞";
  if (key.includes("calendar")) return "📅";
  if (key.includes("clock")) return "⏱";
  if (
    key.includes("money") ||
    key.includes("cash") ||
    key.includes("payment") ||
    key.includes("wallet")
  ) {
    return "💰";
  }
  if (key.includes("cart")) return "🛒";
  if (key.startsWith("product") || key.includes("package")) return "📦";
  if (
    key.includes("truck") ||
    key.includes("delivery") ||
    key.includes("shipping")
  ) {
    return "🚚";
  }
  if (
    key.includes("meditation") ||
    key.includes("lotus") ||
    key.includes("flower")
  )
    return "🪷";
  if (
    key.includes("journal") ||
    key.includes("notebook") ||
    key.includes("note")
  )
    return "📓";
  if (
    key.includes("bell") ||
    key.includes("reminder") ||
    key.includes("notify")
  )
    return "🔔";
  if (key.includes("smiley-happy") || key.includes("smiley-joy")) return "😊";
  if (key.includes("smiley-sad")) return "☹";
  if (key.startsWith("alert")) return "⚠";
  if (key.startsWith("info")) return "ℹ";
  if (key.includes("key") || key.includes("passkey")) return "🔑";
  if (key.includes("location") || key.includes("map")) return "📍";
  if (key.includes("settings")) return "⚙";
  if (key.includes("search")) return "🔍";

  return "✦";
}

function normalizeTrialFeatures(features) {
  if (!Array.isArray(features)) return [];

  return features
    .map((item, index) => {
      if (typeof item === "string") {
        const title = item.trim();
        if (!title) return null;
        return {
          id: `f${index}`,
          title,
          text: title,
          description: "",
          imageUrl: null,
          icon: null,
        };
      }
      if (item && typeof item === "object") {
        const title = getFeatureTitle(item);
        const description = hasText(item.description)
          ? item.description.trim()
          : "";
        const imageUrl = hasText(item.imageUrl) ? item.imageUrl.trim() : null;
        const icon = hasText(item.icon) ? item.icon.trim() : null;
        if (!title && !description && !imageUrl && !icon) return null;
        return {
          id: item.id ?? `f${index}`,
          title,
          text: title,
          description,
          imageUrl,
          icon,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function filterFeaturesList(features) {
  return normalizeTrialFeatures(features);
}

function filterSocialProofList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        return { id: `sp${index}`, text, imageUrl: null };
      }
      if (item && typeof item === "object") {
        const text = hasText(item.text) ? item.text.trim() : "";
        const imageUrl = hasText(item.imageUrl) ? item.imageUrl.trim() : null;
        if (!text && !imageUrl) return null;
        return { id: item.id ?? `sp${index}`, text, imageUrl };
      }
      return null;
    })
    .filter(Boolean);
}

function hasSocialProofContent(flow) {
  return (
    hasText(flow.socialProofTitle) ||
    hasText(flow.socialProofSubtitle) ||
    hasText(flow.socialProofRating) ||
    hasText(flow.socialProofRatingLabel) ||
    filterSocialProofList(flow.socialProofItems).length > 0
  );
}

function PageShell({ children }) {
  return (
    <Layout media={SHELL_LAYOUT_MEDIA}>
      <FunnelScreenPadding>
        <BlockStack spacing="loose">{children}</BlockStack>
      </FunnelScreenPadding>
    </Layout>
  );
}

function ProgressHeader({ label, progress }) {
  return (
    <BlockStack spacing="tight">
      <Tiles>
        <TextBlock size="small" subdued>
          {label}
        </TextBlock>
        <TextContainer alignment="trailing">
          <TextBlock size="small" emphasized>
            {progress}%
          </TextBlock>
        </TextContainer>
      </Tiles>
      <View
        border="base"
        cornerRadius="base"
        background="subdued"
        maxInlineSize="fill"
      >
        <View
          background="interactive"
          minBlockSize={6}
          maxBlockSize={6}
          maxInlineSize={`${Math.max(6, progress)}%`}
          cornerRadius="base"
        />
      </View>
    </BlockStack>
  );
}

function FunnelCard({ children, interactive = false, selected = false }) {
  return (
    <View
      border={selected ? "interactive" : interactive ? "interactive" : "base"}
      cornerRadius="base"
      background="subdued"
      padding="base"
    >
      <BlockStack spacing="base">{children}</BlockStack>
    </View>
  );
}

function SectionEyebrow({ children }) {
  return (
    <TextContainer alignment="center">
      <TextBlock size="small" emphasized subdued>
        {children}
      </TextBlock>
    </TextContainer>
  );
}

function MetaRow({ items }) {
  if (!items?.length) return null;
  return (
    <FunnelCard>
      <BlockStack spacing="tight">
        {items.map((item, index) => (
          <Tiles key={index}>
            <TextBlock size="small" subdued>
              {item.label}
            </TextBlock>
            <TextContainer alignment="trailing">
              <TextBlock size="small" emphasized>
                {item.value}
              </TextBlock>
            </TextContainer>
          </Tiles>
        ))}
      </BlockStack>
    </FunnelCard>
  );
}

function formatDiscountPhrase(originalPrice, discountedPrice) {
  if (!originalPrice || !discountedPrice) return null;

  const original = parseFloat(originalPrice);
  const discounted = parseFloat(discountedPrice);
  if (
    !Number.isFinite(original) ||
    !Number.isFinite(discounted) ||
    original <= discounted
  ) {
    return null;
  }

  const percent = Math.round(((original - discounted) / original) * 100);
  if (percent > 0) return `save ${percent}%`;

  return `save ${formatCurrency(String(original - discounted))}`;
}

function resolveOfferPrices(offer, calculatedPurchase) {
  const calculatedDiscounted =
    calculatedPurchase?.updatedLineItems?.[0]?.totalPriceSet?.presentmentMoney
      ?.amount;
  const calculatedOriginal =
    calculatedPurchase?.updatedLineItems?.[0]?.priceSet?.presentmentMoney
      ?.amount;
  const configuredOriginal = offer?.originalPrice;
  const configuredDiscounted = offer?.discountedPrice;
  const hasConfiguredDiscount =
    configuredOriginal &&
    configuredDiscounted &&
    parseFloat(configuredOriginal) > parseFloat(configuredDiscounted);

  const originalPrice =
    calculatedOriginal ?? configuredOriginal ?? calculatedDiscounted;
  const discountedPrice =
    calculatedDiscounted ??
    (hasConfiguredDiscount ? configuredDiscounted : configuredOriginal);

  return { originalPrice, discountedPrice };
}

function readMoney(money) {
  if (!money?.amount) return null;
  const amount = String(money.amount).trim();
  if (!amount) return null;
  return {
    amount,
    currency: money.currencyCode || "USD",
  };
}

function amountUsdFromMoneyBag(moneyBag) {
  if (!moneyBag) return null;
  const presentment = readMoney(moneyBag.presentmentMoney);
  const shop = readMoney(moneyBag.shopMoney);

  if (presentment?.currency === "USD") return presentment.amount;
  if (shop?.currency === "USD") return shop.amount;
  return null;
}

function parseMoneyAmount(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPresentmentCurrency(calculatedPurchase) {
  return (
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.currencyCode ||
    calculatedPurchase?.updatedLineItems?.[0]?.totalPriceSet?.presentmentMoney
      ?.currencyCode ||
    "USD"
  );
}

function configuredOfferAmount(offer) {
  const candidates = [offer?.discountedPrice, offer?.originalPrice];
  for (const value of candidates) {
    const parsed = parseMoneyAmount(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function conversionRevenuePayload(offer, calculatedPurchase) {
  const bag = calculatedPurchase?.totalOutstandingSet;
  const total = bag?.presentmentMoney;
  const amountUsd = amountUsdFromMoneyBag(bag);

  if (total?.amount != null && String(total.amount).trim() !== "") {
    const parsed = parseMoneyAmount(total.amount);
    if (parsed != null && parsed > 0) {
      return {
        amount: String(total.amount),
        currency: total.currencyCode || "USD",
        ...(amountUsd ? { amountUsd: String(amountUsd) } : {}),
      };
    }
  }

  const lineBag = calculatedPurchase?.updatedLineItems?.[0]?.totalPriceSet;
  const lineTotal = lineBag?.presentmentMoney;
  const lineUsd = amountUsdFromMoneyBag(lineBag);
  if (lineTotal?.amount != null && String(lineTotal.amount).trim() !== "") {
    const parsed = parseMoneyAmount(lineTotal.amount);
    if (parsed != null && parsed > 0) {
      return {
        amount: String(lineTotal.amount),
        currency: lineTotal.currencyCode || "USD",
        ...(lineUsd ? { amountUsd: String(lineUsd) } : {}),
      };
    }
  }

  const configured = configuredOfferAmount(offer);
  if (configured != null) {
    const fixed = configured.toFixed(2);
    const currency = readPresentmentCurrency(calculatedPurchase) || "USD";
    return {
      amount: fixed,
      currency,
      ...(currency === "USD" ? { amountUsd: fixed } : {}),
    };
  }

  return {};
}

/** Stats-only: attribute recurring subscription price when trial charges $0 today. */
function trialStatsRevenuePayload(offer, calculatedPurchase) {
  const immediate = conversionRevenuePayload(offer, calculatedPurchase);
  const immediateAmount = parseMoneyAmount(immediate.amount);

  if (!isSubscriptionOffer(offer)) {
    return immediate;
  }

  if (immediateAmount != null && immediateAmount > 0) {
    return immediate;
  }

  const configured = configuredOfferAmount(offer);
  if (configured == null || configured <= 0) {
    return immediate;
  }

  const fixed = configured.toFixed(2);
  const currency =
    immediate.currency || readPresentmentCurrency(calculatedPurchase) || "USD";

  return {
    amount: fixed,
    currency,
    ...(currency === "USD" ? { amountUsd: fixed } : {}),
    revenueBasis: "subscription_recurring",
    chargeToday: "0",
  };
}

function statsRevenuePayload(offer, calculatedPurchase) {
  if (isSubscriptionOffer(offer)) {
    return trialStatsRevenuePayload(offer, calculatedPurchase);
  }
  return conversionRevenuePayload(offer, calculatedPurchase);
}

function ProductOfferCalloutBanner({
  offer,
  originalPrice,
  discountedPrice,
  title,
  subheadline,
  body,
  fallbackTitle = "It's not too late to add this to your order.",
}) {
  if (!offer?.productTitle) return null;

  const introTitle = hasRichText(title)
    ? title
    : hasRichText(offer.headline)
      ? offer.headline
      : fallbackTitle;
  const introSubheadline = hasRichText(subheadline)
    ? subheadline
    : hasRichText(offer.subheadline)
      ? offer.subheadline
      : "";
  const discountPhrase = formatDiscountPhrase(originalPrice, discountedPrice);
  const discountText = discountPhrase
    ? `Add the ${offer.productTitle} to your order and ${discountPhrase}.`
    : `Add the ${offer.productTitle} to your order.`;
  const showHero =
    hasRichText(introTitle) ||
    hasRichText(introSubheadline) ||
    hasRichText(body);

  return (
    <BlockStack spacing="tight">
      {showHero ? (
        <HeroBanner
          headline={introTitle}
          subheadline={introSubheadline}
          body={body}
        />
      ) : (
        <CalloutBanner title={stripRichTextToPlain(introTitle)}>
          <TextContainer alignment="center">
            <Text size="medium">{discountText}</Text>
          </TextContainer>
        </CalloutBanner>
      )}
      {showHero ? (
        <CalloutBanner>
          <TextContainer alignment="center">
            <Text size="medium">{discountText}</Text>
          </TextContainer>
        </CalloutBanner>
      ) : null}
    </BlockStack>
  );
}

function HeroBanner({ headline, subheadline, body, eyebrow }) {
  if (
    !hasRichText(headline) &&
    !hasRichText(subheadline) &&
    !hasRichText(body)
  ) {
    return null;
  }

  return (
    <CalloutBanner>
      <BlockStack spacing="tight">
        <RichTextContent content={headline} emphasized size="medium" />
        <RichTextContent
          alignment="leading"
          content={subheadline}
          size="medium"
        />
        <RichTextContent content={body} size="medium" subdued />
      </BlockStack>
    </CalloutBanner>
  );
}

const CHOICE_OPTION_LAYOUT = [
  { viewportSize: "small", sizes: [48, "fill"], maxInlineSize: 1 },
  { viewportSize: "medium", sizes: [52, "fill"], maxInlineSize: 420 },
  { viewportSize: "large", sizes: [52, "fill"], maxInlineSize: 480 },
];

// function ChoiceOption({
//   label,
//   onPress,
//   index,
//   selected = false,
//   disabled = false,
// }) {
//   return (
//     <View maxInlineSize="fill">
//       <View
//         border={selected ? "interactive" : "base"}
//         cornerRadius="base"
//         background={selected ? "subdued" : "surface"}
//         padding="base"
//         maxInlineSize="fill"
//       >
//         <Button onPress={onPress} disabled={disabled} plain subdued={!selected}>
//           <Layout media={CHOICE_OPTION_LAYOUT}>
//             <View
//               border={selected ? "interactive" : "base"}
//               cornerRadius="fullyRound"
//               background={selected ? "interactive" : "subdued"}
//               padding="tight"
//               minInlineSize={48}
//               minBlockSize={48}
//             >
//               <TextContainer alignment="center">
//                 <Text emphasized={selected}>{String(index ?? "•")}</Text>
//               </TextContainer>
//             </View>
//             <BlockStack spacing="extraTight">
//               <Text emphasized={selected}>{label}</Text>
//               {selected ? (
//                 <TextBlock size="small" emphasized>
//                   ✓ Selected
//                 </TextBlock>
//               ) : null}
//             </BlockStack>
//           </Layout>
//         </Button>
//       </View>
//     </View>
//   );
// }

// function ChoiceOption({ label, onPress, selected = false, disabled = false }) {
//   return (
//     <View
//       border={selected ? "interactive" : "base"}
//       background={selected ? "subdued" : "surface"}
//       cornerRadius="base"
//       padding="base"
//       maxInlineSize="fill"
//       opacity={disabled ? 0.55 : 1}
//     >
//       <Button plain disabled={disabled} onPress={onPress}>
//         <Layout distribution="fill" alignment="center">
//           <Layout spacing="tight">
//             <Text emphasized={selected}>{selected ? " ● " : " ○ "}</Text>

//             <Text emphasized={selected}>{label}</Text>
//           </Layout>

//           {selected && <Text emphasized> ✓</Text>}
//         </Layout>
//       </Button>
//     </View>
//   );
// }

// function ChoiceOption({
//   label,
//   onPress,
//   selected = false,
//   disabled = false,
//   icon,
// }) {
//   return (
//     <View
//       border={selected ? "interactive" : "base"}
//       cornerRadius="base"
//       background={selected ? "subdued" : "surface"}
//       padding="base"
//       maxInlineSize="fill"
//       opacity={disabled ? 0.6 : 1}
//     >
//       <Button plain onPress={onPress} disabled={disabled}>
//         <Tiles>
//           <TextBlock>
//             <Text emphasized={selected}>
//               {selected ? "✓ " : ""}
//               {icon ? `${icon} ` : ""}
//               {label}
//             </Text>
//           </TextBlock>
//         </Tiles>
//       </Button>
//     </View>
//   );
// }

function ChoiceOption({ label, onPress, selected = false, disabled = false }) {
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      kind={selected ? "primary" : "secondary"}
    >
      {selected ? `✓ ${label}` : label}
    </Button>
  );
}
function ChoiceOptions({ children }) {
  return (
    <BlockStack spacing="base" maxInlineSize="fill">
      {children}
    </BlockStack>
  );
}

function FunnelIntroScreen({
  stepLabel,
  progress,
  headline,
  subheadline,
  body,
  images,
  eyebrow,
  metaItems,
  primaryLabel,
  onPrimary,
  onSkip,
  loading,
  skipLabel = "No thanks, continue",
}) {
  return (
    <FunnelShell progress={progress ?? 10} stepLabel={stepLabel ?? "Welcome"}>
      <FunnelContentWithImages images={images} description="Intro">
        <HeroBanner
          headline={headline}
          subheadline={subheadline}
          body={body}
          eyebrow={eyebrow}
        />
        {metaItems?.length ? <MetaRow items={metaItems} /> : null}
      </FunnelContentWithImages>
      <ActionStack>
        <Button onPress={onPrimary} submit loading={loading}>
          {primaryLabel}
        </Button>
        {onSkip ? (
          <Button onPress={onSkip} subdued disabled={loading}>
            {skipLabel}
          </Button>
        ) : null}
      </ActionStack>
    </FunnelShell>
  );
}

function ScorePanel({ scorePercent, passed }) {
  return (
    <FunnelCard>
      <BlockStack spacing="tight">
        <TextContainer alignment="center">
          <Text
            size="large"
            emphasized
            appearance={passed ? "success" : "subdued"}
          >
            {scorePercent}%
          </Text>
        </TextContainer>
        <TextContainer alignment="center">
          <TextBlock subdued>
            {passed ? "Compatibility score" : "Your score"}
          </TextBlock>
        </TextContainer>
      </BlockStack>
    </FunnelCard>
  );
}

function ApplyErrorBanner({ message, title = "Unable to add offer" }) {
  if (!message) return null;
  return (
    <CalloutBanner title={title}>
      <TextBlock>{message}</TextBlock>
    </CalloutBanner>
  );
}

function SubscriptionConsentFields({
  offer,
  buyerConsent,
  setBuyerConsent,
  buyerConsentError,
  setBuyerConsentError,
  termsAccepted,
  setTermsAccepted,
  termsError,
  setTermsError,
  termsLabel,
}) {
  const subscriptionOffer = isSubscriptionOffer(offer);
  if (!subscriptionOffer && !termsLabel) return null;

  return (
    <BlockStack spacing="base">
      {subscriptionOffer ? (
        <BuyerConsent
          policy="subscriptions"
          checked={buyerConsent}
          onChange={(value) => {
            setBuyerConsent(value);
            if (value) setBuyerConsentError?.(undefined);
          }}
          error={buyerConsentError}
        />
      ) : null}
      {termsLabel ? (
        <Checkbox
          checked={termsAccepted}
          onChange={(value) => {
            setTermsAccepted(value);
            if (value) setTermsError?.(undefined);
          }}
          error={termsError}
        >
          {termsLabel}
        </Checkbox>
      ) : null}
    </BlockStack>
  );
}

function ActionStack({ children }) {
  return <BlockStack spacing="tight">{children}</BlockStack>;
}

function FunnelShell({ children, progress, stepLabel }) {
  return (
    <Layout media={SHELL_LAYOUT_MEDIA}>
      <FunnelScreenPadding>
        <BlockStack spacing="loose">
          <FunnelCard interactive>
            <ProgressHeader label={stepLabel} progress={progress} />
          </FunnelCard>
          <BlockStack spacing="base">{children}</BlockStack>
        </BlockStack>
      </FunnelScreenPadding>
    </Layout>
  );
}

function TrialStepLabel(stepNum, stepTotal) {
  return `Step ${stepNum} of ${stepTotal}`;
}

function formatSubscriptionPrice(amount, suffix = "/mo") {
  if (!amount || parseFloat(amount) === 0) return "$0";
  return `$${parseFloat(amount).toFixed(2)}${suffix}`;
}

function computeTrialEndLabel(trialDays = 14) {
  try {
    const end = new Date();
    end.setDate(end.getDate() + Number(trialDays) || 14);
    return end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "your trial ends";
  }
}

function resolveTrialTodayPrice(
  offer,
  calculatedPurchase,
  priceLoading,
  subscriptionOffer,
  trialDays = 0,
) {
  if (priceLoading) return "Calculating…";

  const hasTrial = Number(trialDays) > 0;
  if (subscriptionOffer && hasTrial) return "$0 today";

  const total =
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
  if (total != null && String(total).trim() !== "") {
    const parsed = parseFloat(total);
    if (Number.isFinite(parsed)) {
      if (parsed <= 0) return "$0 today";
      return `${formatCurrency(total)} today`;
    }
  }

  if (subscriptionOffer) return "$0 today";

  const { discountedPrice } = resolveOfferPrices(offer, calculatedPurchase);
  if (discountedPrice && parseFloat(discountedPrice) > 0) {
    return `${formatCurrency(discountedPrice)} today`;
  }

  return "$0 today";
}

function useTrialOutcomeGuard(inputData, payload, logOnce) {
  const outcomeRef = useRef(null);

  const markOutcome = useCallback((outcome) => {
    outcomeRef.current = outcome;
  }, []);

  const declineOffer = useCallback(
    async (doneFn, reason = "skipped") => {
      if (outcomeRef.current) {
        doneFn();
        return;
      }
      outcomeRef.current = reason;
      await logOnce("offer_declined", { reason });
      await logOnce("test_completed", {
        outcome: reason === "skipped" ? "skipped" : "declined",
      });
      doneFn();
    },
    [logOnce],
  );

  useEffect(() => {
    return () => {
      if (outcomeRef.current) return;
      outcomeRef.current = "abandoned";
      logEvent(inputData, payload, "offer_declined", { reason: "page_exit" });
      logEvent(inputData, payload, "test_completed", { outcome: "abandoned" });
    };
  }, [inputData, payload]);

  return { markOutcome, declineOffer };
}

function LimitedOfferBadge() {
  return (
    <View
      border="base"
      cornerRadius="fullyRound"
      background="subdued"
      padding="tight"
      maxInlineSize="fill"
    >
      <TextContainer alignment="center">
        <Text size="small" appearance="success" emphasized>
          ✦ Limited time offer
        </Text>
      </TextContainer>
    </View>
  );
}

function TrialPricingBlock({
  showRecurring,
  hasTrial,
  recurringAmount,
  todayPrice,
  trialLabel,
  showTodayLine,
}) {
  return (
    <View border="base" cornerRadius="base" background="surface" padding="base">
      <BlockStack spacing="tight">
        {showRecurring ? (
          <TextBlock subdued>
            {hasTrial
              ? `Then ${formatSubscriptionPrice(String(recurringAmount))}`
              : formatSubscriptionPrice(String(recurringAmount))}
          </TextBlock>
        ) : null}
        {showTodayLine ? (
          <Text size="medium" emphasized appearance="success">
            {todayPrice}
          </Text>
        ) : null}
        {hasTrial ? <TrialBadge label={trialLabel} /> : null}
      </BlockStack>
    </View>
  );
}

function TrialProductCard({
  offer,
  originalPrice,
  calculatedPurchase,
  priceLoading,
  trialDays,
  subscriptionOffer,
}) {
  if (!offer?.productTitle) return null;

  const resolvedOriginal =
    originalPrice ?? offer.originalPrice ?? offer.discountedPrice;
  const trialLabel = trialDays ? `${trialDays}-day trial` : "14-day trial";
  const todayPrice = resolveTrialTodayPrice(
    offer,
    calculatedPurchase,
    priceLoading,
    subscriptionOffer,
    trialDays,
  );
  const imageUrl = optimizeCheckoutImageUrl(
    offer.productImageURL?.trim?.() || offer.productImageURL,
  );
  const hasTrial = Number(trialDays) > 0 && subscriptionOffer;
  const recurringAmount =
    resolvedOriginal && parseFloat(resolvedOriginal) > 0
      ? parseFloat(resolvedOriginal)
      : null;
  const showRecurring = recurringAmount != null;
  const showTodayLine = hasTrial || todayPrice !== "Calculating…";
  const planLine =
    offer.isSubscription && offer.sellingPlanName
      ? offer.sellingPlanName
      : null;

  return (
    <FunnelCard interactive>
      <Layout media={TRIAL_PRODUCT_LAYOUT_MEDIA}>
        <View
          border="base"
          cornerRadius="base"
          background="surface"
          padding="base"
        >
          {imageUrl ? (
            <Image description={offer.productTitle} source={imageUrl} />
          ) : (
            <BlockStack />
          )}
        </View>

        <BlockStack />

        <BlockStack spacing="base">
          <BlockStack spacing="tight">
            <Text emphasized size="medium">
              {offer.productTitle}
            </Text>

            {offer.productDescription?.length ||
            hasRichText(offer.productDescriptionHtml) ? (
              <ProductDescription
                textLines={offer.productDescription}
                html={offer.productDescriptionHtml}
              />
            ) : planLine ? (
              <TextBlock subdued>{planLine}</TextBlock>
            ) : null}

            {offer.productDescription?.length && planLine ? (
              <TextBlock subdued>{planLine}</TextBlock>
            ) : null}
          </BlockStack>

          <TrialPricingBlock
            showRecurring={showRecurring}
            hasTrial={hasTrial}
            recurringAmount={recurringAmount}
            todayPrice={todayPrice}
            trialLabel={trialLabel}
            showTodayLine={showTodayLine}
          />
        </BlockStack>
      </Layout>
    </FunnelCard>
  );
}

function TrialFeatureList({ title, items }) {
  if (!items?.length) return null;

  return (
    <FunnelCard interactive>
      <BlockStack spacing="base">
        <Text emphasized>{title}</Text>

        {items.map((feature, index) => {
          const titleText = getFeatureTitle(feature);
          if (!titleText && !feature.imageUrl) return null;
          const icon = featureIconGlyph(feature.icon);

          return (
            <View
              key={feature.id ?? index}
              border="base"
              cornerRadius="base"
              background="surface"
              padding="base"
            >
              {feature.imageUrl ? (
                <BlockStack spacing="tight">
                  <View maxInlineSize={44}>
                    <Image
                      description={titleText || "Feature"}
                      source={optimizeCheckoutImageUrl(feature.imageUrl)}
                    />
                  </View>
                  <TextBlock>
                    <Text appearance="success" emphasized>
                      ✓{" "}
                    </Text>
                    <Text emphasized>{titleText}</Text>
                  </TextBlock>
                  {hasText(feature.description) ? (
                    <TextBlock subdued>{feature.description}</TextBlock>
                  ) : null}
                </BlockStack>
              ) : (
                <BlockStack spacing="tight">
                  <TextBlock>
                    <Text appearance="success" emphasized>
                      ✓{" "}
                    </Text>
                    <Text emphasized>{titleText}</Text>
                    {icon ? <Text> {icon}</Text> : null}
                  </TextBlock>
                  {hasText(feature.description) ? (
                    <TextBlock subdued>{feature.description}</TextBlock>
                  ) : null}
                </BlockStack>
              )}
            </View>
          );
        })}
      </BlockStack>
    </FunnelCard>
  );
}

function TrialSocialProofSection({ flow, items }) {
  const visible = items ?? [];
  const title = hasText(flow.socialProofTitle)
    ? flow.socialProofTitle
    : "Trusted by thousands";
  const rating = hasText(flow.socialProofRating)
    ? flow.socialProofRating.trim()
    : null;
  const ratingLabel = hasText(flow.socialProofRatingLabel)
    ? flow.socialProofRatingLabel.trim()
    : null;

  if (!visible.length && !hasText(flow.socialProofSubtitle) && !rating) {
    return null;
  }

  return (
    <BlockStack spacing="base">
      <TextContainer alignment="center">
        <Text emphasized>☆ {title}</Text>
      </TextContainer>

      {hasText(flow.socialProofSubtitle) ? (
        <TextContainer alignment="center">
          <TextBlock subdued>{flow.socialProofSubtitle}</TextBlock>
        </TextContainer>
      ) : null}

      {rating ? (
        <FunnelCard interactive>
          <BlockStack spacing="tight">
            <TextContainer alignment="center">
              <Text size="large" emphasized>
                {rating}
              </Text>
            </TextContainer>
            <TextContainer alignment="center">
              <Text appearance="success" emphasized>
                ★★★★★
              </Text>
            </TextContainer>
            {ratingLabel ? (
              <TextContainer alignment="center">
                <TextBlock subdued>{ratingLabel}</TextBlock>
              </TextContainer>
            ) : null}
          </BlockStack>
        </FunnelCard>
      ) : null}

      {visible.length ? (
        <Tiles>
          {visible.slice(0, 2).map((item, index) => (
            <FunnelCard key={item.id ?? index} interactive>
              <BlockStack spacing="tight">
                {item.imageUrl ? (
                  <View maxInlineSize={44}>
                    <Image
                      description={item.text || "Customer"}
                      source={optimizeCheckoutImageUrl(item.imageUrl)}
                    />
                  </View>
                ) : null}
                <Text appearance="success" emphasized>
                  ★★★★★
                </Text>
                {hasText(item.text) ? (
                  <TextBlock>“{item.text}”</TextBlock>
                ) : null}
              </BlockStack>
            </FunnelCard>
          ))}
        </Tiles>
      ) : null}
    </BlockStack>
  );
}

function TrialCommitmentNotes({ items }) {
  const visible = (items ?? []).filter((item) => hasText(item));
  if (!visible.length) return null;

  return (
    <FunnelCard interactive>
      <BlockStack spacing="tight">
        {visible.map((item, index) => (
          <TextBlock key={index}>
            <Text appearance="success" emphasized>
              ✓{" "}
            </Text>
            {item}
          </TextBlock>
        ))}
      </BlockStack>
    </FunnelCard>
  );
}

function TrialTrustBar() {
  return (
    <FunnelCard>
      <Tiles>
        <TextBlock size="small" subdued>
          🔒 Secure checkout
        </TextBlock>
        <TextBlock size="small" subdued>
          🛡 Cancel anytime
        </TextBlock>
        <TextBlock size="small" subdued>
          💳 No charge today
        </TextBlock>
      </Tiles>
    </FunnelCard>
  );
}

function TermsPanel({ flow, showTerms, onToggleTerms }) {
  const hasTerms =
    hasText(flow.termsTitle) ||
    hasText(flow.termsContent) ||
    hasText(flow.termsCheckboxLabel);
  if (!hasTerms) return null;

  const termsBody =
    flow.termsContent ||
    "Auto-billing after trial ends. Cancel anytime from your account. Reminder emails before billing.";

  return (
    <FunnelCard interactive>
      <BlockStack spacing="tight">
        <Button onPress={onToggleTerms} subdued>
          {flow.termsTitle || "Terms & billing"}
        </Button>
        {showTerms ? <TextBlock subdued>{termsBody}</TextBlock> : null}
      </BlockStack>
    </FunnelCard>
  );
}

function FunnelTransitionScreen({ label }) {
  return (
    <PageShell>
      <TextContainer alignment="center">
        <Spinner />
      </TextContainer>
      <TextContainer alignment="center">
        <TextBlock subdued>{label}</TextBlock>
      </TextContainer>
    </PageShell>
  );
}

function ProductOfferFlow() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  const [loading, setLoading] = useState(true);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [buyerConsent, setBuyerConsent] = useState(false);
  const [buyerConsentError, setBuyerConsentError] = useState();
  const [applyError, setApplyError] = useState();

  const payload = storage.initialData ?? {};
  const flow = payload.flow ?? {};
  const purchaseOption = payload.offers?.[0];
  const subscriptionOffer = isSubscriptionOffer(purchaseOption);
  const [subscriptionShippingBlocked, setSubscriptionShippingBlocked] =
    useState(false);
  const { logOnce, logStepOnce } = useAnalyticsOnce(inputData, payload);

  useEffect(() => {
    logStepOnce("offer");
  }, [logStepOnce]);

  useEffect(() => {
    if (!purchaseOption?.changes) {
      setLoading(false);
      return;
    }

    async function calculatePurchase() {
      try {
        const { blocked, calculatedPurchase: purchase } =
          await calculateSubscriptionOffer(
            calculateChangeset,
            purchaseOption.changes,
          );
        setSubscriptionShippingBlocked(blocked);
        if (purchase) setCalculatedPurchase(purchase);
      } catch {
        // Price preview unavailable.
      } finally {
        setLoading(false);
      }
    }

    calculatePurchase();
  }, [calculateChangeset, purchaseOption?.changes]);

  if (!purchaseOption) {
    return null;
  }

  const shipping =
    calculatedPurchase?.addedShippingLines?.[0]?.priceSet?.presentmentMoney
      ?.amount;
  const taxes =
    calculatedPurchase?.addedTaxLines?.[0]?.priceSet?.presentmentMoney?.amount;
  const total =
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
  const { originalPrice, discountedPrice } = resolveOfferPrices(
    purchaseOption,
    calculatedPurchase,
  );

  async function acceptOffer() {
    setApplyError(undefined);
    setBuyerConsentError(undefined);

    if (subscriptionShippingBlocked) {
      setApplyError(
        "This subscription needs a shipping address on your order.",
      );
      return;
    }

    if (subscriptionOffer && !buyerConsent) {
      setBuyerConsentError("You need to accept the subscription policy.");
      return;
    }

    setLoading(true);

    const { ok, errors } = await signAndApplyOffer({
      inputData,
      offer: purchaseOption,
      applyChangeset,
      shopDomain: inputData.shop?.domain,
      buyerConsent,
      bodyExtra: { event: "accepted" },
    });

    if (!ok) {
      handleApplyErrors(errors, setBuyerConsentError, setApplyError);
      setLoading(false);
      return;
    }

    await logOnce(
      "offer_accepted",
      statsRevenuePayload(purchaseOption, calculatedPurchase),
    );

    await logOnce("test_completed", { outcome: "accepted" });
    done();
  }

  async function declineOffer() {
    setLoading(true);
    await logOnce("offer_declined");
    await logOnce("test_completed", { outcome: "declined" });
    done();
  }

  const descriptionLines = (purchaseOption.productDescription ?? []).filter(
    (line) => hasText(line),
  );
  const descriptionHtml = purchaseOption.productDescriptionHtml ?? "";

  return (
    <ProductOfferPageShell>
      <ProductOfferCalloutBanner
        offer={purchaseOption}
        originalPrice={originalPrice}
        discountedPrice={discountedPrice}
        title={purchaseOption.headline}
        subheadline={purchaseOption.subheadline}
        body={flow.body}
      />
      <FunnelCard interactive>
        <Layout media={PRODUCT_OFFER_LAYOUT_MEDIA}>
          {purchaseOption.productImageURL ? (
            <TextContainer alignment="center">
              <Image
                description="product photo"
                source={optimizeCheckoutImageUrl(
                  purchaseOption.productImageURL,
                )}
              />
            </TextContainer>
          ) : (
            <BlockStack />
          )}
          <BlockStack />
          <BlockStack>
            <Heading>{purchaseOption.productTitle}</Heading>
            <PriceHeader
              discountedPrice={discountedPrice}
              originalPrice={originalPrice}
              loading={!calculatedPurchase}
            />
            <ProductDescription
              textLines={descriptionLines}
              html={descriptionHtml}
            />
            <BlockStack spacing="tight">
              <Separator />
              <MoneyLine
                label="Subtotal"
                amount={discountedPrice}
                loading={!calculatedPurchase}
              />
              <MoneyLine
                label="Shipping"
                amount={shipping}
                loading={!calculatedPurchase}
              />
              <MoneyLine
                label="Taxes"
                amount={taxes}
                loading={!calculatedPurchase}
              />
              <Separator />
              <MoneySummary label="Total" amount={total} />
            </BlockStack>
            {applyError ? <ApplyErrorBanner message={applyError} /> : null}
            {subscriptionShippingBlocked ? (
              <SubscriptionShippingNotice />
            ) : null}
            {subscriptionOffer && !subscriptionShippingBlocked ? (
              <SubscriptionConsentFields
                offer={purchaseOption}
                buyerConsent={buyerConsent}
                setBuyerConsent={setBuyerConsent}
                buyerConsentError={buyerConsentError}
                setBuyerConsentError={setBuyerConsentError}
              />
            ) : null}
            <BlockStack>
              <Button
                onPress={acceptOffer}
                submit
                loading={loading}
                disabled={
                  loading ||
                  subscriptionShippingBlocked ||
                  (subscriptionOffer && !buyerConsent)
                }
              >
                {subscriptionShippingBlocked
                  ? "Unavailable for this order"
                  : total
                    ? `Add to order · ${formatCurrency(total)}`
                    : "Add to order"}
              </Button>
              <Button onPress={declineOffer} subdued loading={loading}>
                No thanks
              </Button>
            </BlockStack>
          </BlockStack>
        </Layout>
      </FunnelCard>
    </ProductOfferPageShell>
  );
}

// ─── TRIAL UNLOCK FLOW (Type 2) — Confetti + trial funnel ───────────────────

function buildTrialStepPlan(flow) {
  const steps = [];

  if (hasText(flow.loadingText)) {
    steps.push("loading");
  }

  steps.push("signup");
  steps.push("confirmation");

  return steps;
}
function trialStepProgress(step, steps) {
  const idx = steps.indexOf(step);
  if (idx < 0) return 10;
  return Math.round(((idx + 1) / steps.length) * 100);
}

function TrialUnlockFlow() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  const payload = storage.initialData ?? {};
  const flow = payload.flow ?? {};
  const offer = payload.offers?.[0];

  const stepPlan = buildTrialStepPlan(flow);
  const [step, setStep] = useState(stepPlan[0] ?? "signup");
  const { logOnce, logStepOnce } = useAnalyticsOnce(inputData, payload);
  const { markOutcome, declineOffer } = useTrialOutcomeGuard(
    inputData,
    payload,
    logOnce,
  );
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState();
  const [buyerConsent, setBuyerConsent] = useState(false);
  const [buyerConsentError, setBuyerConsentError] = useState();
  const [applyError, setApplyError] = useState();
  const [showTerms, setShowTerms] = useState(false);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [priceLoading, setPriceLoading] = useState(false);

  const features = filterFeaturesList(flow.features);
  const socialProof = filterSocialProofList(flow.socialProofItems);
  const subscriptionOffer = isSubscriptionOffer(offer);
  const [subscriptionShippingBlocked, setSubscriptionShippingBlocked] =
    useState(false);
  const total =
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
  const stepNum = stepPlan.indexOf(step) + 1;
  const stepTotal = stepPlan.length;
  const progress = trialStepProgress(step, stepPlan);

  function goToStep(nextStep) {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 320);
  }

  function goToNextStep(currentStep) {
    const idx = stepPlan.indexOf(currentStep);
    const next = idx >= 0 ? stepPlan[idx + 1] : null;
    if (next) goToStep(next);
  }

  useEffect(() => {
    if (step !== "loading") return;
    logStepOnce("loading");
    const timer = setTimeout(() => goToNextStep("loading"), 1600);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step === "signup") {
      logStepOnce("signup");
      logStepOnce("features");
      logStepOnce("social_proof");
    }
    if (step === "confirmation") logStepOnce("confirmation");
  }, [step, logStepOnce]);

  useEffect(() => {
    if (step !== "signup" || !offer?.changes || calculatedPurchase) {
      return;
    }
    setPriceLoading(true);
    calculateSubscriptionOffer(calculateChangeset, offer.changes)
      .then(({ blocked, calculatedPurchase: purchase }) => {
        setSubscriptionShippingBlocked(blocked);
        if (purchase) setCalculatedPurchase(purchase);
      })
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }, [step, offer?.changes, calculateChangeset, calculatedPurchase]);

  if (!offer) {
    return (
      <FunnelShell progress={10} stepLabel="Loading your offer">
        <FunnelCard interactive>
          <BlockStack spacing="loose">
            <TextContainer alignment="center">
              <Spinner />
            </TextContainer>
            <TextContainer alignment="center">
              <TextBlock subdued>Preparing your post-purchase offer…</TextBlock>
            </TextContainer>
          </BlockStack>
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (transitioning) {
    return <FunnelTransitionScreen label="Loading next step…" />;
  }

  async function startTrial() {
    setApplyError(undefined);
    setTermsError(undefined);
    setBuyerConsentError(undefined);

    if (!termsAccepted) {
      setTermsError("Please agree to the terms to continue.");
      return;
    }

    if (subscriptionShippingBlocked) {
      setApplyError(
        "This subscription needs a shipping address on your order.",
      );
      return;
    }

    if (subscriptionOffer && !buyerConsent) {
      setBuyerConsentError("You need to accept the subscription policy.");
      return;
    }

    setLoading(true);

    await logOnce("terms_accepted", {});

    const token = await fetchChangesetToken(
      inputData,
      offer.id,
      inputData.shop?.domain,
      { event: "accepted" },
    );

    if (!token) {
      setApplyError("Could not process your request. Please try again.");
      setLoading(false);
      return;
    }

    const { ok, errors } = await applySignedChangeset(
      applyChangeset,
      token,
      offer,
      buyerConsent,
    );

    if (!ok) {
      handleApplyErrors(
        errors,
        setBuyerConsentError,
        setApplyError,
        "Could not add this subscription to your order.",
      );
      setLoading(false);
      return;
    }

    await logOnce("trial_started", {
      isSubscription: Boolean(
        offer.isSubscription ?? isSubscriptionOffer(offer),
      ),
      ...statsRevenuePayload(offer, calculatedPurchase),
    });

    markOutcome("accepted");
    setLoading(false);
    goToStep("confirmation");
  }

  async function finish() {
    setLoading(true);
    markOutcome("trial_activated");
    await logOnce("test_completed", {
      outcome: "trial_activated",
    });
    done();
  }

  async function skip() {
    setLoading(true);
    await declineOffer(done, "skipped");
  }

  if (step === "loading") {
    return (
      <FunnelShell progress={progress} stepLabel="Preparing your offer">
        <FunnelCard interactive>
          <BlockStack spacing="loose">
            <TextContainer alignment="center">
              <Spinner />
            </TextContainer>
            <TextContainer alignment="center">
              <Text size="medium" emphasized>
                {flow.loadingText}
              </Text>
            </TextContainer>
            <TextContainer alignment="center">
              <TextBlock subdued>Please wait a moment</TextBlock>
            </TextContainer>
          </BlockStack>
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (step === "celebration") {
    const celebrationPrices = resolveOfferPrices(offer, calculatedPurchase);
    const bannerTitle = hasText(flow.celebrationHeadline)
      ? flow.celebrationHeadline
      : `You've unlocked a ${flow.trialDays || 14}-day trial!`;
    const bannerProductLine = offer.productTitle
      ? `Add the ${offer.productTitle} to your order.`
      : null;

    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Step ${stepNum} of ${stepTotal}`}
      >
        <CalloutBanner title={bannerTitle}>
          {hasText(flow.celebrationSubheadline) ? (
            <TextContainer alignment="center">
              <Text size="medium">{flow.celebrationSubheadline}</Text>
            </TextContainer>
          ) : bannerProductLine ? (
            <TextContainer alignment="center">
              <Text size="medium">{bannerProductLine}</Text>
            </TextContainer>
          ) : null}
        </CalloutBanner>
        <CelebrationProductHero
          offer={offer}
          originalPrice={celebrationPrices.originalPrice}
          discountedPrice={celebrationPrices.discountedPrice}
        />
        <ActionStack>
          <Button onPress={() => goToNextStep("celebration")} submit>
            {hasText(flow.celebrationPrimaryCta)
              ? flow.celebrationPrimaryCta
              : "See what's included"}
          </Button>
          <Button onPress={skip} subdued>
            {hasText(flow.celebrationSkipCta)
              ? flow.celebrationSkipCta
              : "Skip this step"}
          </Button>
        </ActionStack>
      </FunnelShell>
    );
  }

  if (step === "features") {
    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Step ${stepNum} of ${stepTotal}`}
      >
        {hasText(flow.featuresTitle) ? (
          <TextContainer alignment="center">
            <Heading>{flow.featuresTitle}</Heading>
          </TextContainer>
        ) : (
          <TextContainer alignment="center">
            <Heading>What&apos;s included</Heading>
          </TextContainer>
        )}
        <FeatureList items={features} />
        <Button onPress={() => goToNextStep("features")} submit>
          {hasText(flow.featuresContinueCta)
            ? flow.featuresContinueCta
            : "Continue"}
        </Button>
      </FunnelShell>
    );
  }

  if (step === "social") {
    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Step ${stepNum} of ${stepTotal}`}
      >
        <SocialProofPanel flow={flow} items={socialProof} />
        <Button onPress={() => goToNextStep("social")} submit>
          {hasText(flow.socialProofContinueCta)
            ? flow.socialProofContinueCta
            : "Continue"}
        </Button>
      </FunnelShell>
    );
  }

  if (step === "signup") {
    const canSubmit =
      !subscriptionShippingBlocked &&
      termsAccepted &&
      (!subscriptionOffer || buyerConsent) &&
      !loading &&
      !priceLoading;

    const signupPrices = resolveOfferPrices(offer, calculatedPurchase);
    const trialDays = flow.trialDays || 14;
    const trialEndLabel = computeTrialEndLabel(trialDays);
    const productSubtitle =
      flow.celebrationSubheadline ||
      (offer.productTitle
        ? `Add ${offer.productTitle} today and start your free trial.`
        : "Start your free trial today.");
    const featuresTitle = hasText(flow.featuresTitle)
      ? flow.featuresTitle
      : "Features";

    return (
      <FunnelShell
        progress={progress}
        stepLabel={TrialStepLabel(stepNum, stepTotal)}
      >
        <BlockStack spacing="loose">
          <BlockStack spacing="base">
            <LimitedOfferBadge />

            <TextContainer alignment="center">
              <Heading>
                {flow.celebrationHeadline ||
                  `You've unlocked a ${trialDays}-day trial!`}
              </Heading>
            </TextContainer>

            <TextContainer alignment="center">
              <TextBlock subdued>{productSubtitle}</TextBlock>
            </TextContainer>
          </BlockStack>

          <TrialProductCard
            offer={offer}
            originalPrice={signupPrices.originalPrice}
            calculatedPurchase={calculatedPurchase}
            priceLoading={priceLoading}
            trialDays={trialDays}
            subscriptionOffer={subscriptionOffer}
          />

          <TrialFeatureList title={featuresTitle} items={features} />

          <TrialSocialProofSection flow={flow} items={socialProof} />

          <TrialTrustBar />

          <TrialCommitmentNotes
            items={[flow.signupCommitment1, flow.signupCommitment2]}
          />

          <TermsPanel
            flow={flow}
            showTerms={showTerms}
            onToggleTerms={() => setShowTerms((value) => !value)}
          />

          <ApplyErrorBanner
            message={applyError}
            title="Unable to add subscription"
          />

          {subscriptionShippingBlocked ? <SubscriptionShippingNotice /> : null}

          {!subscriptionShippingBlocked ? (
            <SubscriptionConsentFields
              offer={offer}
              buyerConsent={buyerConsent}
              setBuyerConsent={setBuyerConsent}
              buyerConsentError={buyerConsentError}
              setBuyerConsentError={setBuyerConsentError}
              termsAccepted={termsAccepted}
              setTermsAccepted={setTermsAccepted}
              termsError={termsError}
              setTermsError={setTermsError}
              termsLabel={
                hasText(flow.termsCheckboxLabel)
                  ? flow.termsCheckboxLabel
                  : "I agree to the terms and billing details"
              }
            />
          ) : null}

          <ActionStack>
            <Button
              onPress={startTrial}
              submit
              loading={loading}
              disabled={!canSubmit}
            >
              {subscriptionShippingBlocked
                ? "Unavailable for this order"
                : !termsAccepted
                  ? "Agree to terms to continue"
                  : subscriptionOffer && !buyerConsent
                    ? "Accept subscription policy to continue"
                    : hasText(flow.ctaText)
                      ? flow.ctaText
                      : "Start my free trial"}
            </Button>

            <Button onPress={skip} subdued loading={loading} disabled={loading}>
              {hasText(flow.signupSkipCta)
                ? flow.signupSkipCta
                : "No thanks, I'll pass"}
            </Button>
          </ActionStack>

          <TextContainer alignment="center">
            <TextBlock subdued>
              🛡 No charge today. Cancel anytime before {trialEndLabel}.
            </TextBlock>
          </TextContainer>
        </BlockStack>
      </FunnelShell>
    );
  }

  if (step === "confirmation") {
    const confirmationPrices = resolveOfferPrices(offer, calculatedPurchase);
    const statusMessage = hasText(flow.confirmationStatusText)
      ? flow.confirmationStatusText
      : offer.isSubscription
        ? "Subscription trial added to your order"
        : "Offer added to your order";

    return (
      <FunnelShell
        progress={progress}
        stepLabel={TrialStepLabel(stepNum, stepTotal)}
      >
        <BlockStack spacing="base">
          <SuccessCheckHero
            headline={flow.confirmationHeadline || "You're all set!"}
            subheadline={flow.confirmationSubheadline}
          />
          <ProductSummaryRow
            offer={offer}
            originalPrice={confirmationPrices.originalPrice}
            discountedPrice={confirmationPrices.discountedPrice}
            layout="stacked"
          />
          <StatusBadge>{statusMessage}</StatusBadge>
          <Button onPress={finish} submit loading={loading}>
            Continue to order confirmation
          </Button>
        </BlockStack>
      </FunnelShell>
    );
  }

  return null;
}

// ─── SCORED QUIZ FLOW (Type 3) ──────────────────────────────────────────────

function ScoredQuizFlow() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  const payload = storage.initialData ?? {};
  const flow = payload.flow ?? {};
  const questions = flow.questions ?? [];
  const passOffer = payload.offers?.[0];
  const subscriptionPassOffer = isSubscriptionOffer(passOffer);

  const [step, setStep] = useState("intro");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [analyzingIndex, setAnalyzingIndex] = useState(0);
  const [scorePercent, setScorePercent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [buyerConsent, setBuyerConsent] = useState(false);
  const [buyerConsentError, setBuyerConsentError] = useState();
  const [applyError, setApplyError] = useState();
  const [offerAdded, setOfferAdded] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);

  const analyzingSteps = flow.analyzingSteps?.length
    ? flow.analyzingSteps
    : [
        "Reviewing your answers",
        "Calculating compatibility",
        "Preparing your result",
      ];
  const { logOnce, logStepOnce } = useAnalyticsOnce(inputData, payload);

  useEffect(() => {
    logStepOnce("intro");
  }, [logStepOnce]);

  useEffect(() => {
    if (step === "pass") logStepOnce("pass");
    if (step === "fail") logStepOnce("fail");
  }, [step, logStepOnce]);

  useEffect(() => {
    if (step !== "analyzing") return;

    if (analyzingIndex >= analyzingSteps.length) {
      const score = calculateScorePercent(answers, questions);
      setScorePercent(score);
      const passed = score >= (flow.passThresholdPercent ?? 50);

      logOnce("analyzing_completed", { scorePercent: score });

      if (passed) {
        logOnce("qualified", { scorePercent: score });
        setStep("pass");
      } else {
        logOnce("rejected", { scorePercent: score });
        setStep("fail");
      }
      return;
    }

    const timer = setTimeout(() => {
      setAnalyzingIndex((i) => i + 1);
    }, 1200);

    return () => clearTimeout(timer);
  }, [step, analyzingIndex, analyzingSteps.length, answers, questions]);

  useEffect(() => {
    if (step === "pass" && passOffer?.changes && flow.autoAddOnPass) {
      calculateChangeset({ changes: passOffer.changes }).then((result) => {
        setCalculatedPurchase(result.calculatedPurchase);
      });
    }
  }, [step, passOffer?.changes, flow.autoAddOnPass, calculateChangeset]);

  useEffect(() => {
    if (step !== "pass" || !flow.autoAddOnPass || !passOffer?.changes) return;
    if (subscriptionPassOffer) return;
    if (!calculatedPurchase || offerAdded) return;

    let cancelled = false;

    async function autoAdd() {
      setLoading(true);
      const { ok, errors } = await signAndApplyOffer({
        inputData,
        offer: passOffer,
        applyChangeset,
        shopDomain: inputData.shop?.domain,
        buyerConsent: false,
        bodyExtra: { event: "auto_added", scorePercent },
      });

      if (!cancelled && ok) {
        setOfferAdded(true);
        await logOnce("product_auto_added", {
          scorePercent,
          ...statsRevenuePayload(passOffer, calculatedPurchase),
        });
      } else if (!cancelled && errors.length) {
        handleApplyErrors(errors, setBuyerConsentError, setApplyError);
      }
      if (!cancelled) setLoading(false);
    }

    autoAdd();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    calculatedPurchase,
    flow.autoAddOnPass,
    subscriptionPassOffer,
    offerAdded,
  ]);

  function startQuiz() {
    setLoading(true);
    logStepOnce("questions");
    setTimeout(() => {
      setStep("questions");
      setLoading(false);
    }, 300);
  }

  function selectAnswer(option, question) {
    setSelectedOptionIndex(
      question.options.findIndex((item) => item.label === option.label),
    );

    setTimeout(() => {
      const nextAnswers = [
        ...answers.filter((a) => a.questionId !== question.id),
        { questionId: question.id, score: option.score, label: option.label },
      ];
      setAnswers(nextAnswers);
      setSelectedOptionIndex(null);

      logOnce("question_answered", {
        questionId: question.id,
        questionIndex,
        score: option.score,
      });

      if (questionIndex + 1 < questions.length) {
        setQuestionIndex(questionIndex + 1);
      } else {
        setAnalyzingIndex(0);
        setStep("analyzing");
        logStepOnce("analyzing");
      }
    }, 380);
  }

  async function addPassOffer() {
    if (!passOffer?.changes || offerAdded) return;

    setApplyError(undefined);
    setBuyerConsentError(undefined);

    if (subscriptionPassOffer && !buyerConsent) {
      setBuyerConsentError("You need to accept the subscription policy.");
      return;
    }

    setLoading(true);
    const { ok, errors } = await signAndApplyOffer({
      inputData,
      offer: passOffer,
      applyChangeset,
      shopDomain: inputData.shop?.domain,
      buyerConsent,
      bodyExtra: { event: "auto_added", scorePercent },
    });

    if (ok) {
      setOfferAdded(true);
      await logOnce("offer_accepted", {
        scorePercent,
        ...statsRevenuePayload(passOffer, calculatedPurchase),
      });
    } else {
      handleApplyErrors(errors, setBuyerConsentError, setApplyError);
    }
    setLoading(false);
  }

  async function finish() {
    setLoading(true);
    await logOnce("test_completed", {
      outcome: step === "pass" ? "qualified" : "rejected",
      scorePercent,
    });
    done();
  }

  if (step === "intro") {
    const metaItems = [];
    if (questions.length) {
      metaItems.push({ label: "Questions", value: `${questions.length}` });
      metaItems.push({ label: "Time", value: "Under 30 sec" });
    }
    // if (flow.passThresholdPercent != null) {
    //   metaItems.push({
    //     label: "Pass score",
    //     value: `${flow.passThresholdPercent ?? 50}%`,
    //   });
    // }

    return (
      <FunnelIntroScreen
        stepLabel="Quick compatibility check"
        progress={8}
        eyebrow={
          hasRichText(flow.introHeadline) ? "Post-purchase offer" : undefined
        }
        headline={flow.introHeadline || "See if you qualify"}
        subheadline={flow.introSubheadline}
        body={flow.introBody}
        images={flow.introImages}
        metaItems={metaItems}
        primaryLabel="Start My Free Assessment"
        onPrimary={startQuiz}
        onSkip={() => done()}
        loading={loading}
      />
    );
  }

  // ─── QUESTIONS SCREEN ───
  if (step === "questions") {
    const question = questions[questionIndex];
    if (!question) return null;

    const progress = Math.round(((questionIndex + 1) / questions.length) * 100);
    const isLocked = selectedOptionIndex !== null;

    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Question ${questionIndex + 1} of ${questions.length}`}
      >
        <FunnelContentWithImages
          images={question.images}
          description={question.text || "Question"}
        >
          <BlockStack spacing="loose">
            <SectionEyebrow>Select one answer</SectionEyebrow>
            <TextContainer alignment="leading">
              <Heading>{question.text}</Heading>
            </TextContainer>
            <Separator />
            <ChoiceOptions>
              {question.options.map((option, index) => (
                <ChoiceOption
                  key={index}
                  index={index + 1}
                  label={option.label}
                  selected={selectedOptionIndex === index}
                  disabled={isLocked && selectedOptionIndex !== index}
                  onPress={() => selectAnswer(option, question)}
                />
              ))}
            </ChoiceOptions>
          </BlockStack>
        </FunnelContentWithImages>
      </FunnelShell>
    );
  }

  // ─── ANALYZING SCREEN ───
  if (step === "analyzing") {
    const progress = Math.round(
      ((analyzingIndex + 1) / (analyzingSteps.length + 1)) * 100,
    );
    const label =
      analyzingIndex < analyzingSteps.length
        ? analyzingSteps[analyzingIndex]
        : "Almost done…";

    return (
      <FunnelShell progress={progress} stepLabel="Analyzing your responses">
        <FunnelCard>
          <BlockStack spacing="base">
            <TextContainer alignment="center">
              <Text size="medium" emphasized>
                Analyzing your responses
              </Text>
            </TextContainer>
            <TextContainer alignment="center">
              <TextBlock subdued>{label}</TextBlock>
            </TextContainer>
            <TextContainer alignment="center">
              <Spinner />
            </TextContainer>
          </BlockStack>
        </FunnelCard>
      </FunnelShell>
    );
  }

  // ─── PASS SCREEN ───
  if (step === "pass") {
    const total =
      calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
    const needsManualAdd =
      flow.autoAddOnPass && subscriptionPassOffer && !offerAdded;

    const passPrices = resolveOfferPrices(passOffer, calculatedPurchase);

    return (
      <FunnelShell progress={95} stepLabel="You qualified">
        <FunnelContentWithImages images={flow.passImages} description="Reward">
          {passOffer ? (
            <ProductOfferCalloutBanner
              offer={passOffer}
              originalPrice={passPrices.originalPrice}
              discountedPrice={passPrices.discountedPrice}
              title={flow.passHeadline || "You qualified!"}
              subheadline={flow.passSubheadline}
            />
          ) : (
            <HeroBanner
              eyebrow="Congratulations"
              headline={flow.passHeadline || "You qualified!"}
              subheadline={flow.passSubheadline}
            />
          )}
          {passOffer ? (
            <ProductHero
              offer={passOffer}
              compact
              originalPrice={passPrices.originalPrice}
              discountedPrice={passPrices.discountedPrice}
            />
          ) : null}
          {flow.autoAddOnPass && offerAdded ? (
            <FunnelCard>
              <TextContainer alignment="center">
                <Text appearance="success" emphasized>
                  {total
                    ? `✓ Added to your order · ${formatCurrency(total)}`
                    : "✓ Added to your order"}
                </Text>
              </TextContainer>
            </FunnelCard>
          ) : null}
          {flow.autoAddOnPass && loading && !offerAdded ? (
            <FunnelCard>
              <TextContainer alignment="center">
                <Spinner />
                <TextBlock subdued>Adding to your order…</TextBlock>
              </TextContainer>
            </FunnelCard>
          ) : null}
          <ApplyErrorBanner message={applyError} />
          {needsManualAdd ? (
            <SubscriptionConsentFields
              offer={passOffer}
              buyerConsent={buyerConsent}
              setBuyerConsent={setBuyerConsent}
              buyerConsentError={buyerConsentError}
              setBuyerConsentError={setBuyerConsentError}
            />
          ) : null}
        </FunnelContentWithImages>
        <ActionStack>
          {needsManualAdd ? (
            <Button
              onPress={addPassOffer}
              submit
              loading={loading}
              disabled={!buyerConsent || loading}
            >
              {buyerConsent
                ? resolveActionCta(
                    flow.passAddToOrderCta,
                    "Continue to My Order",
                    total,
                  )
                : hasText(flow.passConsentRequiredCta)
                  ? flow.passConsentRequiredCta
                  : "Accept subscription policy to continue"}
            </Button>
          ) : null}
          <Button
            onPress={finish}
            submit
            loading={loading}
            disabled={loading || (needsManualAdd && !offerAdded)}
          >
            {loading
              ? "Processing…"
              : hasText(flow.passContinueCta)
                ? flow.passContinueCta
                : "Continue to order confirmation"}
          </Button>
        </ActionStack>
      </FunnelShell>
    );
  }

  // ─── FAIL SCREEN ───
  if (step === "fail") {
    return (
      <FunnelShell progress={100} stepLabel="Complete">
        <FunnelContentWithImages
          images={flow.failImages}
          description="Complete"
        >
          <HeroBanner
            eyebrow={hasRichText(flow.failHeadline) ? "Thank you" : undefined}
            headline={flow.failHeadline || "Thanks for your time"}
            subheadline={flow.failMessage}
          />
          <FunnelCard>
            <TextBlock subdued>
              {hasText(flow.failStatusMessage)
                ? flow.failStatusMessage
                : "Your original order is confirmed and on its way."}
            </TextBlock>
          </FunnelCard>
        </FunnelContentWithImages>
        <Button onPress={finish} submit>
          {hasText(flow.failContinueCta)
            ? flow.failContinueCta
            : "Continue to order confirmation"}
        </Button>
      </FunnelShell>
    );
  }

  return null;
}

// ─── SURVEY + REWARD FLOW (Type 4) ─────────────────────────────────────────

function filterSurveySteps(steps) {
  return (steps ?? []).filter((step) => {
    if (step.type === "question") {
      return hasText(step.question?.text);
    }
    if (step.type === "info_card") {
      const card = step.infoCard;
      return (
        hasText(card?.title) ||
        hasRichText(card?.description) ||
        normalizeFlowImages(card?.images).length > 0
      );
    }
    return false;
  });
}

function SurveyRewardFlow() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  const payload = storage.initialData ?? {};
  const flow = payload.flow ?? {};
  const steps = filterSurveySteps(flow.steps);
  const rewardOffer = payload.offers?.[0];
  const subscriptionReward = isSubscriptionOffer(rewardOffer);

  const [stepIndex, setStepIndex] = useState(-1); // -1 = intro
  const [surveyAnswers, setSurveyAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [buyerConsent, setBuyerConsent] = useState(false);
  const [buyerConsentError, setBuyerConsentError] = useState();
  const [applyError, setApplyError] = useState();
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);

  const totalSteps = steps.length;
  const { logOnce, logStepOnce } = useAnalyticsOnce(inputData, payload);

  useEffect(() => {
    logStepOnce("intro");
  }, [logStepOnce]);

  useEffect(() => {
    if (stepIndex < totalSteps || !rewardOffer?.changes) return;
    if (calculatedPurchase) return;

    calculateChangeset({ changes: rewardOffer.changes }).then((result) => {
      setCalculatedPurchase(result.calculatedPurchase);
    });
  }, [
    stepIndex,
    rewardOffer?.changes,
    calculateChangeset,
    calculatedPurchase,
    totalSteps,
  ]);

  function startSurvey() {
    setLoading(true);
    logStepOnce("survey_start");
    setTimeout(() => {
      setStepIndex(0);
      logStepOnce("step_0");
      setLoading(false);
    }, 300);
  }

  function answerQuestion(questionId, answer, optionIndex) {
    setSelectedOptionIndex(optionIndex);

    setTimeout(() => {
      setSurveyAnswers((prev) => [
        ...prev.filter((a) => a.questionId !== questionId),
        { questionId, answer },
      ]);

      logOnce("question_answered", {
        questionId,
        stepIndex,
        answer,
      });

      setSelectedOptionIndex(null);
      advanceStep();
    }, 380);
  }

  function advanceStep() {
    if (stepIndex + 1 < totalSteps) {
      const nextIndex = stepIndex + 1;
      setStepIndex(nextIndex);
      logStepOnce(`step_${nextIndex}`);
    } else {
      setStepIndex(totalSteps);
      logStepOnce("reward");
    }
  }

  async function claimReward() {
    if (!rewardOffer?.changes || rewardClaimed) {
      await logOnce("test_completed", { outcome: "completed" });
      done();
      return;
    }

    setApplyError(undefined);
    setBuyerConsentError(undefined);

    if (subscriptionReward && !buyerConsent) {
      setBuyerConsentError("You need to accept the subscription policy.");
      return;
    }

    setLoading(true);
    const { ok, errors } = await signAndApplyOffer({
      inputData,
      offer: rewardOffer,
      applyChangeset,
      shopDomain: inputData.shop?.domain,
      buyerConsent,
      bodyExtra: { event: "reward_claimed" },
    });

    if (!ok) {
      handleApplyErrors(errors, setBuyerConsentError, setApplyError);
      setLoading(false);
      return;
    }

    setRewardClaimed(true);
    await logOnce("offer_accepted", {
      outcome: "reward_claimed",
      ...statsRevenuePayload(rewardOffer, calculatedPurchase),
    });
    await logOnce("test_completed", { outcome: "reward_claimed" });
    setLoading(false);
    done();
  }

  async function skipSurvey() {
    await logOnce("test_completed", { outcome: "skipped" });
    done();
  }

  if (stepIndex === -1) {
    const questionCount = steps.filter((s) => s.type === "question").length;
    const metaItems = [];
    if (questionCount) {
      metaItems.push({ label: "Questions", value: `${questionCount}` });
    }
    if (rewardOffer?.productTitle) {
      metaItems.push({ label: "Reward", value: "Included" });
    }

    return (
      <FunnelIntroScreen
        stepLabel="Quick survey"
        progress={8}
        eyebrow={hasRichText(flow.introHeadline) ? "Earn a reward" : undefined}
        headline={flow.introHeadline || "Quick survey, free reward"}
        subheadline={flow.introSubheadline}
        body={flow.introBody}
        images={flow.introImages}
        metaItems={metaItems}
        primaryLabel="Start survey"
        onPrimary={startSurvey}
        onSkip={skipSurvey}
        loading={loading}
      />
    );
  }

  // ─── REWARD SCREEN ───
  if (stepIndex >= totalSteps) {
    const total =
      calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
    const canClaim = !subscriptionReward || buyerConsent;

    const rewardPrices = resolveOfferPrices(rewardOffer, calculatedPurchase);

    return (
      <FunnelShell progress={100} stepLabel="Your reward">
        <FunnelContentWithImages
          images={flow.rewardImages}
          description="Reward"
        >
          {rewardOffer ? (
            <ProductOfferCalloutBanner
              offer={rewardOffer}
              originalPrice={rewardPrices.originalPrice}
              discountedPrice={rewardPrices.discountedPrice}
              title={flow.rewardHeadline || "Your reward is ready!"}
              subheadline={flow.rewardDescription}
            />
          ) : (
            <HeroBanner
              eyebrow="Survey complete"
              headline={flow.rewardHeadline || "Your reward is ready!"}
              subheadline={flow.rewardDescription}
            />
          )}
          {rewardOffer ? (
            <ProductHero
              offer={rewardOffer}
              compact
              originalPrice={rewardPrices.originalPrice}
              discountedPrice={rewardPrices.discountedPrice}
            />
          ) : null}
          {total ? (
            <FunnelCard>
              <MoneySummary
                label={subscriptionReward ? "Due today" : "Reward value"}
                amount={total}
              />
            </FunnelCard>
          ) : null}
          <ApplyErrorBanner message={applyError} />
          {subscriptionReward ? (
            <SubscriptionConsentFields
              offer={rewardOffer}
              buyerConsent={buyerConsent}
              setBuyerConsent={setBuyerConsent}
              buyerConsentError={buyerConsentError}
              setBuyerConsentError={setBuyerConsentError}
            />
          ) : null}
        </FunnelContentWithImages>
        <Button
          onPress={claimReward}
          submit
          loading={loading}
          disabled={loading || (subscriptionReward && !canClaim)}
        >
          {rewardOffer
            ? subscriptionReward && !buyerConsent
              ? hasText(flow.rewardConsentRequiredCta)
                ? flow.rewardConsentRequiredCta
                : "Accept subscription policy to claim"
              : resolveActionCta(
                  flow.rewardAddToOrderCta,
                  "Claim my reward",
                  total,
                )
            : hasText(flow.rewardContinueCta)
              ? flow.rewardContinueCta
              : "Continue to order confirmation"}
        </Button>
      </FunnelShell>
    );
  }

  // ─── STEP RENDERING (Questions + Info Cards) ───
  const currentStep = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  if (currentStep.type === "question") {
    const question = currentStep.question;
    const isLocked = selectedOptionIndex !== null;

    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Step ${stepIndex + 1} of ${totalSteps}`}
      >
        <FunnelContentWithImages
          images={question.images}
          description={question.text || "Question"}
        >
          <BlockStack spacing="loose">
            <SectionEyebrow>Select one answer</SectionEyebrow>
            <TextContainer alignment="leading">
              <Heading>{question.text}</Heading>
            </TextContainer>
            <Separator />
            <ChoiceOptions>
              {question.options.map((option, index) => (
                <ChoiceOption
                  key={index}
                  index={index + 1}
                  label={option}
                  selected={selectedOptionIndex === index}
                  disabled={isLocked && selectedOptionIndex !== index}
                  onPress={() => answerQuestion(question.id, option, index)}
                />
              ))}
            </ChoiceOptions>
          </BlockStack>
        </FunnelContentWithImages>
      </FunnelShell>
    );
  }

  if (currentStep.type === "info_card") {
    const card = currentStep.infoCard;

    return (
      <FunnelShell
        progress={progress}
        stepLabel={`Step ${stepIndex + 1} of ${totalSteps}`}
      >
        <FunnelContentWithImages
          images={card.images}
          description={card.title || "Info card"}
        >
          <FunnelCard interactive>
            <BlockStack spacing="tight">
              {hasText(card.title) ? (
                <Text size="medium" emphasized>
                  {card.title}
                </Text>
              ) : null}
              {hasRichText(card.description) ? (
                <RichTextContent
                  content={card.description}
                  subdued
                  alignment="leading"
                />
              ) : null}
            </BlockStack>
          </FunnelCard>
        </FunnelContentWithImages>
        <Button onPress={advanceStep} submit>
          Continue
        </Button>
      </FunnelShell>
    );
  }

  return null;
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function ProductHero({
  offer,
  compact = false,
  originalPrice,
  discountedPrice,
  priceLoading = false,
}) {
  if (!offer?.productTitle) return null;

  const resolvedOriginal = originalPrice ?? offer.originalPrice;
  const resolvedDiscounted = discountedPrice ?? offer.discountedPrice;
  const showPrice = resolvedOriginal || resolvedDiscounted;

  return (
    <FunnelCard interactive>
      <BlockStack spacing={compact ? "tight" : "base"}>
        {offer.productImageURL ? (
          <TextContainer alignment="center">
            <Image
              description="product"
              source={optimizeCheckoutImageUrl(offer.productImageURL)}
            />
          </TextContainer>
        ) : null}
        <TextContainer alignment="center">
          <Heading>{offer.productTitle}</Heading>
        </TextContainer>
        {showPrice ? (
          <PriceHeader
            discountedPrice={resolvedDiscounted ?? resolvedOriginal}
            originalPrice={resolvedOriginal}
            loading={priceLoading}
          />
        ) : null}
        {offer.productDescription?.length ||
        hasRichText(offer.productDescriptionHtml) ? (
          <TextContainer alignment="center">
            <ProductDescription
              textLines={offer.productDescription}
              html={offer.productDescriptionHtml}
            />
          </TextContainer>
        ) : null}
      </BlockStack>
    </FunnelCard>
  );
}

function FeatureList({ items }) {
  if (!items?.length) return null;
  return (
    <BlockStack spacing="base">
      {items.map((feature, i) => (
        <FeatureCard key={feature.id ?? i} feature={feature} />
      ))}
    </BlockStack>
  );
}

function FeatureCard({ feature }) {
  const title = getFeatureTitle(feature);
  const icon = featureIconGlyph(feature.icon);

  return (
    <FunnelCard interactive>
      <BlockStack spacing="base">
        {feature.imageUrl ? (
          <View maxInlineSize={72}>
            <Image
              description={title || "Feature"}
              source={optimizeCheckoutImageUrl(feature.imageUrl)}
            />
          </View>
        ) : null}
        <BlockStack spacing="tight">
          {icon ? (
            <Text size="medium" emphasized>
              {icon}
            </Text>
          ) : null}
          {title ? <Text emphasized>{title}</Text> : null}
          {hasText(feature.description) ? (
            <TextBlock subdued>{feature.description}</TextBlock>
          ) : null}
        </BlockStack>
      </BlockStack>
    </FunnelCard>
  );
}

function SocialProofPanel({ flow, items }) {
  const avatars = items.filter((item) => item.imageUrl);
  const textItems = items.filter(
    (item) => hasText(item.text) && !item.imageUrl,
  );
  const rating = hasText(flow.socialProofRating)
    ? flow.socialProofRating.trim()
    : null;
  const ratingLabel = hasText(flow.socialProofRatingLabel)
    ? flow.socialProofRatingLabel.trim()
    : null;

  return (
    <BlockStack spacing="base">
      {hasText(flow.socialProofTitle) ? (
        <TextContainer alignment="center">
          <Heading>⭐ {flow.socialProofTitle}</Heading>
        </TextContainer>
      ) : null}
      {avatars.length ? (
        <FunnelCard interactive>
          <BlockStack spacing="tight">
            <Tiles maxColumns={Math.min(avatars.length, 5)}>
              {avatars.map((item, index) => (
                <Image
                  key={item.id ?? index}
                  description={item.text || "Customer"}
                  source={optimizeCheckoutImageUrl(item.imageUrl)}
                />
              ))}
            </Tiles>
          </BlockStack>
        </FunnelCard>
      ) : null}
      {hasText(flow.socialProofSubtitle) ? (
        <TextContainer alignment="center">
          <Text emphasized>{flow.socialProofSubtitle}</Text>
        </TextContainer>
      ) : null}
      {rating ? (
        <FunnelCard interactive>
          <BlockStack spacing="tight">
            <TextContainer alignment="center">
              <Text size="large" emphasized>
                {rating}
              </Text>
            </TextContainer>
            <TextContainer alignment="center">
              <Text appearance="success" emphasized>
                ★★★★★
              </Text>
            </TextContainer>
            {ratingLabel ? (
              <TextContainer alignment="center">
                <TextBlock subdued>{ratingLabel}</TextBlock>
              </TextContainer>
            ) : null}
          </BlockStack>
        </FunnelCard>
      ) : null}
      {textItems.map((item, index) => (
        <FunnelCard key={item.id ?? index} interactive>
          <TextContainer alignment="center">
            <Text emphasized>{item.text}</Text>
          </TextContainer>
        </FunnelCard>
      ))}
    </BlockStack>
  );
}

function TrialBadge({ label = "Trial" }) {
  return (
    <View
      border="base"
      cornerRadius="fullyRound"
      background="surface"
      padding="tight"
      maxInlineSize="fill"
    >
      <TextContainer alignment="leading">
        <Text size="small" appearance="success" emphasized>
          {label}
        </Text>
      </TextContainer>
    </View>
  );
}

function CommitmentList({ items }) {
  const visible = (items ?? []).filter((item) => hasText(item));
  if (!visible.length) return null;

  return (
    <FunnelCard interactive>
      <BlockStack spacing="tight">
        {visible.map((item, index) => (
          <TextBlock key={index}>
            <Text appearance="success" emphasized>
              ✓{" "}
            </Text>
            {item}
          </TextBlock>
        ))}
      </BlockStack>
    </FunnelCard>
  );
}

function ProductSummaryRow({
  offer,
  originalPrice,
  discountedPrice,
  priceLoading = false,
  showTrialBadge = false,
  trialDays,
  layout = "row",
}) {
  if (!offer?.productTitle) return null;

  const resolvedOriginal = originalPrice ?? offer.originalPrice;
  const resolvedDiscounted = discountedPrice ?? offer.discountedPrice;
  const price = resolvedDiscounted ?? resolvedOriginal;

  const details = (
    <BlockStack spacing="tight">
      <Heading>{offer.productTitle}</Heading>
      {showTrialBadge ? (
        <TrialBadge label={trialDays ? `${trialDays}-day trial` : "Trial"} />
      ) : null}
      {price ? (
        <Text emphasized appearance="success">
          {!priceLoading && formatCurrency(price)}
        </Text>
      ) : null}
      {offer.isSubscription && offer.sellingPlanName ? (
        <TextBlock subdued>{offer.sellingPlanName}</TextBlock>
      ) : null}
    </BlockStack>
  );

  if (layout === "stacked") {
    return (
      <FunnelCard interactive>
        <BlockStack spacing="base">
          {offer.productImageURL ? (
            <TextContainer alignment="center">
              <View maxInlineSize={120}>
                <Image
                  description="product"
                  source={optimizeCheckoutImageUrl(offer.productImageURL)}
                />
              </View>
            </TextContainer>
          ) : null}
          <TextContainer alignment="center">{details}</TextContainer>
        </BlockStack>
      </FunnelCard>
    );
  }

  return (
    <FunnelCard interactive>
      <Layout media={PRODUCT_ROW_LAYOUT_MEDIA}>
        {offer.productImageURL ? (
          <Image
            description="product"
            source={optimizeCheckoutImageUrl(offer.productImageURL)}
          />
        ) : (
          <BlockStack />
        )}
        <BlockStack />
        {details}
      </Layout>
    </FunnelCard>
  );
}

function CelebrationProductHero({ offer, originalPrice, discountedPrice }) {
  if (!offer?.productTitle) return null;

  const resolvedOriginal = originalPrice ?? offer.originalPrice;
  const resolvedDiscounted = discountedPrice ?? offer.discountedPrice;

  return (
    <FunnelCard interactive>
      <BlockStack spacing="base">
        {offer.productImageURL ? (
          <TextContainer alignment="center">
            <Image
              description="product"
              source={optimizeCheckoutImageUrl(offer.productImageURL)}
            />
          </TextContainer>
        ) : null}
        <TextContainer alignment="center">
          <Heading>{offer.productTitle}</Heading>
        </TextContainer>
        <PriceHeader
          discountedPrice={resolvedDiscounted ?? resolvedOriginal}
          originalPrice={resolvedOriginal}
          appearance="success"
        />
      </BlockStack>
    </FunnelCard>
  );
}

function SuccessCheckHero({ headline, subheadline }) {
  return (
    <FunnelCard interactive>
      <BlockStack spacing="base">
        <TextContainer alignment="center">
          <View
            border="base"
            cornerRadius="fullyRound"
            background="subdued"
            padding="base"
            maxInlineSize={56}
          >
            <Text size="large" appearance="success" emphasized>
              ✓
            </Text>
          </View>
        </TextContainer>
        <RichTextContent content={headline} asHeading alignment="center" />
        <RichTextContent content={subheadline} subdued alignment="center" />
      </BlockStack>
    </FunnelCard>
  );
}

function StatusBadge({ children }) {
  if (!hasText(children)) return null;
  return (
    <FunnelCard interactive>
      <TextContainer alignment="center">
        <Text appearance="success" emphasized>
          ✓ {children}
        </Text>
      </TextContainer>
    </FunnelCard>
  );
}

function PriceHeader({
  discountedPrice,
  originalPrice,
  loading,
  appearance = "critical",
}) {
  const showDiscount =
    originalPrice &&
    discountedPrice &&
    parseFloat(originalPrice) > parseFloat(discountedPrice);

  return (
    <TextContainer alignment="center" spacing="loose">
      {showDiscount ? (
        <Text role="deletion" size="medium">
          {!loading && formatCurrency(originalPrice)}
        </Text>
      ) : null}
      <Text emphasized size="large" appearance={appearance}>
        {!loading && formatCurrency(discountedPrice || originalPrice)}
      </Text>
    </TextContainer>
  );
}

function ProductDescription({ textLines, html }) {
  if (hasRichText(html)) {
    return <RichTextContent content={html} subdued alignment="leading" />;
  }

  const lines = (textLines ?? []).filter((line) => hasText(line));
  if (!lines.length) return null;

  return (
    <BlockStack spacing="xtight">
      {lines.map((text, index) => (
        <TextBlock key={index} subdued>
          {text}
        </TextBlock>
      ))}
    </BlockStack>
  );
}

function MoneyLine({ label, amount, loading = false }) {
  return (
    <Tiles>
      <TextBlock size="small">{label}</TextBlock>
      <TextContainer alignment="trailing">
        <TextBlock emphasized size="small">
          {loading ? "-" : formatCurrency(amount)}
        </TextBlock>
      </TextContainer>
    </Tiles>
  );
}

function MoneySummary({ label, amount }) {
  return (
    <Tiles>
      <TextBlock size="medium" emphasized>
        {label}
      </TextBlock>
      <TextContainer alignment="trailing">
        <TextBlock emphasized size="medium">
          {formatCurrency(amount)}
        </TextBlock>
      </TextContainer>
    </Tiles>
  );
}

function formatCurrency(amount) {
  if (!amount || parseFloat(amount) === 0) {
    return "Free";
  }
  return `$${parseFloat(amount).toFixed(2)}`;
}
