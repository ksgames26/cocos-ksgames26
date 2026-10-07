import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

// 执行实际运行时类，通过可控的引擎和输入输出模拟来复现异步时序。
function load(source, mocks) {
    const exports = {};
    const compiled = ts.transpileModule(
        readFileSync(new URL('../game-framework/' + source, import.meta.url), 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText;
    runInNewContext(compiled, {
        exports,
        require(name) {
            if (name in mocks) return mocks[name];
            throw new Error('Unexpected dependency: ' + name);
        },
    });
    return exports;
}

test('disposing a pending join releases the late room for either join method', async () => {
    for (const method of ['joinRoom', 'jointRoomByID']) {
        const pending = deferred();
        let leaves = 0;
        const { ColyseusSdk } = load('client.ts', {
            cc: { assert }, 'cc/env': { DEBUG: false },
            './core/log': { getLogger: () => logger }, './core/container': {}, './core/misc': {},
            './room': { Room: class { listen() { throw new Error('Late room attached'); } } },
            './colyseus': { colyseus: { Client: class {
                joinOrCreate() { return pending.promise; }
                joinById() { return pending.promise; }
            } } },
        });
        const sdk = new ColyseusSdk();
        sdk.initialize({ url: 'ws://example.invalid' });
        const joining = sdk[method]('login', {});
        sdk.dispose();
        pending.resolve({ leave: async () => { leaves++; } });
        assert.equal(await joining, false);
        assert.equal(sdk.getRoom(), null);
        assert.equal(leaves, 1);
    }
});

function loaders(bundles) {
    return load('services/asset-service.ts', {
        cc: {
            _decorator: { ccclass: () => (type) => type },
            Asset: class {}, SpriteFrame: class {}, AssetManager: { Bundle: class {} },
            assetManager: { getBundle: (name) => bundles[name] }, js: {}, assert,
        },
        'cc/env': { DEBUG: false, EDITOR: false },
        '../core/misc': {}, '../core/task': { AsyncTask: class {} },
        '../core/log': { getLogger: () => logger },
        '../core/container': { Container: { get: (type) => type.name === 'TaskService'
            ? { waitNextFrame: async () => {} } : { getAsset: () => null } } },
        './task-service': { TaskService: class TaskService {} },
    }).AsyncLoadDelegate;
}

test('directory loading terminates on error and on success without progress callbacks', async () => {
    let finish;
    const Loader = loaders({ bundle: { loadDir: (_path, _progress, done) => { finish = done; } } });
    const handle = { bundle: 'bundle', path: 'dir', isDir: () => true };
    const failed = new Loader([handle]).loadDir();
    assert.equal((await failed.next()).done, false);
    finish(new Error('directory missing'));
    await assert.rejects(failed.next(), /directory missing/);
    const success = new Loader([handle]).loadDir();
    await success.next();
    finish(null, []);
    await success.next();
    assert.equal((await success.next()).done, true);
});

test('batch loading waits for every bundle, type and directory even with identical paths', async () => {
    for (const isDir of [false, true]) {
        const callbacks = [];
        const bundle = {
            load: (_path, _type, _progress, done) => callbacks.push(done),
            loadDir: (_path, _progress, done) => callbacks.push(done),
        };
        const Loader = loaders({ a: bundle, b: bundle });
        const handles = ['a', 'b', 'a'].map((name) => ({
            bundle: name, path: 'ui/icon', type: class {}, internet: false, isDir: () => isDir,
        }));
        const loading = new Loader(handles).loadAssets();
        await loading.next();
        callbacks[0](null, {});
        for (let frame = 0; frame < 3; frame++) assert.equal((await loading.next()).done, false);
        callbacks[1](null, {});
        for (let frame = 0; frame < 3; frame++) assert.equal((await loading.next()).done, false);
        callbacks[2](null, {});
        await loading.next();
        assert.equal((await loading.next()).done, true);
    }
});

test('new music, stop and disposal invalidate pending music loads', async () => {
    const { AudioService } = load('services/audio-service.ts', {
        cc: { _decorator: { ccclass: () => (type) => type } },
        '../core/container': {}, '../core/log': { getLogger: () => logger }, './asset-service': {},
    });
    for (const action of ['new', 'stop', 'dispose']) {
        const audio = new AudioService();
        audio._initialized = true;
        const pending = deferred();
        const played = [];
        audio.loadClip = async (_bundle, name) => name === 'A'
            ? pending.promise : { clip: 'B', handle: null };
        audio.applyMusicClip = (clip) => played.push(clip);
        const old = audio.playMusic('music', 'A');
        if (action === 'new') await audio.playMusic('music', 'B');
        else if (action === 'stop') audio.stopMusic();
        else audio.dispose();
        pending.resolve({ clip: 'A', handle: null });
        await old;
        assert.deepEqual(played, action === 'new' ? ['B'] : []);
    }
});

test('图集按 Sprite 当前绑定计数，换帧、换图集、清空和销毁均正确释放', () => {
    const resources = new Map();
    const released = [];
    class Asset {}
    class SpriteFrame extends Asset {}
    class SpriteAtlas extends Asset {
        getSpriteFrame(name) { return name === 'missing' ? null : new SpriteFrame(); }
    }
    let service;
    const { AssetService } = load('services/asset-service.ts', {
        cc: {
            _decorator: { ccclass: () => type => type }, Asset, SpriteFrame, SpriteAtlas,
            AssetManager: { Bundle: class {} },
            Node: { EventType: { NODE_DESTROYED: 'destroy' } },
            js: { IDGenerator: class {}, getClassName: type => type.name },
            assetManager: { getBundle: () => ({
                get: path => resources.get(path),
                release: path => { released.push(path); resources.delete(path); },
            }) },
        },
        'cc/env': { DEBUG: false, EDITOR: false },
        '../core/misc': {}, '../core/task': { AsyncTask: class {} },
        '../core/log': { getLogger: () => logger },
        '../core/container': { Container: { get: () => service } }, './task-service': {},
    });
    service = new AssetService(); service.hashKey = false;
    const a = service.getOrCreateAssetHandle('ui', SpriteAtlas, 'A');
    const b = service.getOrCreateAssetHandle('ui', SpriteAtlas, 'B');
    const image = service.getOrCreateAssetHandle('ui', SpriteFrame, 'image');
    resources.set('A', new SpriteAtlas()); resources.set('B', new SpriteAtlas());
    resources.set('image', new SpriteFrame());
    const makeSprite = () => {
        const listeners = new Set();
        return { isValid: true, spriteFrame: null, listeners, node: {
            isValid: true,
            once: (_event, callback) => listeners.add(callback),
            off: (_event, callback) => listeners.delete(callback),
            destroy: () => { [...listeners].forEach(callback => callback()); },
        } };
    };
    const first = makeSprite(), second = makeSprite();
    a.setAtlasFrame(first, 'one', true); a.setAtlasFrame(second, 'two', true);
    for (let i = 0; i < 100; i++) a.setAtlasFrame(first, 'three', true);
    assert.equal(a.ref, 2);
    assert.equal(first.listeners.size, 1);
    const previousFrame = first.spriteFrame;
    assert.throws(() => a.setAtlasFrame(first, 'missing', true), /不存在/);
    assert.equal(first.spriteFrame, previousFrame);
    assert.equal(a.ref, 2);
    b.setAtlasFrame(first, 'one', true);
    assert.equal(a.ref, 1); assert.equal(b.ref, 1);
    assert.deepEqual(released, []);
    assert.equal(first.listeners.size, 1);
    service.setSpriteFrame(first, image, true);
    assert.equal(b.ref, 0); assert.equal(image.ref, 1);
    assert.deepEqual(released, ['B']);
    service.clearSpriteFrame(first); service.clearSpriteFrame(first);
    assert.equal(image.ref, 0); assert.equal(first.spriteFrame, null);
    assert.equal(first.listeners.size, 0);
    second.node.destroy(); second.node.destroy();
    assert.equal(a.ref, 0); assert.equal(second.listeners.size, 0);
    assert.deepEqual(released, ['B', 'image', 'A']);
});

test('便捷加载复用句柄、不改变业务引用且失败时抛出错误', async () => {
    class Asset {}
    class SpriteAtlas extends Asset {}
    class SpriteFrame extends Asset {}
    class TaskService {}
    const atlas = Object.assign(new SpriteAtlas(), { uuid: 'atlas' });
    const frame = Object.assign(new SpriteFrame(), { uuid: 'frame' });
    const cached = new Map();
    let bundleCalls = 0, failBundle = false;
    const bundle = {
        get: (_path, type) => cached.get(type),
        load(path, type, ...callbacks) {
            const done = callbacks.at(-1);
            if (path === 'missing') { done(new Error('missing')); return; }
            const asset = type === SpriteAtlas ? atlas : frame;
            cached.set(type, asset); done(null, asset);
        },
        release() {},
    };
    let service;
    const exports = load('services/asset-service.ts', {
        cc: {
            _decorator: { ccclass: () => type => type }, Asset, SpriteAtlas, SpriteFrame,
            AssetManager: { Bundle: class {} },
            js: { IDGenerator: class {}, getClassName: type => type.name },
            assetManager: {
                getBundle: name => name === 'absent' ? null : bundle,
                loadBundle(_name, _options, done) { bundleCalls++; done(failBundle ? new Error('bundle failed') : null, bundle); },
            },
        },
        'cc/env': { DEBUG: false, EDITOR: false }, '../core/misc': {},
        '../core/task': { AsyncTask: class {} }, '../core/log': { getLogger: () => logger },
        './task-service': { TaskService },
        '../core/container': { Container: { get: type => type === TaskService
            ? { waitNextFrame: async () => {} } : service } },
    });
    service = new exports.AssetService(); service.hashKey = false;
    const handle = await service.load('ui', SpriteAtlas, 'icons');
    assert.equal(handle, service.getOrCreateAssetHandle('ui', SpriteAtlas, 'icons'));
    assert.equal(handle.ref, 0);
    assert.equal(await service.load('ui', SpriteAtlas, 'icons'), handle);
    cached.clear();
    await assert.rejects(service.load('ui', SpriteFrame, 'missing'), /加载失败/);
    assert.equal(service.getOrCreateAssetHandle('ui', SpriteFrame, 'missing').ref, 0);
    handle.addRef();
    assert.equal(await service.load('ui', SpriteAtlas, 'icons'), handle);
    assert.equal(handle.ref, 1);
    failBundle = true;
    const absent = service.getOrCreateAssetHandle('absent', SpriteAtlas, 'icons');
    absent.addRef();
    await assert.rejects(async () => {
        for await (const _progress of service.loadAssets([absent]).load()) {}
    }, /bundle failed/);
    assert.equal(absent.ref, 1); assert.equal(bundleCalls, 1);
    handle.remRef(); absent.remRef();
});
