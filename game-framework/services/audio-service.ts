import { Container } from "../core/container";
import { getLogger } from "../core/log";
import { _decorator, AudioClip, AudioSource, director, Node } from "cc";
import { AssetService, type AssetHandle } from "./asset-service";

const { ccclass } = _decorator;
const audioLogger = getLogger("AudioService");

export interface AudioServiceOptions {
    assetService?: AssetService;
    maxEffectSources?: number;
    musicVolume?: number;
    effectVolume?: number;
    persistNodes?: boolean;
}

export interface PlayMusicOptions {
    loop?: boolean;
    volume?: number;
    startTime?: number;
}

export interface PlayEffectOptions {
    loop?: boolean;
    volume?: number;
    startTime?: number;
}

type AudioClipHandle = AssetHandle<typeof AudioClip>;

interface ActiveEffect {
    source: AudioSource;
    handle: AudioClipHandle | null;
    listener: () => void;
}

/**
 * 声音管理
 */
@ccclass("AudioService")
export class AudioService {
    private _assetService: AssetService | null = null;
    private _rootNode: Node | null = null;
    private _musicNode: Node | null = null;
    private _musicSource: AudioSource | null = null;
    private _sfxRoot: Node | null = null;
    private _effectSources: AudioSource[] = [];
    private _freeEffectSources: AudioSource[] = [];
    private _activeEffects: Map<number, ActiveEffect> = new Map();
    private _effectIdSeed = 0;
    private _musicHandle: AudioClipHandle | null = null;
    private _musicVolume = 1;
    private _musicUserVolume = 1;
    private _effectVolume = 1;
    private _maxEffectSources = 8;
    private _initialized = false;

    public get initialized(): boolean {
        return this._initialized;
    }

    public initialize(options?: AudioServiceOptions): void {
        if (this._initialized) {
            if (options?.musicVolume !== undefined) {
                this.setMusicVolume(options.musicVolume);
            }
            if (options?.effectVolume !== undefined) {
                this.setEffectVolume(options.effectVolume);
            }
            return;
        }

        this._assetService = options?.assetService ?? Container.get(AssetService)!;
        if (!this._assetService) {
            throw new Error("AudioService requires AssetService before initialize");
        }

        this._maxEffectSources = Math.max(1, options?.maxEffectSources ?? 8);
        this._musicVolume = this._clampVolume(options?.musicVolume ?? 1);
        this._effectVolume = this._clampVolume(options?.effectVolume ?? 1);

        this._rootNode = new Node("AudioServiceRoot");
        this._musicNode = new Node("AudioServiceMusic");
        this._musicSource = this._musicNode.addComponent(AudioSource);
        this._musicSource.playOnAwake = false;
        this._musicSource.loop = true;
        this._musicSource.volume = this._musicVolume;
        this._musicNode.parent = this._rootNode;

        this._sfxRoot = new Node("AudioServiceEffects");
        this._sfxRoot.parent = this._rootNode;
        for (let i = 0; i < this._maxEffectSources; i++) {
            const node = new Node(`AudioServiceEffect_${i}`);
            const src = node.addComponent(AudioSource);
            src.playOnAwake = false;
            src.loop = false;
            src.volume = this._effectVolume;
            node.parent = this._sfxRoot;
            this._effectSources.push(src);
            this._freeEffectSources.push(src);
        }
        const scene = director.getScene();
        scene?.addChild(this._rootNode);

        if (options?.persistNodes ?? true) {
            director.addPersistRootNode(this._rootNode);
        }

        this._initialized = true;
    }

    public dispose(): void {
        this.stopMusic();
        this.stopAllEffects();

        if (this._rootNode) {
            if (this._rootNode.isValid) {
                this._rootNode.destroy();
            }
            this._rootNode = null;
        }

        this._musicNode = null;
        this._musicSource = null;
        this._sfxRoot = null;
        this._effectSources.length = 0;
        this._freeEffectSources.length = 0;
        this._initialized = false;
    }

    public async playMusic(bundle: string, path: string, options?: PlayMusicOptions): Promise<void> {
        this.ensureInitialized();
        let handle: AudioClipHandle | null = null;
        let clip: AudioClip | null = null;
        try {
            ({ handle, clip } = await this.loadClip(bundle, path));
        } catch (error) {
            audioLogger.error("playMusic load failed", error);
            return;
        }

        this.applyMusicClip(clip!, options, handle);
    }

    public stopMusic(): void {
        if (!this._musicSource) {
            return;
        }

        this._musicSource.stop();
        if (this._musicHandle) {
            this.releaseHandle(this._musicHandle);
            this._musicHandle = null;
        }
    }

    public pauseMusic(): void {
        this._musicSource?.pause();
    }

    public resumeMusic(): void {
        if (this._musicSource && !this._musicSource.playing && this._musicSource.clip) {
            this._musicSource.play();
        }
    }

    public setMusicVolume(volume: number): void {
        this._musicVolume = this._clampVolume(volume);
        if (this._musicSource) {
            this._musicSource.volume = this._musicVolume * this._musicUserVolume;
        }
    }

    public async playEffect(bundle: string, path: string, options?: PlayEffectOptions): Promise<number | null> {
        this.ensureInitialized();
        let handle: AudioClipHandle | null = null;
        let clip: AudioClip | null = null;
        try {
            ({ handle, clip } = await this.loadClip(bundle, path));
        } catch (error) {
            audioLogger.error("playEffect load failed", error);
            return null;
        }

        return this.playEffectClipInternal(clip!, options, handle);
    }

    public stopEffect(effectId: number): void {
        this.finalizeEffect(effectId, true);
    }

    public stopAllEffects(): void {
        const ids = Array.from(this._activeEffects.keys());
        ids.forEach(id => this.finalizeEffect(id, true));
    }

    public setEffectVolume(volume: number): void {
        this._effectVolume = this._clampVolume(volume);
        this._effectSources.forEach(source => {
            source.volume = this._effectVolume;
        });
    }

    private async loadClip(bundle: string, path: string): Promise<{ handle: AudioClipHandle, clip: AudioClip }> {
        const assetService = this.resolveAssetService();
        const handle = assetService.getOrCreateAssetHandle(bundle, AudioClip, path);
        const clip = await handle.safeGetAsset();
        if (!clip) {
            throw new Error(`Audio clip not found: ${bundle}/${path}`);
        }
        return { handle, clip };
    }

    private applyMusicClip(clip: AudioClip, options: PlayMusicOptions | undefined, handle: AudioClipHandle | null): void {
        if (!this._musicSource) {
            return;
        }
        if (this._musicHandle) {
            this.releaseHandle(this._musicHandle);
            this._musicHandle = null;
        }
        this._musicHandle = handle;
        this._musicHandle?.addRef();
        this._musicUserVolume = this._clampVolume(options?.volume ?? 1);
        this._musicSource.clip = clip;
        this._musicSource.loop = options?.loop ?? true;
        this._musicSource.currentTime = options?.startTime ?? 0;
        this._musicSource.volume = this._musicVolume * this._musicUserVolume;
        this._musicSource.play();
    }

    private playEffectClipInternal(clip: AudioClip, options: PlayEffectOptions | undefined, handle: AudioClipHandle | null): number | null {
        const source = this.obtainEffectSource();
        if (!source) {
            audioLogger.warn("No available audio source for effect");
            return null;
        }

        source.stop();
        source.clip = clip;
        source.loop = options?.loop ?? false;
        source.currentTime = options?.startTime ?? 0;
        source.volume = this._effectVolume * this._clampVolume(options?.volume ?? 1);

        const effectId = ++this._effectIdSeed;
        const listener = () => this.finalizeEffect(effectId, false);
        source.node?.once(AudioSource.EventType.ENDED, listener, this);
        this._activeEffects.set(effectId, { source, handle, listener });
        handle?.addRef();
        source.playOnAwake = false;
        source.play();
        return effectId;
    }

    private obtainEffectSource(): AudioSource | null {
        if (this._freeEffectSources.length > 0) {
            return this._freeEffectSources.pop()!;
        }

        const first = this._activeEffects.keys().next();
        if (!first.done) {
            this.finalizeEffect(first.value, true);
            if (this._freeEffectSources.length > 0) {
                return this._freeEffectSources.pop()!;
            }
        }

        return null;
    }

    private finalizeEffect(effectId: number, manual: boolean): void {
        const entry = this._activeEffects.get(effectId);
        if (!entry) {
            return;
        }

        entry.source.node?.off(AudioSource.EventType.ENDED, entry.listener, this);
        if (manual) {
            entry.source.stop();
        }
        if (entry.handle) {
            this.releaseHandle(entry.handle);
        }
        this._activeEffects.delete(effectId);
        this._freeEffectSources.push(entry.source);
    }

    private releaseHandle(handle: AudioClipHandle): void {
        this.resolveAssetService().releaseAsset(handle, false);
    }

    private ensureInitialized(): void {
        if (!this._initialized) {
            this.initialize();
        }
    }

    private resolveAssetService(): AssetService {
        if (!this._assetService) {
            this._assetService = Container.get(AssetService)!;
        }
        if (!this._assetService) {
            throw new Error("AssetService is not available");
        }
        return this._assetService;
    }

    private _clampVolume(value: number): number {
        if (Number.isNaN(value)) {
            return 1;
        }
        return Math.min(1, Math.max(0, value));
    }
}
