import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { isSupabaseConfigured } from "../lib/supabase.server";
import { createTest, formatTestDbError } from "../lib/tests.server";
import { resolveFunnelTriggersForSave } from "../lib/funnel-triggers.server";
import {
  defaultFunnelTriggers,
  normalizeFunnelTriggers,
  validateFunnelTriggers,
  type FunnelTriggers,
} from "../lib/funnel-triggers.types";
import {
  DEFAULT_PRODUCT_OFFER_CONFIG,
  DEFAULT_TRIAL_UNLOCK_CONFIG,
  DEFAULT_SCORED_QUIZ_CONFIG,
  DEFAULT_SURVEY_REWARD_CONFIG,
  DEFAULT_COMBO_TEST_CONFIG,
  normalizeTrialFeatures,
  normalizeSocialProofItems,
  type ProductOfferConfig,
  type TrialUnlockConfig,
  type ScoredQuizConfig,
  type SurveyRewardConfig,
  type ComboTestConfig,
} from "../lib/test-config.types";
import type { TestConfig } from "../lib/tests.server";
import {
  TEST_TYPE_LABELS,
  type TestStatus,
  type TestType,
} from "../lib/tests.types";
import {
  ProductPickerField,
  productFromSelection,
  type SelectedProduct,
} from "../components/ProductPickerField";
import { TrialUnlockQuestionsEditor } from "../components/TrialUnlockQuestionsEditor";
import { TrialUnlockConfigEditor } from "../components/TrialUnlockConfigEditor";
import { SurveyStepsEditor } from "../components/SurveyStepsEditor";
import {
  QuizFailFields,
  QuizIntroFields,
  QuizPassFields,
} from "../components/QuizFunnelFields";
import { SurveyIntroFields } from "../components/SurveyIntroFields";
import { SurveyRewardFields } from "../components/SurveyRewardFields";
import { RichTextField } from "../components/RichTextField";
import { ComboTestEditor } from "../components/ComboTestEditor";
import {
  FunnelEditorTabs,
  FunnelTriggerEditor,
} from "../components/FunnelTriggerEditor";
import { useAppNavigate } from "../hooks/useAppNavigate";
import { useAppLayoutData } from "../hooks/useAppLayoutData";
import { isFunnelType } from "../lib/funnel-type-catalog";
import {
  getShopBillingState,
  isTestTypeAllowed,
  planLimitError,
} from "../lib/billing.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const type = params.type;
  if (!isFunnelType(type)) {
    throw redirect("/app/funnel/new");
  }

  return {
    type,
    dbReady: isSupabaseConfigured(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const billingState = await getShopBillingState(request);
  if (!isSupabaseConfigured()) {
    return { error: "Database not configured" };
  }

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const type = String(form.get("type") ?? "product_offer") as TestType;
  const status = String(form.get("status") ?? "active") as TestStatus;
  const trafficPercentage = Math.min(
    100,
    Math.max(0, parseInt(String(form.get("trafficPercentage") ?? "100"), 10)),
  );

  if (!name) return { error: "Test name is required" };
  if (!isFunnelType(type)) return { error: "Invalid funnel type" };
  if (!isTestTypeAllowed(billingState.tier, type)) {
    return { error: planLimitError(billingState.tier, type) };
  }

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

  try {
    const resolvedTriggers = await resolveFunnelTriggersForSave(
      admin,
      triggers,
    );
    const test = await createTest({
      shop: session.shop,
      name,
      status,
      type,
      trafficPercentage,
      config,
      triggers: resolvedTriggers,
    });

    return { success: true, testId: test.id };
  } catch (error) {
    console.error("createTest failed:", error);
    return { error: formatTestDbError(error) };
  }
};

export default function NewFunnelDetails() {
  const { type, dbReady } = useLoaderData<typeof loader>();
  const appData = useAppLayoutData();
  const typeAllowed = (appData?.allowedTestTypes ?? []).includes(type);
  const navigate = useNavigate();
  const appNavigate = useAppNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<TestStatus>("active");
  const [trafficPercentage, setTrafficPercentage] = useState(100);
  const [activeTab, setActiveTab] = useState<"trigger" | "details">("trigger");
  const [triggers, setTriggers] = useState<FunnelTriggers>(
    defaultFunnelTriggers(),
  );

  const [productOffer, setProductOffer] = useState<ProductOfferConfig>(
    DEFAULT_PRODUCT_OFFER_CONFIG(),
  );
  const [offerProduct, setOfferProduct] = useState<SelectedProduct | null>(
    null,
  );

  const [trialUnlock, setTrialUnlock] = useState<TrialUnlockConfig>(
    DEFAULT_TRIAL_UNLOCK_CONFIG(),
  );
  const [showcaseProduct, setShowcaseProduct] =
    useState<SelectedProduct | null>(null);

  const [scoredQuiz, setScoredQuiz] = useState<ScoredQuizConfig>(
    DEFAULT_SCORED_QUIZ_CONFIG(),
  );
  const [quizPassProduct, setQuizPassProduct] =
    useState<SelectedProduct | null>(null);

  const [surveyReward, setSurveyReward] = useState<SurveyRewardConfig>(
    DEFAULT_SURVEY_REWARD_CONFIG(),
  );
  const [surveyRewardProduct, setSurveyRewardProduct] =
    useState<SelectedProduct | null>(null);

  const [comboTest, setComboTest] = useState<ComboTestConfig>(
    DEFAULT_COMBO_TEST_CONFIG(),
  );
  const [comboTrialProduct, setComboTrialProduct] =
    useState<SelectedProduct | null>(null);
  const [comboQuizProduct, setComboQuizProduct] =
    useState<SelectedProduct | null>(null);
  const [comboSurveyProduct, setComboSurveyProduct] =
    useState<SelectedProduct | null>(null);

  const comboSplitTotal =
    comboTest.trafficSplit.trial_unlock +
    comboTest.trafficSplit.quiz +
    comboTest.trafficSplit.survey;

  const buildConfig = (): TestConfig => {
    if (type === "product_offer") {
      return { ...productOffer, ...productFromSelection(offerProduct) };
    }
    if (type === "trial_unlock") {
      return {
        ...trialUnlock,
        features: normalizeTrialFeatures(trialUnlock.features),
        socialProofItems: normalizeSocialProofItems(
          trialUnlock.socialProofItems,
        ),
        product: {
          ...trialUnlock.product,
          ...productFromSelection(showcaseProduct),
        },
      };
    }
    if (type === "quiz") {
      return {
        ...scoredQuiz,
        passProduct: {
          ...scoredQuiz.passProduct,
          ...productFromSelection(quizPassProduct),
        },
      };
    }
    if (type === "survey") {
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

  const isSaving = fetcher.state !== "idle";

  const handleSave = () => {
    if (!typeAllowed) {
      shopify.toast.show("Upgrade your plan to create this funnel type.", {
        isError: true,
      });
      return;
    }
    if (!name.trim()) {
      shopify.toast.show("Enter a test name", { isError: true });
      return;
    }

    const config = buildConfig();

    if (type === "product_offer") {
      const po = config as ProductOfferConfig;
      if (!po.variantLegacyId) {
        shopify.toast.show("Select a product for the offer", { isError: true });
        return;
      }
    }
    if (type === "trial_unlock") {
      const tc = config as TrialUnlockConfig;
      if (!tc.product.variantLegacyId) {
        shopify.toast.show("Select a trial product", { isError: true });
        return;
      }
      if (!tc.product.sellingPlanLegacyId) {
        shopify.toast.show("Select a subscription selling plan for the trial", {
          isError: true,
        });
        return;
      }
    }
    if (type === "quiz") {
      const qc = config as ScoredQuizConfig;
      if (!qc.questions.length) {
        shopify.toast.show("Add at least one question", { isError: true });
        return;
      }
      if (!qc.passProduct.variantLegacyId) {
        shopify.toast.show("Select a pass reward product", { isError: true });
        return;
      }
    }
    if (type === "survey") {
      const sc = config as SurveyRewardConfig;
      if (!sc.steps.length) {
        shopify.toast.show("Add at least one survey step", { isError: true });
        return;
      }
      if (!sc.rewardProduct.variantLegacyId) {
        shopify.toast.show("Select a reward product", { isError: true });
        return;
      }
    }
    if (type === "combo") {
      const cc = config as ComboTestConfig;
      if (comboSplitTotal !== 100) {
        shopify.toast.show("Combo traffic split must total 100%", {
          isError: true,
        });
        return;
      }
      if (!cc.trialUnlock.product.sellingPlanLegacyId) {
        shopify.toast.show("Combo trial unlock needs a subscription product", {
          isError: true,
        });
        return;
      }
      if (!cc.quiz.questions.length || !cc.quiz.passProduct.variantLegacyId) {
        shopify.toast.show("Configure combo quiz flow and reward product", {
          isError: true,
        });
        return;
      }
      if (!cc.survey.steps.length || !cc.survey.rewardProduct.variantLegacyId) {
        shopify.toast.show("Configure combo survey flow and reward product", {
          isError: true,
        });
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
    formData.set("name", name);
    formData.set("type", type);
    formData.set("status", status);
    formData.set("trafficPercentage", String(trafficPercentage));
    formData.set("config", JSON.stringify(config));
    formData.set("triggers", JSON.stringify(triggers));
    fetcher.submit(formData, { method: "POST" });
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.testId) {
      navigate(`/app/funnel/${fetcher.data.testId}`);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, navigate, shopify]);

  return (
    <s-page heading={`Create ${TEST_TYPE_LABELS[type]}`}>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={!typeAllowed || !dbReady}
        {...(isSaving ? { loading: true } : {})}
      >
        Save funnel
      </s-button>
      <s-link
        slot="breadcrumb-actions"
        onClick={() => appNavigate("/app/funnel")}
      >
        Post-Purchase Funnel
      </s-link>
      <s-link
        slot="breadcrumb-actions"
        onClick={() => appNavigate("/app/funnel/new")}
      >
        All funnel types
      </s-link>

      {!dbReady && (
        <s-banner tone="warning">
          Database is not configured. Saving funnels is unavailable.
        </s-banner>
      )}

      {!typeAllowed && (
        <s-banner tone="warning" heading="Plan upgrade required">
          Your current plan does not include {TEST_TYPE_LABELS[type]}.{" "}
          <s-link onClick={() => appNavigate("/app/billing")}>
            Upgrade on the Billing page
          </s-link>{" "}
          to create this funnel.
        </s-banner>
      )}

      {fetcher.data?.error && (
        <s-banner tone="critical">{fetcher.data.error}</s-banner>
      )}

      <FunnelEditorTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "trigger" ? (
        <s-section heading="Triggers">
          <FunnelTriggerEditor triggers={triggers} onChange={setTriggers} />
        </s-section>
      ) : (
        <>
          <s-section heading="Test details">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Test name"
                value={name}
                required
                onChange={(e: Event) =>
                  setName((e.currentTarget as HTMLInputElement).value)
                }
              />
              <s-select
                label="Status"
                value={status}
                onChange={(e: Event) =>
                  setStatus(
                    (e.currentTarget as HTMLSelectElement).value as TestStatus,
                  )
                }
              >
                <s-option value="draft">Draft</s-option>
                <s-option value="active">Active</s-option>
                <s-option value="paused">Paused</s-option>
              </s-select>
              <s-number-field
                label="Traffic percentage"
                value={String(trafficPercentage)}
                min={0}
                max={100}
                onChange={(e: Event) =>
                  setTrafficPercentage(
                    parseInt((e.currentTarget as HTMLInputElement).value, 10) ||
                      0,
                  )
                }
              />
            </s-stack>
          </s-section>

          {type === "product_offer" && (
            <s-section heading="Product offer content">
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
                  allowSubscription
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

          {type === "trial_unlock" && (
            <>
              <s-section heading="Trial unlock funnel">
                <TrialUnlockConfigEditor
                  config={trialUnlock}
                  onChange={setTrialUnlock}
                />
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

          {type === "quiz" && (
            <>
              <s-section heading="Intro screen">
                <QuizIntroFields config={scoredQuiz} onChange={setScoredQuiz} />
              </s-section>

              <s-section heading="Questions (flexible count)">
                <TrialUnlockQuestionsEditor
                  questions={scoredQuiz.questions}
                  onChange={(questions) =>
                    setScoredQuiz({ ...scoredQuiz, questions })
                  }
                />
              </s-section>

              <s-section heading="Pass reward — auto-add product">
                <QuizPassFields
                  config={scoredQuiz}
                  onChange={setScoredQuiz}
                  product={quizPassProduct}
                  onProductChange={setQuizPassProduct}
                  productLabel="Reward product (added automatically on pass)"
                />
              </s-section>

              <s-section heading="Soft rejection (fail path)">
                <QuizFailFields config={scoredQuiz} onChange={setScoredQuiz} />
              </s-section>
            </>
          )}

          {type === "survey" && (
            <>
              <s-section heading="Survey intro">
                <SurveyIntroFields
                  config={surveyReward}
                  onChange={setSurveyReward}
                />
              </s-section>

              <s-section heading="Survey steps (questions + info cards)">
                <SurveyStepsEditor
                  steps={surveyReward.steps}
                  onChange={(steps) =>
                    setSurveyReward({ ...surveyReward, steps })
                  }
                />
              </s-section>

              <s-section heading="Reward">
                <SurveyRewardFields
                  config={surveyReward}
                  onChange={setSurveyReward}
                  product={surveyRewardProduct}
                  onProductChange={setSurveyRewardProduct}
                  productLabel="Reward product (given after survey completion)"
                />
              </s-section>
            </>
          )}

          {type === "combo" && (
            <ComboTestEditor
              comboTest={comboTest}
              onComboTestChange={setComboTest}
              trialProduct={comboTrialProduct}
              onTrialProductChange={setComboTrialProduct}
              quizProduct={comboQuizProduct}
              onQuizProductChange={setComboQuizProduct}
              surveyProduct={comboSurveyProduct}
              onSurveyProductChange={setComboSurveyProduct}
            />
          )}
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
