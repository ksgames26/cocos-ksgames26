import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
const logger = { debug() {}, warn() {}, error() {} };
function load(file, mocks) {
    const exports = {};
    const source = readFileSync(new URL('../game-framework/' + file, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    runInNewContext(code, { exports, require(name) {
        if (name in mocks) return mocks[name];
        throw new Error('Unexpected import: ' + name);
    } });
    return exports;
}

function setup() {
    const nodes = [], views = [], loads = [], destructions = [];
    class Prefab {}
    class Node {
        static EventType = { NODE_DESTROYED: 'destroy', TOUCH_START: 'touch' };
        callbacks = new Map();
        isValid = true;
        once(event, fn) { this.callbacks.set(event, fn); }
        destroy() {
            if (!this.isValid) return;
            this.isValid = false;
            destructions.push(() => this.callbacks.get('destroy')?.());
        }
        removeFromParent() {}
        addChild(node) { node.parent = this; }
        getComponent(name) { return name === 'BaseView' ? this.view : null; }
        addComponent() {}
    }
    let behavior = {};
    class AssetService {}
    const assets = {
        loadAssetAsync() { const task = deferred(); loads.push(task); return task.promise; },
        instantiateAsset() {
            const node = new Node();
            const closed = deferred();
            const config = behavior;
            const view = {
                node, viewName: 'Panel', isDisposed: false, closeCount: 0,
                afterAddChild(options) { this.options = options; },
                shouldAddBlockInputEvents: () => false,
                applyShow: () => config.show?.() ?? Promise.resolve(),
                applyClose() { this.closeCount++; return config.close?.() ?? Promise.resolve('result'); },
                popped: false,
                isPushPopView() { return this.options?.pushPopView ?? false; },
                isPop() { return this.popped; },
                async push() { this.popped = false; },
                async pop() { this.popped = true; },
                getClickBg: () => config.background?.() ?? null,
                canClickClose: () => true,
                dispose() { this.isDisposed = true; node.destroy(); },
                applyViewCloseAfter: result => closed.resolve(result),
                viewCloseAfter: () => closed.promise,
                close() { return ui.closeOrPopViewInstance(this); },
            };
            node.view = view; nodes.push(node); views.push(view); return node;
        },
    };
    class EventDispatcher { dispose() {} }
    const { UIService, UIShowType } = load('services/ui-service.ts', {
        cc: { _decorator: { ccclass: () => type => type }, Prefab, Node, js: { getClassName: type => type.name } },
        'cc/env': { DEBUG: false }, '../core/log': { logger },
        '../core/event-dispatcher': { EventDispatcher },
        '../model-view/open-lock/view-lock': {}, './asset-service': { AssetService },
        '../core/container': { Container: { get: () => assets } },
        '../structures/sorted-set': { SortedSet: class {} }, '../core/misc': { makeDeferred: deferred },
    });
    const ui = new UIService();
    ui.getLayer = () => new Node();
    const options = (name = 'Panel') => ({
        prefab: { bundle: 'test', path: 'panel', isDir: () => false }, viewName: name,
        showType: UIShowType.FullScreenView, layer: 1, pushPopView: false,
    });
    return { ui, UIService, UIShowType, Node, Prefab, loads, nodes, views, options,
        setBehavior: value => { behavior = value; },
        destroy: () => { destructions.splice(0).forEach(fn => fn()); },
    };
}

test('loading is registered synchronously; duplicate opens share an instance', async () => {
    const f = setup(), options = f.options();
    const first = f.ui.openView(options, {});
    const duplicate = f.ui.openView(options, {});
    assert.equal(f.ui.getViewState('Panel'), 'opening');
    assert.equal(f.ui.hasOpenView('Panel'), true);
    assert.equal(f.ui.getOpenView('Panel'), null);
    await turn();
    assert.equal(f.loads.length, 1);
    f.loads[0].resolve(new f.Prefab());
    assert.equal(await first, await duplicate);
    assert.equal(f.views.length, 1);
    assert.equal(f.ui.getViewState('Panel'), 'open');
});

test('open-close-open cancels an unloaded generation without reviving it', async () => {
    const f = setup(), options = f.options();
    const old = f.ui.openView(options, {});
    await turn();
    const waiter = f.ui.closeViewNameAfter('Panel');
    const close = f.ui.closeOrPopViewName('Panel');
    assert.equal(f.ui.getViewState('Panel'), 'closing');
    assert.equal(f.ui.hasOpenView('Panel'), false);
    const next = f.ui.openView(options, {});
    assert.equal(f.ui.getViewState('Panel'), 'opening');
    assert.equal(await close, true);
    await waiter;
    await turn();
    f.loads[1].resolve(new f.Prefab());
    const view = await next;
    f.loads[0].resolve(new f.Prefab());
    assert.equal(await old, null);
    assert.equal(f.views.length, 1);
    assert.equal(f.ui.getOpenView('Panel'), view);
});

test('popped views report hidden, reopen once and do not prevent closing the previous view', async () => {
    const f = setup();
    async function open(name) {
        const options = f.options(name); options.pushPopView = true;
        const task = f.ui.openView(options, {});
        await turn(); f.loads.at(-1).resolve(new f.Prefab());
        return { view: await task, options };
    }
    const a = await open('A'), b = await open('B');
    assert.equal(await f.ui.closeOrPopViewName('A'), false);
    await f.ui.closeOrPopViewName('B');
    assert.equal(f.ui.getViewState('B'), 'hidden');
    assert.equal(f.ui.hasOpenView('B'), false);
    assert.equal(await f.ui.openView(b.options, {}), b.view);
    await f.ui.closeOrPopViewName('B');
    await f.ui.closeOrPopViewName('A');
    assert.equal(f.ui.getViewState('A'), 'closed');
    assert.equal(f.ui.getViewState('B'), 'closed');
    assert.equal(a.view.closeCount, 1);
    assert.equal(b.view.closeCount, 1);
});

test('close during show is deduplicated; old completion and destruction preserve reopened view', async () => {
    const f = setup(), show = deferred(), closing = deferred();
    f.setBehavior({ show: () => show.promise, close: () => closing.promise });
    const old = f.ui.openView(f.options(), {});
    await turn(); f.loads[0].resolve(new f.Prefab()); await turn();
    const close = f.ui.closeOrPopViewName('Panel');
    const duplicate = f.ui.closeOrPopViewName('Panel');
    const next = f.ui.openView(f.options(), {});
    await turn(); assert.equal(f.views[0].closeCount, 1);
    assert.equal(f.loads.length, 1);
    closing.resolve(); await close; await duplicate;
    f.setBehavior({}); await turn(); f.loads[1].resolve(new f.Prefab());
    const current = await next;
    f.destroy(); show.resolve(); assert.equal(await old, null);
    assert.equal(f.ui.getOpenView('Panel'), current);
    assert.equal(await f.ui.closeOrPopViewInstance(f.views[0]), false);
    await f.ui.closeOrPopViewName('Panel');
    assert.equal(f.ui.getViewState('Panel'), 'closed');
});

test('load/show/close errors leave the name reusable and close waiters settled', async () => {
    for (const stage of ['load', 'show', 'close']) {
        const f = setup();
        f.setBehavior({ [stage]: async () => { throw new Error(stage); } });
        const opening = f.ui.openView(f.options(), {});
        const checked = stage === 'close' ? opening : assert.rejects(opening, new RegExp(stage));
        await turn();
        if (stage === 'load') f.loads[0].reject(new Error(stage));
        else f.loads[0].resolve(new f.Prefab());
        await checked;
        if (stage === 'close') {
            const waiter = f.ui.closeViewNameAfter('Panel');
            await assert.rejects(f.ui.closeOrPopViewName('Panel'), /close/);
            await waiter;
        }
        assert.equal(f.ui.getViewState('Panel'), 'closed');
        f.setBehavior({});
        const retry = f.ui.openView(f.options(), {});
        await turn(); f.loads.at(-1).resolve(new f.Prefab());
        assert.ok(await retry);
    }
});

test('unnamed options identify a loading view; background cancellation cleans both nodes', async () => {
    const f = setup(), background = deferred();
    f.setBehavior({ background: () => background.promise });
    const options = f.options(null); options.showType = f.UIShowType.BlackBaseView;
    const opening = f.ui.openView(options, {});
    await turn(); f.loads[0].resolve(new f.Prefab()); await turn();
    assert.equal(f.ui.hasOpenView(options), true);
    await f.ui.closeOrPopViewName(options);
    const bg = new f.Node(); background.resolve(bg);
    await opening;
    assert.equal(bg.isValid, false);
    assert.equal(f.nodes[0].isValid, false);
    assert.equal(f.ui.getViewState(options), 'closed');
});

test('ViewLock cancels beforeTask, recovers failures and honors reference counts', async () => {
    const f = setup();
    const { ViewLock } = load('model-view/open-lock/view-lock.ts', {
        '../../core/container': { Container: { get: () => f.ui } },
        '../../core/log': { logger }, cc: { Node: f.Node },
        '../../services/ui-service': { UIService: f.UIService },
    });
    const lock = new ViewLock({}, f.options());
    const before = deferred(); lock.beforeTask = () => before.promise;
    const stale = lock.openView(); await turn(); await lock.closeView();
    lock.beforeTask = async () => { throw new Error('before'); };
    await assert.rejects(lock.openView(), /before/);
    assert.equal(lock.viewCanOpen, true);
    lock.beforeTask = null;
    const fresh = lock.openView(); await turn(); f.loads[0].resolve(new f.Prefab());
    const view = await fresh;
    before.resolve(); assert.equal(await stale, null); assert.equal(lock.view, view);
    await lock.closeView();
    const counted = new ViewLock({}, f.options(), undefined, { enableRefCount: true });
    const a = counted.openView(), b = counted.openView();
    await turn(); await counted.closeView(); assert.equal(counted.refCount, 1);
    f.loads.at(-1).resolve(new f.Prefab()); assert.equal(await a, await b);
    await counted.closeView(); assert.equal(f.ui.getViewState('Panel'), 'closed');
});

test('BaseView does not resume onShow after close and close failure does not strand its deferred', async () => {
    const frame = deferred();
    const tasks = { waitNextFrame: () => frame.promise };
    let closeFails = true;
    const ui = { closeOrPopViewInstance: async () => {
        if (closeFails) throw new Error('close failed');
        return true;
    } };
    class UIService {}
    class Deferred {
        constructor() { const d = deferred(); this.promise = d.promise; this.fulfilled = d.resolve; }
    }
    const { BaseView } = load('model-view/base-view.ts', {
        cc: {
            Component: class {},
            _decorator: { ccclass: () => type => type, menu: () => type => type, property: () => () => {} },
            js: { getClassName: () => 'Panel' },
        },
        'cc/env': { DEBUG: false },
        '../core/container': { Container: { get: type => type === UIService ? ui : tasks } },
        '../core/decorators': { getEventListeners: () => new Map() },
        '../core/log': { logger }, '../core/misc': { Deferred, isDestroyed: () => false },
        '../core/task': {}, '../services/asset-service': {}, '../services/task-service': {},
        '../services/ui-service': { UIService, UIAnimaOpenMode: { OPEN_SHOW_BEFORE: 1, OPEN_CLOSE_BEFORE: 2, OPEN_ALL: 3 } },
        './base-view-component': {}, './binding-and-fix-special-shaped-screen': {},
    });
    const view = new BaseView();
    view._options = { playAnimation: 0 };
    let shows = 0;
    view.onShow = async () => { shows++; };
    view.onClose = async () => {};
    const opening = view.applyShow();
    await view.applyClose(); frame.resolve(); await opening;
    assert.equal(shows, 0);
    await assert.rejects(view.close(), /close failed/);
    assert.equal(view._closeDeferred, null);
    closeFails = false;
    await view.close();
});
