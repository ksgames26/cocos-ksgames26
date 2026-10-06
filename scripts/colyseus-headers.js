// Cocos Native / mini-game runtimes may expose XHR without the Fetch Headers API.
// This covers the Headers surface used by the SDK's JSON matchmaking requests.
if (typeof globalThis.Headers === 'undefined') {
    globalThis.Headers = class Headers {
        constructor(init) {
            this.valuesByName = new Map();

            if (!init) {
                return;
            }

            if (typeof init[Symbol.iterator] === 'function') {
                for (const [name, value] of init) {
                    this.append(name, value);
                }
            } else {
                for (const name of Object.keys(init)) {
                    this.append(name, init[name]);
                }
            }
        }

        append(name, value) {
            const key = String(name).toLowerCase();
            const previous = this.get(key);
            this.set(key, previous === null ? value : `${previous}, ${value}`);
        }

        set(name, value) {
            this.valuesByName.set(String(name).toLowerCase(), String(value).trim());
        }

        get(name) {
            return this.valuesByName.get(String(name).toLowerCase()) ?? null;
        }

        has(name) {
            return this.valuesByName.has(String(name).toLowerCase());
        }

        delete(name) {
            this.valuesByName.delete(String(name).toLowerCase());
        }

        forEach(callback, thisArg) {
            this.valuesByName.forEach((value, name) => callback.call(thisArg, value, name, this));
        }

        entries() {
            return this.valuesByName.entries();
        }
        keys() {
            return this.valuesByName.keys();
        }
        values() {
            return this.valuesByName.values();
        }
        [Symbol.iterator]() {
            return this.entries();
        }
    };
}
