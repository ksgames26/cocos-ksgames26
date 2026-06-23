import { BitmapFont, IAssembler, SpriteFrame, UIRenderer, __private, _decorator } from "cc";
const { ccclass, property } = _decorator;
type IBatcher = __private._cocos_2d_renderer_i_batcher__IBatcher;

let _comp: SpecialLabel | null = null;
const ASSEMBLER: IAssembler = {
    createData(comp: SpecialLabel) {
        const renderData = comp.requestRenderData();
        renderData.resize(0, 0);
        return renderData;
    },

    fillBuffers(comp: SpecialLabel, renderer: IBatcher) {
        debugger;
    },

    updateRenderData(comp: SpecialLabel): void {
        if (!comp.renderData) {
            return;
        }

        if (_comp === comp) { return; }

        if (comp.renderData.vertDirty) {
            _comp = comp;
            const renderData = comp.renderData;

            
        }
    }
};

@ccclass("SpecialLabel")
export class SpecialLabel extends UIRenderer {
    protected _texture: SpriteFrame | null = null;
    @property({ type: BitmapFont }) protected _font: BitmapFont | null = null;

    @property({ type: BitmapFont })
    get font(): BitmapFont | null {
        return this._font;
    }
    set font(value) {
        if (this._font === value) {
            return;
        }
        this._font = value;
    }

    constructor() {
        super();

    }

    public onEnable(): void {
        super.onEnable();
        this._applyFontTexture();
    }

    protected _flushAssembler(): void {
        const assembler = ASSEMBLER;

        if (this._assembler !== assembler) {
            this.destroyRenderData();
            this._assembler = assembler;
        }

        if (!this.renderData) {
            if (this._assembler && this._assembler.createData) {
                this._renderData = this._assembler.createData(this) as typeof this._renderData;
                this.renderData!.material = this.material;
                this._updateColor();
            }
        }
    }

    protected _applyFontTexture(): void {
        this.markForUpdateRenderData();
        const font = this._font!;

        const spriteFrame = font.spriteFrame;
        if (spriteFrame && spriteFrame.texture) {
            this._texture = spriteFrame;
            if (this.renderData) {
                this.renderData.textureDirty = true;
            }
            this.updateMaterial();
            if (this._assembler?.updateRenderData) {
                this._assembler.updateRenderData(this);
            }
        }
    }

    public updateMaterial(): void {
        const mat = this._updateBuiltinMaterial();
        this.setSharedMaterial(mat, 0);
        this._updateBlendFunc();
    }

    protected _render(render: IBatcher): void {
        render.commitComp(this, this.renderData, this._texture, this._assembler!, null);
    }
}
