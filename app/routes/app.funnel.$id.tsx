import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import {
  getTest,
  updateTest,
  deleteTest,
  formatTestDbError,
} from "../lib/tests.server";
import {
  resolveFunnelTriggersForSave,
} from "../lib/funnel-triggers.server";
import {
  defaultFunnelTriggers,
  normalizeFunnelTriggers,
  validateFunnelTriggers,
  type FunnelTriggers,
} from "../lib/funnel-triggers.types";
import { getTestAnalyticsDetail, getUsdFxRates } from "../lib/analytics.server";
import {
  DEFAULT_PRODUCT_OFFER_CONFIG,
  DEFAULT_TRIAL_UNLOCK_CONFIG,
  DEFAULT_SCORED_QUIZ_CONFIG,
  normalizeScoredQuizConfig,
  normalizeSurveyRewardConfig,
  DEFAULT_SURVEY_REWARD_CONFIG,
  DEFAULT_COMBO_TEST_CONFIG,
  normalizeTrialUnlockConfig,
  normalizeComboTestConfig,
  normalizeTrialFeatures,
  normalizeSocialProofItems,
  type ProductOfferConfig,
  type TrialUnlockConfig,
  type ScoredQuizConfig,
  type SurveyRewardConfig,
  type ComboTestConfig,
} from "../lib/test-config.types";
import type { TestConfig } from "../lib/tests.server";
import { TEST_TYPE_LABELS, type TestStatus } from "../lib/tests.types";
import { formatTestDate } from "../lib/tests.utils";
import { TestStatusBadge } from "../components/TestStatusBadge";
import { useDisplayCurrency } from "../components/RevenueCurrencySelector";
import {
  FunnelEditorFallback,
  LazyComboTestDetailsView,
  LazyComboTestEditor,
  LazyFunnelAnalyticsPanel,
  LazyQuizFailFields,
  LazyQuizIntroFields,
  LazyQuizPassFields,
  LazySurveyIntroFields,
  LazySurveyRewardFields,
  LazySurveyStepsEditor,
  LazyTrialUnlockConfigEditor,
  LazyTrialUnlockDetailsView,
  LazyTrialUnlockQuestionsEditor,
} from "../components/lazy-funnel-editors";
import { PostPurchaseSetupBanner } from "../components/PostPurchaseSetupBanner";
import {
  checkoutSettingsUrl,
  getPostPurchaseAppStatus,
} from "../lib/post-purchase-setup.server";
import {
  ProductPickerField,
  productFromSelection,
  selectionFromProduct,
  type SelectedProduct,
} from "../components/ProductPickerField";
import { RichTextField } from "../components/RichTextField";
import {
  FunnelEditorTabs,
  FunnelTriggerEditor,
  FunnelTriggerSummary,
} from "../components/FunnelTriggerEditor";
import { useAppNavigate } from "../hooks/useAppNavigate";
import {
  getShopBillingState,
  isTestTypeAllowed,
  planLimitError,
  resolveBillingIsTest,
} from "../lib/billing.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const id = params.id ?? "";

  if (!isSupabaseConfigured() || !id) {
    return {
      test: null,
      analytics: null,
      fx: null,
      postPurchaseStatus: { active: false, state: "unknown" as const },
      billingTest: false,
      checkoutSettingsUrl: checkoutSettingsUrl(),
    };
  }

  const test = await getTest(session.shop, id).catch(() => null);
  const [analytics, fx] = await Promise.all([
    test
      ? getTestAnalyticsDetail(session.shop, test.id, {
          isCombo: test.type === "combo",
          testType: test.type,
        }).catch(() => null)
      : Promise.resolve(null),
    getUsdFxRates().catch(() => null),
  ]);
  const billingTest = await resolveBillingIsTest(admin);
  const postPurchaseStatus = await getPostPurchaseAppStatus(admin, {
    billingTest,
  });

  return {
    test,
    analytics,
    fx,
    postPurchaseStatus,
    billingTest,
    checkoutSettingsUrl: checkoutSettingsUrl(),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const billingState = await getShopBillingState(request);
  const id = params.id ?? "";
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "update");

  if (!isSupabaseConfigured() || !id) {
    return { error: "Not found" };
  }

  if (intent === "delete") {
    await deleteTest(session.shop, id);
    return { deleted: true };
  }

  const statusByIntent: Record<string, TestStatus> = {
    pause: "paused",
    resume: "active",
    end: "closed",
  };
  if (statusByIntent[intent]) {
    const test = await updateTest(session.shop, id, {
      status: statusByIntent[intent],
    });
    if (!test) return { error: "Test not found" };
    return { success: true, status: test.status };
  }

  const name = String(form.get("name") ?? "").trim();
  const status = String(form.get("status") ?? "active") as TestStatus;
  const trafficPercentage = Math.min(
    100,
    Math.max(0, parseInt(String(form.get("trafficPercentage") ?? "100"), 10)),
  );

  let config: TestConfig;
  try {
    config = JSON.parse(String(form.get("config") ?? "{}"));
  } catch {
    return { error: "Invalid configuration" };
  }

  let triggers: FunnelTriggers;
  try {
    triggers = normalizeFunnelTriggers(
      JSON.parse(String(form.get("triggers") ?? "{}")),
    );
  } catch {
    return { error: "Invalid trigger configuration" };
  }

  const triggerError = validateFunnelTriggers(triggers);
  if (triggerError) return { error: triggerError };

  const existing = await getTest(session.shop, id);
  if (!existing) return { error: "Test not found" };
  if (!isTestTypeAllowed(billingState.tier, existing.type)) {
    return { error: planLimitError(billingState.tier, existing.type) };
  }

  try {
    const resolvedTriggers = await resolveFunnelTriggersForSave(admin, triggers);
    const test = await updateTest(session.shop, id, {
      name: name || undefined,
      status,
      trafficPercentage,
      config,
      triggers: resolvedTriggers,
    });

    if (!test) return { error: "Test not found" };
    return { success: true };
  } catch (error) {
    console.error("updateTest failed:", error);
    return { error: formatTestDbError(error) };
  }
};

export default function TestDetail() {
  const { test, analytics, fx, postPurchaseStatus, billingTest, checkoutSettingsUrl } =
    useLoaderData<typeof loader>();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const appNavigate = useAppNavigate();
  const shopify = useAppBridge();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"trigger" | "details">("trigger");
  const [triggers, setTriggers] = useState<FunnelTriggers>(
    defaultFunnelTriggers(),
  );

  const cfg = test?.config as unknown;

  const [name, setName] = useState(test?.name ?? "");
  const [status, setStatus] = useState<TestStatus>(test?.status ?? "active");
  const [trafficPercentage, setTrafficPercentage] = useState(
    test?.trafficPercentage ?? 100,
  );

  // Type 1
  const [productOffer, setProductOffer] = useState<ProductOfferConfig>(
    test?.type === "product_offer"
      ? (cfg as ProductOfferConfig)
      : DEFAULT_PRODUCT_OFFER_CONFIG(),
  );
  const [offerProduct, setOfferProduct] = useState<SelectedProduct | null>(
    test?.type === "product_offer"
      ? selectionFromProduct(cfg as ProductOfferConfig)
      : null,
  );

  // Type 2
  const [trialUnlock, setTrialUnlock] = useState<TrialUnlockConfig>(() =>
    test?.type === "trial_unlock"
      ? normalizeTrialUnlockConfig(cfg as TrialUnlockConfig)
      : DEFAULT_TRIAL_UNLOCK_CONFIG(),
  );
  const [showcaseProduct, setShowcaseProduct] =
    useState<SelectedProduct | null>(
      test?.type === "trial_unlock"
        ? selectionFromProduct(
            normalizeTrialUnlockConfig(cfg as TrialUnlockConfig).product,
          )
        : null,
    );

  // Type 3
  const [scoredQuiz, setScoredQuiz] = useState<ScoredQuizConfig>(
    test?.type === "quiz"
      ? normalizeScoredQuizConfig(cfg as ScoredQuizConfig)
      : DEFAULT_SCORED_QUIZ_CONFIG(),
  );
  const [quizPassProduct, setQuizPassProduct] =
    useState<SelectedProduct | null>(
      test?.type === "quiz"
        ? selectionFromProduct((cfg as ScoredQuizConfig).passProduct)
        : null,
    );

  // Type 4
  const [surveyReward, setSurveyReward] = useState<SurveyRewardConfig>(
    test?.type === "survey"
      ? normalizeSurveyRewardConfig(cfg as SurveyRewardConfig)
      : DEFAULT_SURVEY_REWARD_CONFIG(),
  );
  const [surveyRewardProduct, setSurveyRewardProduct] =
    useState<SelectedProduct | null>(
      test?.type === "survey"
        ? selectionFromProduct((cfg as SurveyRewardConfig).rewardProduct)
        : null,
    );

  const [comboTest, setComboTest] = useState<ComboTestConfig>(() =>
    test?.type === "combo"
      ? normalizeComboTestConfig(cfg as ComboTestConfig)
      : DEFAULT_COMBO_TEST_CONFIG(),
  );
  const [comboTrialProduct, setComboTrialProduct] =
    useState<SelectedProduct | null>(
      test?.type === "combo"
        ? selectionFromProduct(
            normalizeComboTestConfig(cfg as ComboTestConfig).trialUnlock
              .product,
          )
        : null,
    );
  const [comboQuizProduct, setComboQuizProduct] =
    useState<SelectedProduct | null>(
      test?.type === "combo"
        ? selectionFromProduct(
            normalizeComboTestConfig(cfg as ComboTestConfig).quiz.passProduct,
          )
        : null,
    );
  const [comboSurveyProduct, setComboSurveyProduct] =
    useState<SelectedProduct | null>(
      test?.type === "combo"
        ? selectionFromProduct(
            normalizeComboTestConfig(cfg as ComboTestConfig).survey
              .rewardProduct,
          )
        : null,
    );

  useEffect(() => {
    if (!test) return;
    const config = test.config as unknown;
    setName(test.name);
    setStatus(test.status);
    setTrafficPercentage(test.trafficPercentage);
    setTriggers(normalizeFunnelTriggers(test.triggers));

    if (test.type === "product_offer") {
      setProductOffer(config as ProductOfferConfig);
      setOfferProduct(selectionFromProduct(config as ProductOfferConfig));
    }
    if (test.type === "trial_unlock") {
      const normalized = normalizeTrialUnlockConfig(
        config as TrialUnlockConfig,
      );
      setTrialUnlock(normalized);
      setShowcaseProduct(selectionFromProduct(normalized.product));
    }
    if (test.type === "quiz") {
      const normalized = normalizeScoredQuizConfig(config as ScoredQuizConfig);
      setScoredQuiz(normalized);
      setQuizPassProduct(selectionFromProduct(normalized.passProduct));
    }
    if (test.type === "survey") {
      const normalized = normalizeSurveyRewardConfig(
        config as SurveyRewardConfig,
      );
      setSurveyReward(normalized);
      setSurveyRewardProduct(selectionFromProduct(normalized.rewardProduct));
    }
    if (test.type === "combo") {
      const normalized = normalizeComboTestConfig(config as ComboTestConfig);
      setComboTest(normalized);
      setComboTrialProduct(
        selectionFromProduct(normalized.trialUnlock.product),
      );
      setComboQuizProduct(selectionFromProduct(normalized.quiz.passProduct));
      setComboSurveyProduct(
        selectionFromProduct(normalized.survey.rewardProduct),
      );
    }
  }, [test?.id, test?.updatedAt]);

  useEffect(() => {
    if (fetcher.data?.deleted) {
      navigate("/app/funnel");
    }
    if (fetcher.data?.success) {
      shopify.toast.show("Test saved");
      setEditing(false);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, navigate, shopify]);

  if (!test) {
    return (
      <s-page heading="Test not found">
        <s-link slot="breadcrumb-actions" onClick={() => appNavigate("/app/funnel")}>
          Post-Purchase Funnel
        </s-link>
        <s-banner tone="critical">This test could not be found.</s-banner>
      </s-page>
    );
  }

  const buildConfig = () => {
    if (test.type === "product_offer") {
      return { ...productOffer, ...productFromSelection(offerProduct) };
    }
    if (test.type === "trial_unlock") {
      return {
        ...trialUnlock,
        features: normalizeTrialFeatures(trialUnlock.features),
        socialProofItems: normalizeSocialProofItems(trialUnlock.socialProofItems),
        product: {
          ...trialUnlock.product,
          ...productFromSelection(showcaseProduct),
        },
      };
    }
    if (test.type === "quiz") {
      return {
        ...scoredQuiz,
        passProduct: {
          ...scoredQuiz.passProduct,
          ...productFromSelection(quizPassProduct),
        },
      };
    }
    if (test.type === "survey") {
      return {
        ...surveyReward,
        rewardProduct: {
          ...surveyReward.rewardProduct,
          ...productFromSelection(surveyRewardProduct),
        },
      };
    }
    return {
      ...comboTest,
      trialUnlock: {
        ...comboTest.trialUnlock,
        features: normalizeTrialFeatures(comboTest.trialUnlock.features),
        socialProofItems: normalizeSocialProofItems(
          comboTest.trialUnlock.socialProofItems,
        ),
        product: productFromSelection(
          comboTrialProduct,
          comboTest.trialUnlock.product,
        ),
      },
      quiz: {
        ...comboTest.quiz,
        passProduct: productFromSelection(
          comboQuizProduct,
          comboTest.quiz.passProduct,
        ),
      },
      survey: {
        ...comboTest.survey,
        rewardProduct: productFromSelection(
          comboSurveyProduct,
          comboTest.survey.rewardProduct,
        ),
      },
    };
  };

  const handleSave = () => {
    if (test.type === "combo") {
      const splitTotal =
        comboTest.trafficSplit.trial_unlock +
        comboTest.trafficSplit.quiz +
        comboTest.trafficSplit.survey;
      if (splitTotal !== 100) {
        shopify.toast.show("Traffic split must total 100%", { isError: true });
        return;
      }
    }

    const triggerError = validateFunnelTriggers(triggers);
    if (triggerError) {
      shopify.toast.show(triggerError, { isError: true });
      setActiveTab("trigger");
      return;
    }

    const formData = new FormData();
    formData.set("intent", "update");
    formData.set("name", name);
    formData.set("status", status);
    formData.set("trafficPercentage", String(trafficPercentage));
    formData.set("config", JSON.stringify(buildConfig()));
    formData.set("triggers", JSON.stringify(triggers));
    fetcher.submit(formData, { method: "POST" });
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    fetcher.submit(formData, { method: "POST" });
  };

  const isSaving = fetcher.state !== "idle";

  return (
    <s-page heading={test.name}>
      <s-link slot="breadcrumb-actions" onClick={() => appNavigate("/app/funnel")}>
        Post-Purchase Funnel
      </s-link>
      {!editing ? (
        <s-button
          slot="secondary-actions"
          variant="secondary"
          onClick={() => setEditing(true)}
        >
          Edit
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleSave}
          {...(isSaving ? { loading: true } : {})}
        >
          Save changes
        </s-button>
      )}

      <PostPurchaseSetupBanner
        status={postPurchaseStatus}
        billingTest={billingTest}
        checkoutSettingsUrl={checkoutSettingsUrl}
      />

      {editing ? (
        <FunnelEditorTabs activeTab={activeTab} onTabChange={setActiveTab} />
      ) : null}

      {/* ─── Overview ─── */}
      <s-section heading="Overview">
        <s-box
          padding="base"
          border="base"
          borderRadius="base"
          background="base"
        >
          <s-stack direction="block" gap="base">
            {editing && activeTab === "details" ? (
              <>
                <s-text-field
                  label="Test name"
                  value={name}
                  onChange={(e: Event) =>
                    setName((e.currentTarget as HTMLInputElement).value)
                  }
                />
                <s-select
                  label="Status"
                  value={status}
                  onChange={(e: Event) =>
                    setStatus(
                      (e.currentTarget as HTMLSelectElement)
                        .value as TestStatus,
                    )
                  }
                >
                  <s-option value="draft">Draft</s-option>
                  <s-option value="active">Active</s-option>
                  <s-option value="paused">Paused</s-option>
                  <s-option value="closed">Closed</s-option>
                </s-select>
                <s-number-field
                  label="Traffic percentage"
                  value={String(trafficPercentage)}
                  min={0}
                  max={100}
                  onChange={(e: Event) =>
                    setTrafficPercentage(
                      parseInt(
                        (e.currentTarget as HTMLInputElement).value,
                        10,
                      ) || 0,
                    )
                  }
                />
              </>
            ) : (
              <>
                <DetailRow
                  label="Status"
                  value={<TestStatusBadge status={test.status} />}
                />
                <DetailRow label="Type" value={TEST_TYPE_LABELS[test.type]} />
                <DetailRow
                  label="Traffic"
                  value={`${test.trafficPercentage}%`}
                />
                <DetailRow
                  label="Created"
                  value={formatTestDate(test.createdAt)}
                />
                <DetailRow
                  label="Updated"
                  value={formatTestDate(test.updatedAt)}
                />
                <s-stack direction="inline" gap="base">
                  {test.status === "active" && (
                    <s-button
                      variant="tertiary"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "pause");
                        fetcher.submit(fd, { method: "POST" });
                      }}
                    >
                      Pause test
                    </s-button>
                  )}
                  {(test.status === "paused" || test.status === "draft") && (
                    <s-button
                      variant="tertiary"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "resume");
                        fetcher.submit(fd, { method: "POST" });
                      }}
                    >
                      {test.status === "draft" ? "Activate" : "Resume"}
                    </s-button>
                  )}
                  {test.status !== "closed" && (
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "end");
                        fetcher.submit(fd, { method: "POST" });
                      }}
                    >
                      End test
                    </s-button>
                  )}
                </s-stack>
              </>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {!editing ? (
        <s-section heading="Triggers">
          <s-box
            padding="base"
            border="base"
            borderRadius="base"
            background="subdued"
          >
            <FunnelTriggerSummary triggers={test.triggers} />
          </s-box>
        </s-section>
      ) : null}

      {editing && activeTab === "trigger" ? (
        <s-section heading="Triggers">
          <FunnelTriggerEditor triggers={triggers} onChange={setTriggers} />
        </s-section>
      ) : null}

      {/* ─── Analytics ─── */}
      {analytics && (
        <s-section heading="Analytics">
          <s-stack direction="block" gap="base">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading analytics…</FunnelEditorFallback>
              }
            >
              <LazyFunnelAnalyticsPanel
                testType={test.type}
                analytics={analytics}
                displayCurrency={displayCurrency}
                fxRates={fx?.rates ?? { USD: 1 }}
                onDisplayCurrencyChange={setDisplayCurrency}
              />
            </Suspense>
          </s-stack>
        </s-section>
      )}

      {/* ─── Type 1: Product Offer (View) ─── */}
      {!editing &&
        test.type === "product_offer" &&
        (() => {
          const c = test.config as unknown as ProductOfferConfig;
          return (
            <s-section heading="Offer product">
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="inline" gap="base" alignItems="center">
                  {c.productImageUrl ? (
                    <s-thumbnail
                      src={c.productImageUrl}
                      alt={c.productTitle ?? "Product"}
                      size="small"
                    />
                  ) : null}
                  <s-stack direction="block" gap="none">
                    <s-text type="strong">
                      {c.productTitle ?? "No product selected"}
                    </s-text>
                    <s-text tone="neutral" color="subdued">
                      ${c.productPrice ?? "0.00"}
                    </s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-section>
          );
        })()}

      {/* ─── Type 2: Trial Unlock (View) ─── */}
      {!editing && test.type === "trial_unlock" && (
        <s-section heading="Trial unlock funnel">
          <s-box
            padding="base"
            border="base"
            borderRadius="base"
            background="subdued"
          >
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading trial details…</FunnelEditorFallback>
              }
            >
              <LazyTrialUnlockDetailsView
                config={normalizeTrialUnlockConfig(
                  test.config as TrialUnlockConfig,
                )}
              />
            </Suspense>
          </s-box>
        </s-section>
      )}

      {/* ─── Type 5: Combo (View) ─── */}
      {!editing && test.type === "combo" && (
        <s-section heading="Combo test configuration">
          <Suspense
            fallback={
              <FunnelEditorFallback>Loading combo details…</FunnelEditorFallback>
            }
          >
            <LazyComboTestDetailsView
              config={normalizeComboTestConfig(test.config as ComboTestConfig)}
            />
          </Suspense>
        </s-section>
      )}

      {/* ─── Type 3: Scored Quiz (View) ─── */}
      {!editing &&
        test.type === "quiz" &&
        (() => {
          const c = test.config as unknown as ScoredQuizConfig;
          return (
            <s-section heading="Quiz details">
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <DetailRow
                    label="Questions"
                    value={String(c.questions.length)}
                  />
                  <DetailRow
                    label="Pass threshold"
                    value={`${c.passThresholdPercent}%`}
                  />
                  <s-stack direction="inline" gap="base" alignItems="center">
                    {c.passProduct.productImageUrl ? (
                      <s-thumbnail
                        src={c.passProduct.productImageUrl}
                        alt="Reward"
                        size="small"
                      />
                    ) : null}
                    <s-stack direction="block" gap="none">
                      <s-text type="strong">
                        {c.passProduct.productTitle ?? "No reward product"}
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-section>
          );
        })()}

      {/* ─── Type 4: Survey + Reward (View) ─── */}
      {!editing &&
        test.type === "survey" &&
        (() => {
          const c = test.config as unknown as SurveyRewardConfig;
          return (
            <s-section heading="Survey details">
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <DetailRow label="Steps" value={String(c.steps.length)} />
                  <DetailRow
                    label="Questions"
                    value={String(
                      c.steps.filter((s) => s.type === "question").length,
                    )}
                  />
                  <DetailRow
                    label="Info cards"
                    value={String(
                      c.steps.filter((s) => s.type === "info_card").length,
                    )}
                  />
                  <s-stack direction="inline" gap="base" alignItems="center">
                    {c.rewardProduct.productImageUrl ? (
                      <s-thumbnail
                        src={c.rewardProduct.productImageUrl}
                        alt="Reward"
                        size="small"
                      />
                    ) : null}
                    <s-stack direction="block" gap="none">
                      <s-text type="strong">
                        {c.rewardProduct.productTitle ?? "No reward product"}
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-section>
          );
        })()}

      {/* ─── Type 1: Product Offer (Edit) ─── */}
      {editing && activeTab === "details" && test.type === "product_offer" && (
        <s-section heading="Product offer">
          <s-stack direction="block" gap="base">
            <RichTextField
              label="Headline"
              value={productOffer.headline}
              onChange={(headline) =>
                setProductOffer({ ...productOffer, headline })
              }
              minHeight={72}
            />
            <RichTextField
              label="Subheadline"
              value={productOffer.subheadline}
              onChange={(subheadline) =>
                setProductOffer({ ...productOffer, subheadline })
              }
            />
            <RichTextField
              label="Body"
              value={productOffer.body}
              onChange={(body) => setProductOffer({ ...productOffer, body })}
            />
            <ProductPickerField
              label="Upsell product"
              product={offerProduct}
              onChange={setOfferProduct}
            />
            <RichTextField
              label="Product description"
              value={productOffer.customDescription ?? ""}
              onChange={(customDescription) =>
                setProductOffer({ ...productOffer, customDescription })
              }
            />
          </s-stack>
        </s-section>
      )}

      {/* ─── Type 2: Trial Unlock (Edit) ─── */}
      {editing && activeTab === "details" && test.type === "trial_unlock" && (
        <>
          <s-section heading="Trial unlock funnel">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading trial editor…</FunnelEditorFallback>
              }
            >
              <LazyTrialUnlockConfigEditor
                config={trialUnlock}
                onChange={setTrialUnlock}
              />
            </Suspense>
          </s-section>
          <s-section heading="Subscription trial product">
            <s-stack direction="block" gap="base">
              <ProductPickerField
                label="Trial product (subscription only)"
                product={showcaseProduct}
                onChange={setShowcaseProduct}
                subscriptionOnly
              />
              <RichTextField
                label="Product description"
                value={trialUnlock.product.customDescription ?? ""}
                onChange={(customDescription) =>
                  setTrialUnlock({
                    ...trialUnlock,
                    product: { ...trialUnlock.product, customDescription },
                  })
                }
              />
            </s-stack>
          </s-section>
        </>
      )}

      {/* ─── Type 3: Scored Quiz (Edit) ─── */}
      {editing && activeTab === "details" && test.type === "quiz" && (
        <>
          <s-section heading="Intro">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading quiz editor…</FunnelEditorFallback>
              }
            >
              <LazyQuizIntroFields config={scoredQuiz} onChange={setScoredQuiz} />
            </Suspense>
          </s-section>
          <s-section heading="Questions">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading questions…</FunnelEditorFallback>
              }
            >
              <LazyTrialUnlockQuestionsEditor
                questions={scoredQuiz.questions}
                onChange={(questions) =>
                  setScoredQuiz({ ...scoredQuiz, questions })
                }
              />
            </Suspense>
          </s-section>
          <s-section heading="Pass reward">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading pass reward…</FunnelEditorFallback>
              }
            >
              <LazyQuizPassFields
                config={scoredQuiz}
                onChange={setScoredQuiz}
                product={quizPassProduct}
                onProductChange={setQuizPassProduct}
                productLabel="Reward product"
              />
            </Suspense>
          </s-section>
          <s-section heading="Fail path">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading fail path…</FunnelEditorFallback>
              }
            >
              <LazyQuizFailFields config={scoredQuiz} onChange={setScoredQuiz} />
            </Suspense>
          </s-section>
        </>
      )}

      {/* ─── Type 4: Survey + Reward (Edit) ─── */}
      {editing && activeTab === "details" && test.type === "survey" && (
        <>
          <s-section heading="Survey intro">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading survey editor…</FunnelEditorFallback>
              }
            >
              <LazySurveyIntroFields
                config={surveyReward}
                onChange={setSurveyReward}
              />
            </Suspense>
          </s-section>
          <s-section heading="Survey steps">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading survey steps…</FunnelEditorFallback>
              }
            >
              <LazySurveyStepsEditor
                steps={surveyReward.steps}
                onChange={(steps) => setSurveyReward({ ...surveyReward, steps })}
              />
            </Suspense>
          </s-section>
          <s-section heading="Reward">
            <Suspense
              fallback={
                <FunnelEditorFallback>Loading reward editor…</FunnelEditorFallback>
              }
            >
              <LazySurveyRewardFields
                config={surveyReward}
                onChange={setSurveyReward}
                product={surveyRewardProduct}
                onProductChange={setSurveyRewardProduct}
              />
            </Suspense>
          </s-section>
        </>
      )}

      {editing && activeTab === "details" && test.type === "combo" && (
        <Suspense
          fallback={
            <FunnelEditorFallback>Loading combo editor…</FunnelEditorFallback>
          }
        >
          <LazyComboTestEditor
            comboTest={comboTest}
            onComboTestChange={setComboTest}
            trialProduct={comboTrialProduct}
            onTrialProductChange={setComboTrialProduct}
            quizProduct={comboQuizProduct}
            onQuizProductChange={setComboQuizProduct}
            surveyProduct={comboSurveyProduct}
            onSurveyProductChange={setComboSurveyProduct}
          />
        </Suspense>
      )}

      {/* ─── Delete ─── */}
      {editing && activeTab === "details" && (
        <s-section>
          <s-button tone="critical" variant="tertiary" onClick={handleDelete}>
            Delete test
          </s-button>
        </s-section>
      )}
    </s-page>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      <s-box inlineSize="120px">
        <s-text type="strong">{label}</s-text>
      </s-box>
      {typeof value === "string" ? <s-text>{value}</s-text> : value}
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
