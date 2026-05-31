/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

export class Mutex {
  static Guard = class Guard {
    #mutex: Mutex;
    constructor(mutex: Mutex) {
      this.#mutex = mutex;
    }
    dispose(): void {
      return this.#mutex.release();
    }
  };

  #locked = false;
  #acquirers: Array<() => void> = [];

  // This is FIFO.
  async acquire(timeoutMs = 30_000): Promise<InstanceType<typeof Mutex.Guard>> {
    if (!this.#locked) {
      this.#locked = true;
      return new Mutex.Guard(this);
    }
    const {resolve, reject, promise} = Promise.withResolvers<void>();
    this.#acquirers.push(resolve);
    const timer = setTimeout(() => {
      const idx = this.#acquirers.indexOf(resolve);
      if (idx !== -1) {
        this.#acquirers.splice(idx, 1);
      }
      reject(new Error('Mutex acquire timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);
    try {
      await promise;
    } finally {
      clearTimeout(timer);
    }
    return new Mutex.Guard(this);
  }

  release(): void {
    const resolve = this.#acquirers.shift();
    if (!resolve) {
      this.#locked = false;
      return;
    }
    resolve();
  }
}
