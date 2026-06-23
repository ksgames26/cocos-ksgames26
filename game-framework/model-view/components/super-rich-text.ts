import { logger } from "../../core/log";
import { _decorator, IHtmlTextParserResultObj, RichText, SpriteAtlas, SpriteFrame, UITransform } from "cc";
import { AssetHandle } from "../../services/asset-service";
const { ccclass } = _decorator;

@ccclass('SuperRichText')
export class SuperRichText extends RichText {

    private _frames: Record<string, { handle: AssetHandle<typeof SpriteFrame> | AssetHandle<typeof SpriteAtlas>, ref: number }> = {};

    public refreshFrames(newFrames: Record<string, { handle: AssetHandle<typeof SpriteFrame>, ref: number }>): void {
        for (const key in this._frames) {
            const handle = this._frames[key];
            for (let i = 0; i < handle.ref; i++) {
                handle.handle.remRef();
            }
        }

        this._frames = {};
        this._frames = newFrames;
    }

    protected _addRichTextImageElement(richTextElement: IHtmlTextParserResultObj): void {
        if (!richTextElement.style) {
            return;
        }

        const style = richTextElement.style;
        const spriteFrameName = style.src;
        if (!spriteFrameName) {
            return;
        }
        let spriteFrame = this._imageAtlas && spriteFrameName && this._imageAtlas.getSpriteFrame(spriteFrameName);
        if (!spriteFrame) {
            const handle = this._frames[spriteFrameName];
            if (handle) {
                const atalsOrSpriteFrame = handle.handle.getAsset();
                if (atalsOrSpriteFrame instanceof SpriteAtlas) {
                    spriteFrame = atalsOrSpriteFrame.getSpriteFrame(spriteFrameName);
                } else if (atalsOrSpriteFrame instanceof SpriteFrame) {
                    spriteFrame = atalsOrSpriteFrame;
                }
                handle.handle.addRef();
                handle.ref++;
            }
        }

        if (!spriteFrame) {
            logger.warn(`SuperRichText: SpriteFrame not found for image src: ${spriteFrameName}`);
            return;
        }

        const segment = this._createImage(spriteFrame);
        const uiTransform = segment.node.getComponent(UITransform)!;
        switch (style.imageAlign) {
            case 'top':
                uiTransform.setAnchorPoint(0, 1);
                break;
            case 'center':
                uiTransform.setAnchorPoint(0, 0.5);
                break;
            default:
                uiTransform.setAnchorPoint(0, 0);
                break;
        }

        if (style.imageOffset) {
            segment.imageOffset = style.imageOffset;
        }
        segment.node.layer = this.node.layer;
        this.node.insertChild(segment.node, this._labelChildrenNum++);
        this._segments.push(segment);

        const spriteRect = spriteFrame.rect.clone();
        let scaleFactor = 1;
        let spriteWidth = spriteRect.width;
        let spriteHeight = spriteRect.height;
        const expectWidth = style.imageWidth || 0;
        const expectHeight = style.imageHeight || 0;

        if (expectHeight > 0) {
            scaleFactor = expectHeight / spriteHeight;
            spriteWidth *= scaleFactor;
            spriteHeight *= scaleFactor;
        } else {
            scaleFactor = this._lineHeight / spriteHeight;
            spriteWidth *= scaleFactor;
            spriteHeight *= scaleFactor;
        }

        if (expectWidth > 0) {
            spriteWidth = expectWidth;
        }

        if (this._maxWidth > 0) {
            if (this._lineOffsetX + spriteWidth > this._maxWidth) {
                this._updateLineInfo();
            }
            this._lineOffsetX += spriteWidth;
        } else {
            this._lineOffsetX += spriteWidth;
            if (this._lineOffsetX > this._labelWidth) {
                this._labelWidth = this._lineOffsetX;
            }
        }
        uiTransform.setContentSize(spriteWidth, spriteHeight);
        segment.lineCount = this._lineCount;

        segment.clickHandler = '';
        segment.clickParam = '';
        const event = style.event;
        if (event) {
            segment.clickHandler = event.click;
            segment.clickParam = event.param;
        }
    }

    public onDestroy(): void {

        for (const key in this._frames) {
            const handle = this._frames[key];
            for (let i = 0; i < handle.ref; i++) {
                handle.handle.remRef();
            }
        }

        super.onDestroy();
    }
}
