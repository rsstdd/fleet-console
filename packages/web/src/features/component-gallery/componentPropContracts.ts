import type { ConnectionBannerProps } from "@/components/connectionBanner";
import type { DataPlateProps } from "@/components/dataPlate";
import type { EmptyStateProps } from "@/components/emptyState";
import type { FreshnessLabelProps } from "@/components/freshnessLabel";
import type { PersonaToggleProps } from "@/components/personaToggle";
import type { SectionLabelProps } from "@/components/sectionLabel";
import type { StatProps } from "@/components/stat";
import type { StatusChipProps } from "@/components/statusChip";

interface ComponentPropsByName {
  readonly ConnectionBanner: ConnectionBannerProps;
  readonly DataPlate: DataPlateProps;
  readonly EmptyState: EmptyStateProps;
  readonly FreshnessLabel: FreshnessLabelProps;
  readonly PersonaToggle: PersonaToggleProps;
  readonly SectionLabel: SectionLabelProps;
  readonly Stat: StatProps;
  readonly StatusChip: StatusChipProps;
}

type PropDescriptor<Props> = {
  readonly [Key in keyof Props]-?: Record<never, never> extends Pick<Props, Key>
    ? `${Extract<Key, string>}?`
    : Extract<Key, string>;
};

type ComponentPropDescriptors = {
  readonly [Name in keyof ComponentPropsByName]: PropDescriptor<ComponentPropsByName[Name]>;
};

const COMPONENT_PROP_DESCRIPTORS = {
  ConnectionBanner: {
    state: "state",
    lastEventAt: "lastEventAt?",
    attempt: "attempt?",
    terminalCause: "terminalCause?",
    onRetry: "onRetry?",
    className: "className?",
  },
  DataPlate: { children: "children", as: "as?", className: "className?" },
  EmptyState: {
    title: "title",
    description: "description?",
    action: "action?",
    className: "className?",
  },
  FreshnessLabel: {
    state: "state",
    asOf: "asOf",
    receivedAt: "receivedAt?",
    isCompact: "isCompact?",
    className: "className?",
  },
  PersonaToggle: {
    value: "value",
    onChange: "onChange",
    className: "className?",
    isDisabled: "isDisabled?",
  },
  SectionLabel: { children: "children", className: "className?" },
  Stat: {
    label: "label",
    value: "value",
    hint: "hint?",
    tone: "tone?",
    className: "className?",
  },
  StatusChip: {
    variant: "variant",
    label: "label",
    isCurrent: "isCurrent",
    size: "size?",
    className: "className?",
  },
} satisfies ComponentPropDescriptors;

interface ComponentPropsRow {
  readonly component: string;
  readonly props: string;
}

export const COMPONENT_PROPS: ReadonlyArray<ComponentPropsRow> = Object.entries(
  COMPONENT_PROP_DESCRIPTORS,
).map(([component, descriptors]) => ({
  component,
  props: Object.values(descriptors).join(" · "),
}));
