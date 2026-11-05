import type { SurveyRewardConfig } from "../lib/test-config.types";
import { FunnelImagesEditor } from "./FunnelImagesEditor";
import { RichTextField } from "./RichTextField";

type Props = {
  config: SurveyRewardConfig;
  onChange: (config: SurveyRewardConfig) => void;
};

export function SurveyIntroFields({ config, onChange }: Props) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextField
        label="Intro headline"
        value={config.introHeadline}
        onChange={(introHeadline) => onChange({ ...config, introHeadline })}
        minHeight={72}
      />
      <RichTextField
        label="Intro subheadline"
        value={config.introSubheadline}
        onChange={(introSubheadline) => onChange({ ...config, introSubheadline })}
      />
      <RichTextField
        label="Body"
        value={config.introBody}
        onChange={(introBody) => onChange({ ...config, introBody })}
      />
      <FunnelImagesEditor
        label="Intro images"
        images={config.introImages}
        onChange={(introImages) => onChange({ ...config, introImages })}
      />
    </s-stack>
  );
}
