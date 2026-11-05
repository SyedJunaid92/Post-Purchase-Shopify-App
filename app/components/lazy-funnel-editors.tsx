import { lazy, type ReactNode } from "react";

export const LazyTrialUnlockConfigEditor = lazy(() =>
  import("./TrialUnlockConfigEditor").then((module) => ({
    default: module.TrialUnlockConfigEditor,
  })),
);

export const LazyTrialUnlockQuestionsEditor = lazy(() =>
  import("./TrialUnlockQuestionsEditor").then((module) => ({
    default: module.TrialUnlockQuestionsEditor,
  })),
);

export const LazySurveyStepsEditor = lazy(() =>
  import("./SurveyStepsEditor").then((module) => ({
    default: module.SurveyStepsEditor,
  })),
);

export const LazyQuizIntroFields = lazy(() =>
  import("./QuizFunnelFields").then((module) => ({
    default: module.QuizIntroFields,
  })),
);

export const LazyQuizPassFields = lazy(() =>
  import("./QuizFunnelFields").then((module) => ({
    default: module.QuizPassFields,
  })),
);

export const LazyQuizFailFields = lazy(() =>
  import("./QuizFunnelFields").then((module) => ({
    default: module.QuizFailFields,
  })),
);

export const LazySurveyIntroFields = lazy(() =>
  import("./SurveyIntroFields").then((module) => ({
    default: module.SurveyIntroFields,
  })),
);

export const LazySurveyRewardFields = lazy(() =>
  import("./SurveyRewardFields").then((module) => ({
    default: module.SurveyRewardFields,
  })),
);

export const LazyComboTestEditor = lazy(() =>
  import("./ComboTestEditor").then((module) => ({
    default: module.ComboTestEditor,
  })),
);

export const LazyComboTestDetailsView = lazy(() =>
  import("./ComboTestDetailsView").then((module) => ({
    default: module.ComboTestDetailsView,
  })),
);

export const LazyTrialUnlockDetailsView = lazy(() =>
  import("./TrialUnlockDetailsView").then((module) => ({
    default: module.TrialUnlockDetailsView,
  })),
);

export const LazyFunnelAnalyticsPanel = lazy(() =>
  import("./AnalyticsCharts").then((module) => ({
    default: module.FunnelAnalyticsPanel,
  })),
);

export const LazyFunnelTypeBreakdownChart = lazy(() =>
  import("./AnalyticsCharts").then((module) => ({
    default: module.FunnelTypeBreakdownChart,
  })),
);

export const LazyDonutChart = lazy(() =>
  import("./AnalyticsCharts").then((module) => ({
    default: module.DonutChart,
  })),
);

export const LazyGaugeChart = lazy(() =>
  import("./AnalyticsCharts").then((module) => ({
    default: module.GaugeChart,
  })),
);

export function FunnelEditorFallback({ children }: { children?: ReactNode }) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <s-text tone="neutral" color="subdued">
          {children ?? "Loading editor…"}
        </s-text>
      </s-stack>
    </s-box>
  );
}
