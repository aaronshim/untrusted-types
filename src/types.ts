import type { SettingType } from './helpers/chromeSettings';

export type SinkDetails = {
    href: string;
    sink: string;
    stack: string;
    stackId: string;
    input: string;
    important?: boolean;
    domPurifyInput?: string;
    sanitizerInput?: string;
};

export type Settings = {
    key: string;
    label: string;
    defaultValue: any;
    value?: any;
    type: SettingType;
    placeholder?: string;
}