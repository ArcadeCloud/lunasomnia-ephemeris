/**
 * WebAssembly Memory Heap Manager.
 *
 * Provides typed access to the WASM linear memory, handling
 * allocation, deallocation, and data marshaling between JavaScript
 * and WebAssembly.
 */
export class WasmHeap {
    constructor(memory, exports) {
        Object.defineProperty(this, "memory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: memory
        });
        Object.defineProperty(this, "exports", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: exports
        });
    }
    alloc(size) {
        return this.exports.malloc(size);
    }
    free(ptr) {
        this.exports.free(ptr);
    }
    getU8(ptr, length) {
        return new Uint8Array(this.memory.buffer, ptr, length);
    }
    setU8(ptr, data) {
        new Uint8Array(this.memory.buffer, ptr, data.length).set(data);
    }
    getF64(ptr, length) {
        return new Float64Array(this.memory.buffer, ptr, length);
    }
    getString(ptr) {
        const buffer = new Uint8Array(this.memory.buffer);
        let end = ptr;
        while (buffer[end] !== 0)
            end++;
        return new TextDecoder().decode(buffer.subarray(ptr, end));
    }
    getI32(ptr) {
        return new DataView(this.memory.buffer).getInt32(ptr, true);
    }
    putString(str) {
        const bytes = new TextEncoder().encode(str + "\0");
        const ptr = this.alloc(bytes.length);
        this.setU8(ptr, bytes);
        return ptr;
    }
}
