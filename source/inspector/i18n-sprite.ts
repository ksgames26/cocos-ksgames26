'use strict';

type Selector<$> = { $: Record<keyof $, any | null> };

type PanelThis = Selector<typeof $> & { dump: any };

export const template = `
<ui-prop type="dump" class="content"></ui-prop>
`;

export const $ = {
    content: '.content',
};

type UIProp = HTMLElement & { render(dump: any): void };

export async function update(this: PanelThis, dump: any) {

    this.dump = dump;
    const content = (this.$.content as HTMLElement);

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

        // 为 i18nKey 字段添加额外的预览功能
        if (key === 'i18nKey') {
            const result = await Editor.Message.request('ksgames26', 'i18n_getInfoOfI18NConf', value.value || '', "sprite");

            await Editor.Message.request('scene', 'execute-component-method', {
                uuid: dump.value.uuid.value,
                name: 'editorChangeState',
                args: [result && result.uuid ? result.uuid : ""],
            });
        }
    }
}

export function ready(this: PanelThis) {
    // Inspector 面板准备就绪
    console.log('I18N Label Inspector panel is ready.');
}

export function close(this: PanelThis) {
    // Inspector 面板关闭
    console.log('I18N Label Inspector panel is closed.');
}