import { makeDeferred } from "../../../core/misc";
import { getLogger } from "../../../core/log";
import { Atlas, ImageAsset, Rect, Size, SpriteFrame, Texture2D, Vec2, assetManager } from "cc";
const logger = getLogger("CircleHeaderAtlas");

export interface CircleHeaderAtlasOptions {
    width?: number;
    height?: number;
    /**
     * Clear atlas entries when a duplicate key is inserted.
     * Defaults to true so newer avatar overrides the old one.
     */
    overrideDuplicated?: boolean;
}

export interface RemoteSpriteOptions {
    ext?: string;
    cacheKey?: string;
    bypassCache?: boolean;
}

export class CircleHeaderAtlas {
    private atlas: Atlas;
    private readonly cache = new Map<string, SpriteFrame>();
    private readonly pending = new Map<string, Promise<SpriteFrame | null>>();
    private readonly opts: Required<Pick<CircleHeaderAtlasOptions, "width" | "height" | "overrideDuplicated">>;

    public constructor(options: CircleHeaderAtlasOptions = {}) {
        this.opts = {
            width: options.width ?? 1024,
            height: options.height ?? 1024,
            overrideDuplicated: options.overrideDuplicated ?? true,
        };
        this.atlas = new Atlas(this.opts.width, this.opts.height);
    }

    /**
     * Insert a SpriteFrame into the atlas.
     * @param spriteFrame sprite frame to be packed
     * @param cacheKey optional key for caching / lookup
     */
    public insertSpriteFrame(spriteFrame: SpriteFrame, cacheKey?: string): SpriteFrame | null {
        if (cacheKey && !this.opts.overrideDuplicated && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        if (cacheKey && this.opts.overrideDuplicated) {
            this.disposeCachedFrame(cacheKey);
        }

        const packed = this.insertInternal(spriteFrame, cacheKey);
        if (packed && cacheKey) {
            this.cache.set(cacheKey, packed);
        }
        return packed;
    }

    /**
     * Load an image from network and add it into the atlas.
     */
    public async insertRemoteSpriteFrame(url: string, options: RemoteSpriteOptions = {}): Promise<SpriteFrame | null> {
        const cacheKey = options.cacheKey ?? url;
        if (!options.bypassCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }
        if (this.pending.has(cacheKey)) {
            return this.pending.get(cacheKey)!;
        }

        const pending = this.loadRemoteImage(url, options.ext)
            .then((imageAsset) => {
                if (!imageAsset) {
                    return null;
                }
                const spriteFrame = this.createSpriteFrameFromImage(imageAsset);
                const packed = this.insertInternal(spriteFrame, cacheKey, true);
                if (packed && cacheKey) {
                    this.cache.set(cacheKey, packed);
                }
                return packed;
            })
            .finally(() => {
                this.pending.delete(cacheKey);
            });

        this.pending.set(cacheKey, pending);
        return pending;
    }

    public getSpriteFrame(key: string): SpriteFrame | undefined {
        return this.cache.get(key);
    }

    public has(key: string): boolean {
        return this.cache.has(key);
    }

    public reset(): void {
        this.cache.forEach((frame) => frame.destroy());
        this.cache.clear();
        this.atlas.reset();
    }

    public destroy(): void {
        this.reset();
        this.atlas.destroy();
    }

    private insertInternal(spriteFrame: SpriteFrame, cacheKey?: string, releaseSource = false): SpriteFrame | null {
        const region = this.atlas.insertSpriteFrame(spriteFrame);
        if (!region) {
            logger.warn(`[CircleHeaderAtlas] Failed to insert sprite frame ${cacheKey ?? spriteFrame.name}, atlas is full.`);
            if (releaseSource) {
                this.disposeSpriteFrame(spriteFrame);
            }
            return null;
        }

        const cloned = new SpriteFrame(cacheKey ?? spriteFrame.name);
        cloned.texture = region.texture;
        const { width, height } = spriteFrame.rect;
        cloned.rect = new Rect(region.x, region.y, width, height);
        const originalSize = spriteFrame.originalSize;
        cloned.originalSize = new Size(originalSize.width, originalSize.height);
        const offset = spriteFrame.offset;
        cloned.offset = new Vec2(offset.x, offset.y);
        cloned.rotated = spriteFrame.rotated;
        cloned.packable = false;

        if (releaseSource) {
            this.disposeSpriteFrame(spriteFrame);
        }

        return cloned;
    }

    private async loadRemoteImage(url: string, ext?: string): Promise<ImageAsset | null> {
        const options = ext ? { ext } : undefined;
        const { promise, resolve } = makeDeferred<ImageAsset | null>();
        const callback = (err: Error | null, imageAsset: ImageAsset) => {
            if (err || !imageAsset) {
                logger.error(`[CircleHeaderAtlas] Load remote image failed: ${url}`, err);
                resolve(null);
                return;
            }
            resolve(imageAsset);
        };
        if (options) {
            assetManager.loadRemote<ImageAsset>(url, options, callback);
        } else {
            assetManager.loadRemote<ImageAsset>(url, callback);
        }
        return (await promise) ?? null;
    }

    private createSpriteFrameFromImage(imageAsset: ImageAsset): SpriteFrame {
        const texture = new Texture2D();
        texture.image = imageAsset;

        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        const rect = new Rect(0, 0, imageAsset.width, imageAsset.height);
        spriteFrame.rect = rect;
        spriteFrame.originalSize = new Size(imageAsset.width, imageAsset.height);
        spriteFrame.offset = new Vec2(0, 0);
        spriteFrame.packable = false;
        return spriteFrame;
    }

    private disposeSpriteFrame(spriteFrame: SpriteFrame): void {
        const texture = spriteFrame.texture;
        let imageAsset: ImageAsset | null = null;
        if (texture instanceof Texture2D) {
            imageAsset = texture.image as ImageAsset;
        }
        spriteFrame.destroy();
        if (texture instanceof Texture2D) {
            texture.destroy();
        }
        imageAsset?.destroy();
    }

    private disposeCachedFrame(cacheKey: string): void {
        const cached = this.cache.get(cacheKey);
        if (!cached) {
            return;
        }
        cached.destroy();
        this.cache.delete(cacheKey);
    }
}
