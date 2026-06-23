import { Animation, AnimationClip, Component, Sprite, SpriteFrame, _decorator } from "cc";
const { ccclass, property, executeInEditMode, requireComponent } = _decorator;

@ccclass("FramePlayer")
@requireComponent([Sprite, Animation])
@executeInEditMode
export class FramePlayer extends Component {
    @property(SpriteFrame) private _raw: IGameFramework.Nullable<SpriteFrame> = null;
    @property private _row: number = 1;
    @property private _column: number = 1;
    @property private _build: boolean = false;
    private _animation: IGameFramework.Nullable<Animation> = null!;
    private _sprite: IGameFramework.Nullable<Sprite> = null!;

    public onLoad(): void {
        this._animation = this.getComponent(Animation);
        this._sprite = this.getComponent(Sprite);

        this._buildFrames();
    }

    @property(SpriteFrame) get raw(): IGameFramework.Nullable<SpriteFrame> {
        return this._raw;
    }

    set raw(value: IGameFramework.Nullable<SpriteFrame>) {
        if (this._raw == value) return;
        this._raw = value;
    }

    @property get row(): number {
        return this._row;
    }

    set row(value: number) {
        if (this._row == value) return;
        this._row = value;
    }

    @property get column(): number {
        return this._column;
    }

    set column(value: number) {
        if (this._column == value) return;
        this._column = value;
    }

    @property get build(): boolean {
        return this._build;
    }

    set build(value: boolean) {
        if (this._build == value) return;
        this._build = false;

        if (value) {
            this._buildFrames();
        }
    }

    private _buildFrames(): void {
        if (this._sprite == null || this._animation == null || this._raw == null) return;
        this._sprite!.spriteFrame = null;
        this._animation.clips.length = 0;

        let frames: SpriteFrame[] = [];

        let w = this._raw.width / this._column;
        let h = this._raw.height / this._row;
        for (let i = 0, l = this._row; i < l; i++) {
            for (let j = 0, k = this._column; j < k; j++) {
                const r = this._raw.clone();
                r.rect.set(j * w, i * h, w, h);

                frames.push(r);
            }
        }

        const clip = AnimationClip.createWithSpriteFrames(frames, frames.length);
        clip.wrapMode = AnimationClip.WrapMode.Loop;

        this._animation.addClip(clip, "default");
        this._animation.defaultClip = clip;
        this._animation.play("default");
    }
}