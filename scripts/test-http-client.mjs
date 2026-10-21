import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(
    readFileSync(
        new URL('../game-framework/http-client.ts', import.meta.url),
        'utf8',
    ),
    {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
        },
    },
).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const credential = 'g'.repeat(43);
const response = (overrides = {}) => ({
    userId: 'player',
    realmId: 0,
    worldId: 0,
    loginToken: credential,
    sessionToken: 's'.repeat(43),
    expiresInSeconds: 3600,
    ...overrides,
});

function harness(extra = {}) {
    const requests = [];
    const saved = new Map();
    const clock = { now: Date.now() };
    const storage = {
        getItem: (key) => saved.get(key) ?? null,
        setItem: (key, value) => saved.set(key, value),
        removeItem: (key) => saved.delete(key),
    };
    class XHR {
        headers = {};
        open(method, url, async) {
            Object.assign(this, { method, url, async });
        }
        setRequestHeader(name, value) {
            this.headers[name] = value;
        }
        send(body) {
            this.body = body;
            requests.push(this);
        }
        abort() {
            this.aborted = true;
            this.onabort?.();
        }
        reply(status, body) {
            this.status = status;
            this.responseText = JSON.stringify(body);
            this.readyState = 4;
            this.onreadystatechange?.();
        }
    }
    const exports = {};
    runInNewContext(compiled, {
        exports,
        setTimeout,
        clearTimeout,
        XMLHttpRequest: XHR,
        Date: class extends Date {
            static now() {
                return clock.now;
            }
        },
    });
    const options = { baseUrl: 'https://game.example', storage, ...extra };
    const client = new exports.HttpGameClient(options);
    return { ...exports, client, requests, saved, storage, clock, options };
}

async function loggedIn(h, overrides = {}) {
    const pending = h.client.loginGuest();
    h.requests.at(-1).reply(200, response(overrides));
    return pending;
}

test('first requests coalesce login, include trusted session header and persist only the credential', async () => {
    const h = harness({ realmId: 7, headers: { 'x-client-version': '1' } });
    const pending = Array.from({ length: 5 }, () =>
        h.client.get('/player/profile', {
            q: '中文 & +',
            enabled: false,
            ids: [1, 2],
            skip: null,
        }),
    );
    assert.equal(h.requests.length, 1);
    assert.deepEqual(JSON.parse(h.requests[0].body), {
        loginToken: '',
        realmId: 7,
    });
    assert.equal(h.requests[0].url, 'https://game.example/api/auth/guest');
    assert.equal(h.requests[0].headers.authorization, undefined);
    h.requests[0].reply(200, response({ realmId: 7, worldId: 9 }));
    await tick();
    assert.equal(h.requests.length, 6);
    for (const xhr of h.requests.slice(1)) {
        assert.equal(xhr.headers.authorization, 'Bearer ' + 's'.repeat(43));
        assert.equal(xhr.headers['x-client-version'], '1');
        assert.match(
            xhr.url,
            /q=%E4%B8%AD%E6%96%87%20%26%20%2B&enabled=false&ids=1&ids=2$/,
        );
        assert.equal(xhr.body, null);
        xhr.reply(200, { ok: true });
    }
    await Promise.all(pending);
    assert.equal(h.saved.size, 1);
    assert.equal([...h.saved.values()][0], credential);
    assert.equal(h.client.session.worldId, 9);
    assert.equal('sessionToken' in h.client.session, false);
    assert.equal('loginToken' in h.client.session, false);
    h.client.dispose();
});

test('credentials are isolated by namespace, origin and original realm and restored after disposal', async () => {
    const h = harness();
    await loggedIn(h);
    h.client.dispose();
    const restored = new h.HttpGameClient(h.options);
    const login = restored.loginGuest();
    assert.equal(JSON.parse(h.requests.at(-1).body).loginToken, credential);
    h.requests.at(-1).reply(200, response());
    await login;
    restored.dispose();
    for (const change of [
        { realmId: 1 },
        { baseUrl: 'https://other.example' },
        { storageNamespace: 'other' },
    ]) {
        const other = new h.HttpGameClient({ ...h.options, ...change });
        const loggingIn = other.loginGuest();
        assert.equal(JSON.parse(h.requests.at(-1).body).loginToken, '');
        h.requests
            .at(-1)
            .reply(200, response({ realmId: change.realmId ?? 0 }));
        await loggingIn;
        other.dispose();
    }
    assert.equal(h.saved.size, 4);
});

test('late concurrent 401 responses do not invalidate a newer session and GET replays only once', async () => {
    const h = harness();
    await loggedIn(h);
    const a = h.client.get('/a');
    const b = h.client.get('/b');
    await tick();
    h.requests[1].reply(401, { error: 'Unauthorized' });
    await tick();
    assert.equal(JSON.parse(h.requests[3].body).loginToken, credential);
    h.requests[3].reply(200, response({ sessionToken: 'n'.repeat(43) }));
    await tick();
    h.requests[2].reply(401, { error: 'Unauthorized' });
    await tick();
    assert.equal(
        h.requests.filter((xhr) => xhr.url.endsWith('/auth/guest')).length,
        2,
    );
    assert.equal(
        h.requests[4].headers.authorization,
        'Bearer ' + 'n'.repeat(43),
    );
    assert.equal(
        h.requests[5].headers.authorization,
        'Bearer ' + 'n'.repeat(43),
    );
    h.requests[4].reply(200, {});
    const rejected = assert.rejects(b, (error) => error.status === 401);
    h.requests[5].reply(401, { error: 'Unauthorized' });
    await a;
    await rejected;
    assert.equal(h.requests.length, 6);
    h.client.dispose();
});

test('expired session renews once before concurrent writes, and body is captured before waiting', async () => {
    const h = harness();
    await loggedIn(h, { expiresInSeconds: 10 });
    h.clock.now += 10001;
    const body = { operationId: 'keep-id', value: 1 };
    const a = h.client.post('/save', body);
    const b = h.client.post('/save', { operationId: 'other-id' });
    body.value = 99;
    assert.equal(h.requests.length, 2);
    h.requests[1].reply(200, response());
    await tick();
    assert.equal(JSON.parse(h.requests[2].body).value, 1);
    assert.equal(h.requests[2].headers['content-type'], 'application/json');
    h.requests[2].reply(200, null);
    h.requests[3].reply(204, undefined);
    await Promise.all([a, b]);
    h.client.dispose();
});

test('writes are never replayed on 401, timeout, network failure or 500; 403 does not log in again', async () => {
    for (const status of [401, 403, 500]) {
        const h = harness();
        await loggedIn(h);
        const pending = h.client.post('/reward', { operationId: 'same-id' });
        const rejected = assert.rejects(
            pending,
            (error) => error.status === status,
        );
        await tick();
        h.requests[1].reply(status, { error: 'Failed', code: 123 });
        await rejected;
        assert.equal(h.requests.length, 2);
        if (status === 401) assert.equal(h.client.session, null);
        h.client.dispose();
    }
    const h = harness();
    await loggedIn(h);
    const network = h.client.post('/reward', {});
    const failed = assert.rejects(network, (error) => error.kind === 'network');
    await tick();
    h.requests[1].onerror();
    await failed;
    await assert.rejects(
        h.client.request('/reward', { method: 'POST', timeoutMs: 5 }),
        (error) => error.kind === 'timeout',
    );
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests[2].aborted, true);
    h.client.dispose();
});

test('public requests skip login and logout cancels in-flight work without saving late credentials', async () => {
    const h = harness();
    const publicRequest = h.client.request('/version', { auth: false });
    assert.equal(h.requests[0].headers.authorization, undefined);
    h.requests[0].reply(200, { version: '1' });
    await publicRequest;
    assert.equal(h.saved.size, 0);
    const login = h.client.loginGuest();
    const rejected = assert.rejects(
        login,
        (error) => error.kind === 'cancelled',
    );
    h.client.logout();
    h.requests[1].reply(200, response());
    await rejected;
    assert.equal(h.saved.size, 0);
    await loggedIn(h);
    const pending = h.client.get('/slow');
    const closed = assert.rejects(
        pending,
        (error) => error.kind === 'cancelled',
    );
    await tick();
    h.client.dispose();
    await closed;
    assert.equal(h.requests.at(-1).aborted, true);
    assert.equal(h.requests.at(-1).onreadystatechange, null);
    await assert.rejects(
        h.client.get('/never'),
        (error) => error.kind === 'cancelled',
    );
});

test('invalid credentials and invalid login responses are retained, never silently replaced with a guest', async () => {
    for (const override of [
        { realmId: 9 },
        { sessionToken: '' },
        { worldId: -1 },
        { expiresInSeconds: 0 },
    ]) {
        const h = harness();
        await loggedIn(h);
        h.client.logout();
        const pending = h.client.loginGuest();
        const rejected = assert.rejects(
            pending,
            (error) => error.kind === 'invalid-response',
        );
        h.requests[1].reply(200, response(override));
        await rejected;
        assert.equal([...h.saved.values()][0], credential);
        h.client.dispose();
    }
    const h = harness();
    await loggedIn(h);
    h.client.dispose();
    const key = [...h.saved.keys()][0];
    h.saved.set(key, 'broken');
    const restored = new h.HttpGameClient(h.options);
    await assert.rejects(
        restored.loginGuest(),
        (error) => error.kind === 'storage',
    );
    assert.equal(h.requests.length, 1);
    assert.equal(h.saved.get(key), 'broken');
    restored.logout({ forgetCredential: true });
    assert.equal(h.saved.size, 0);
    restored.dispose();
});

test('logout invalidates responses already delivered by XHR but not yet consumed by awaiting callers', async () => {
    const h = harness();
    await loggedIn(h);
    const read = h.client.get('/profile');
    const rejected = assert.rejects(
        read,
        (error) => error.kind === 'cancelled',
    );
    await tick();
    h.requests[1].reply(200, { value: 'old-account' });
    h.client.logout();
    await rejected;
    await loggedIn(h);
    const cachedLogin = h.client.loginGuest();
    const cancelled = assert.rejects(
        cachedLogin,
        (error) => error.kind === 'cancelled',
    );
    h.client.logout();
    await cancelled;
    h.client.dispose();
});

test('storage failures do not silently create a different account on retry', async () => {
    const h = harness();
    h.storage.setItem = () => {
        throw new Error('unavailable');
    };
    const first = h.client.loginGuest();
    h.requests[0].reply(200, response());
    await assert.rejects(first, (error) => error.kind === 'storage');
    h.storage.setItem = (key, value) => h.saved.set(key, value);
    const second = h.client.loginGuest();
    assert.equal(JSON.parse(h.requests[1].body).loginToken, credential);
    h.requests[1].reply(200, response());
    await second;
    h.client.dispose();
});

test('rejects unsafe destinations and caller auth overrides before sending any request', async () => {
    const h = harness();
    for (const path of [
        'https://other.example',
        '//other.example',
        '/../profile',
        '/%2e%2e/profile',
        '/x?token=1',
        '/auth/guest',
    ]) {
        await assert.rejects(
            h.client.get(path),
            (error) => error.kind === 'configuration',
        );
    }
    await assert.rejects(
        h.client.request('/x', { headers: { Authorization: 'forged' } }),
        (error) => error.kind === 'configuration',
    );
    await assert.rejects(
        h.client.request('/x', { query: { q: {} } }),
        (error) => error.kind === 'configuration',
    );
    await assert.rejects(
        h.client.request('/x', { body: {} }),
        (error) => error.kind === 'configuration',
    );
    for (const baseUrl of [
        'ws://host',
        'https://name:secret@host',
        'https://host/api',
        'https://host?x=1',
    ]) {
        assert.throws(
            () => new h.HttpGameClient({ ...h.options, baseUrl }),
            (error) => error.kind === 'configuration',
        );
    }
    assert.equal(h.requests.length, 0);
    h.client.dispose();
});

test('JSON parse errors, non-JSON proxy failures and response callbacks settle once', async () => {
    const h = harness();
    for (const status of [200, 502]) {
        const pending = h.client.request('/version', { auth: false });
        const rejected = assert.rejects(
            pending,
            (error) =>
                error.status === status &&
                error.kind === (status === 200 ? 'invalid-response' : 'http'),
        );
        const xhr = h.requests.at(-1);
        xhr.status = status;
        xhr.readyState = 4;
        xhr.responseText = '<html>proxy</html>';
        xhr.onreadystatechange();
        await rejected;
        assert.equal(xhr.onreadystatechange, null);
    }
    h.client.dispose();
});
