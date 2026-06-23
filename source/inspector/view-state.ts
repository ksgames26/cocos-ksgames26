'use strict';

import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { readFileSync } from "fs";

type Selector<$> = { $: Record<keyof $, any | null> };

type PanelThis = Selector<typeof $> & { dump: any };

export const template = `
<ui-prop type="dump" class="content"></ui-prop>
`;

export const $ = {
    content: '.content',
};


const createSelectorProp = (labelText: string, selectorClassName: string, selectorDefaultValue?: string, selectorOptions: SelectorOption[] = [], selectCb: (value: string) => void = null!): HTMLElement => {
    const selectorProp = document.createElement('ui-prop');
    const label = document.createElement('ui-label');
    label.setAttribute('slot', 'label');
    label.innerText = labelText;
    const selector = createSelector(selectorClassName, selectorDefaultValue, selectorOptions, selectCb);
    selectorProp.appendChild(label);
    selectorProp.appendChild(selector);

    return selectorProp;
};

const createSelector = (className: string, defaultValue?: string, selectorOptions: SelectorOption[] = [], selectCb: (value: string) => void = null!): HTMLElement => {
    const selector = document.createElement('ui-select');
    selector.setAttribute('class', className);
    selector.setAttribute('slot', 'content');
    if (defaultValue) {
        selector.setAttribute('value', defaultValue);
    }
    selectorOptions.forEach((option) => {
        selector.appendChild(createOption(option));
    });
    selector.addEventListener('change', (event) => {
        //@ts-ignore
        selectCb && selectCb(event.target?.value);
    });
    selector.addEventListener('confirm', (event) => {
        //@ts-ignore
        selectCb && selectCb(event.target?.value);
    });
    return selector;
};

interface SelectorOption {
    value: string;
    text: string;
}

const createOption = (selectorOption: SelectorOption): HTMLElement => {
    const option = document.createElement('option');
    option.setAttribute('value', selectorOption.value);
    option.innerText = selectorOption.text;
    return option;
};

type UIProp = HTMLElement & { render(dump: any): void };
export async function update(this: PanelThis, dump: any) {
    this.dump = dump;
    const content = (this.$.content as HTMLElement);

    const editorMode = Editor.EditMode.getMode();
    if (editorMode === "animation") {
        return;
    }

    for (const key in dump.value) {
        const value = dump.value[key];
        let $prop: UIProp | null = content.querySelector(`ui-prop[key=${key}]`);
        if ($prop) {
            $prop.hidden = !value.visible;
        }
        if (!value.visible) {
            continue;
        }

        if (!$prop) {
            $prop = document.createElement('ui-prop') as UIProp;
            $prop.setAttribute('key', key);
            $prop.setAttribute('type', 'dump');
            content.appendChild($prop);
        }
        $prop.render(value);

        if (key == "defaultClip") {
            const uuid = value?.value?.uuid;
            if (uuid) {
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid) as AssetInfo | null;
                if (assetInfo) {
                    const data = readFileSync(assetInfo.file, 'utf8');

                    try {
                        const json = JSON.parse(data);
                        if (json && Array.isArray(json)) {
                            const clip = json.find(item => item.__type__ == "cc.AnimationClip");

                            if (clip) {
                                const clipEvents = clip._events;
                                if (clipEvents && Array.isArray(clipEvents)) {

                                    interface IEvent {
                                        frame: number;
                                        func: string;
                                        params: string[];
                                    }
                                    const map = new Map<number, IEvent>();
                                    for (const event of clipEvents) {
                                        const has = map.get(event.frame);
                                        if (has) {
                                            // 有名字的事件会替换掉没有名字的事件
                                            if (!has.func && event.func) {
                                                map.set(event.frame, event);
                                            }
                                        } else {
                                            map.set(event.frame, event);
                                        }
                                    }

                                    const events: IEvent[] = Array.from(map.values());


                                    $prop = content.querySelector(`ui-prop[key=State]`);
                                    if ($prop) {
                                        const existingSelector = $prop.querySelector('ui-select');
                                        if (existingSelector) {
                                            // 记录当前选中的值
                                            const currentValue = existingSelector.getAttribute('value');

                                            // 清空现有options
                                            while (existingSelector.firstChild) {
                                                existingSelector.removeChild(existingSelector.firstChild);
                                            }

                                            // 添加新的options
                                            events.forEach((event, index) => {
                                                const option = createOption({
                                                    value: index.toString(),
                                                    text: event.func || "状态" + (index + 1)
                                                });
                                                existingSelector.appendChild(option);
                                            });

                                            // 恢复之前选中的值
                                            existingSelector.setAttribute('value', currentValue!);

                                            await Editor.Message.request('scene', 'execute-component-method', {
                                                uuid: dump.value.uuid.value,
                                                name: 'editorChangeState',
                                                args: currentValue,
                                            });
                                        }
                                        return;
                                    }

                                    $prop = createSelectorProp(
                                        "State",
                                        "event",
                                        "0",
                                        events.map(
                                            (event, index) => (
                                                { value: index.toString(), text: event.func || "状态" + (index + 1) }
                                            )
                                        ),
                                        async (v: string) => {
                                            await Editor.Message.request('scene', 'execute-component-method', {
                                                uuid: dump.value.uuid.value,
                                                name: 'editorChangeState',
                                                args: v,
                                            });
                                        }
                                    ) as UIProp;

                                    $prop.setAttribute("key", "State");
                                    content.appendChild($prop);

                                    const state = await Editor.Message.request('scene', 'execute-component-method', {
                                        uuid: dump.value.uuid.value,
                                        name: 'editorGetState',
                                    });
                                    const selector = $prop.querySelector('ui-select');
                                    if (selector) {
                                        selector.setAttribute('value', state);
                                        await Editor.Message.request('scene', 'execute-component-method', {
                                            uuid: dump.value.uuid.value,
                                            name: 'editorChangeState',
                                            args: state,
                                        });
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error("Failed to parse view state data:", error);
                    }
                }
            }
        }
    }
}