import { director } from 'cc';
import { join } from 'path';

module.paths.push(join(Editor.App.path, 'node_modules'));

export function load() { };

export function unload() { };

export const methods = {

    async changeDefaultLan(language: string) {

        const labels = director.getScene()?.getComponentsInChildren("I18NLabel");
        if (labels && Array.isArray(labels) && labels.length > 0) {
            for (const label of labels) {
                const i18nKey = (<any>label)["i18nKey"];

                const v = await Editor.Message.request('ksgames26', 'i18n_getInfoOfI18NConf', i18nKey, "label");
                if (v) {
                    (<any>label).editorChangeState(v);
                }
            }
        }

        {
            const labels = director.getScene()?.getComponentsInChildren("I18NRichText");
            if (labels && Array.isArray(labels) && labels.length > 0) {
                for (const label of labels) {
                    const i18nKey = (<any>label)["i18nKey"];

                    const v = await Editor.Message.request('ksgames26', 'i18n_getInfoOfI18NConf', i18nKey, "richtext");
                    if (v) {
                        (<any>label).editorChangeState(v);
                    }
                }
            }
        }

        {
            const labels = director.getScene()?.getComponentsInChildren("I18NSprite");
            if (labels && Array.isArray(labels) && labels.length > 0) {
                for (const label of labels) {
                    const i18nKey = (<any>label)["i18nKey"];

                    const v = await Editor.Message.request('ksgames26', 'i18n_getInfoOfI18NConf', i18nKey, "sprite");
                    if (v) {
                        (<any>label).editorChangeState(v);
                    }
                }
            }
        }
    },
};