/*
 * Preneto iz @fusionstrings/swisseph-wasi 0.1.0 (AGPL-3.0), Copyright autora paketa.
 * Ovaj repozitorijum je takodje AGPL-3.0, pa je prenosenje dozvoljeno; vidi NOTICE.
 *
 * Zasto preneto umesto uvezeno:
 *  - paket kroz svoj Deno-shim sloj vuce `undici`, `which` i `path`, kojih u Workers-u
 *    nema; ukljucivanje `nodejs_compat` bi ih ubacilo u paket bez ikakve koristi,
 *  - u verziji 0.1.0 `load()` trazi WASM na putanji na kojoj ga nema (greska u pakovanju).
 *
 * Izmene su NAJMANJE moguce i sve su ovde popisane:
 *  1. uklonjen uvoz Deno-shim-a,
 *  2. pisanje na stdout/stderr ide kroz console (Deno grana obrisana).
 */
/**
 * Minimal WASI (WebAssembly System Interface) implementation.
 *
 * Provides necessary system calls (filesystem, clock, random) to allow
 * the C-compiled Swiss Ephemeris library to run in non-WASI environments
 * like the browser.
 */
export class WASI {
    constructor() {
        /** WebAssembly imports object containing WASI syscall implementations. */
        Object.defineProperty(this, "imports", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** WebAssembly memory instance, set via setMemory. */
        Object.defineProperty(this, "memory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // Virtual File System
        /** Map of virtual file paths to their content. */
        Object.defineProperty(this, "virtualFiles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        /** Map of open file descriptors to file handles. */
        Object.defineProperty(this, "openFiles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        /** Next available file descriptor. */
        Object.defineProperty(this, "nextFd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 10
        });
        const ENOSYS = 70;
        const ENOENT = 44;
        const EBADF = 8;
        const ES_SUCCESS = 0;
        this.imports = {
            wasi_snapshot_preview1: {
                proc_exit: (rval) => {
                    if (rval !== 0) {
                        throw new Error(`proc_exit: ${rval}`);
                    }
                },
                fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
                    if (!this.memory)
                        return 0;
                    const view = new DataView(this.memory.buffer);
                    let total = 0;
                    for (let i = 0; i < iovs_len; i++) {
                        const ptr = iovs_ptr + i * 8;
                        const buf_ptr = view.getUint32(ptr, true);
                        const buf_len = view.getUint32(ptr + 4, true);
                        if (fd === 1 || fd === 2) {
                            const buf = new Uint8Array(this.memory.buffer, buf_ptr, buf_len);
                            // Deno grana uklonjena; u Workers-u postoji samo console.
                            const text = new TextDecoder().decode(buf);
                            if (fd === 1)
                                console.log(text);
                            else
                                console.error(text);
                        }
                        total += buf_len;
                    }
                    view.setUint32(nwritten_ptr, total, true);
                    return ES_SUCCESS;
                },
                path_open: (_dirfd, _dirflags, path_ptr, path_len, _oflags, _fs_rights_base, _fs_rights_inheriting, _fd_flags, fd_out_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const pathBuf = new Uint8Array(this.memory.buffer, path_ptr, path_len);
                    let path = new TextDecoder().decode(pathBuf);
                    path = path.replace(/^\.\//, "");
                    let content = this.virtualFiles.get(path);
                    if (!content) {
                        const parts = path.split("/");
                        const filename = parts[parts.length - 1];
                        content = this.virtualFiles.get(filename);
                    }
                    if (content) {
                        const fd = this.nextFd++;
                        this.openFiles.set(fd, { pos: 0, content: content, path: path });
                        const view = new DataView(this.memory.buffer);
                        view.setUint32(fd_out_ptr, fd, true);
                        return ES_SUCCESS;
                    }
                    return ENOENT;
                },
                path_filestat_get: (_dirfd, _flags, path_ptr, path_len, stat_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const pathBuf = new Uint8Array(this.memory.buffer, path_ptr, path_len);
                    let path = new TextDecoder().decode(pathBuf);
                    path = path.replace(/^\.\//, "");
                    let content = this.virtualFiles.get(path);
                    if (!content) {
                        const parts = path.split("/");
                        const filename = parts[parts.length - 1];
                        content = this.virtualFiles.get(filename);
                    }
                    if (content) {
                        const view = new DataView(this.memory.buffer);
                        view.setBigUint64(stat_ptr, 0n, true);
                        view.setBigUint64(stat_ptr + 8, 0n, true);
                        view.setUint8(stat_ptr + 16, 4); // regular file
                        view.setBigUint64(stat_ptr + 24, 1n, true);
                        view.setBigUint64(stat_ptr + 32, BigInt(content.byteLength), true);
                        return ES_SUCCESS;
                    }
                    return ENOENT;
                },
                fd_close: (fd) => {
                    if (this.openFiles.has(fd)) {
                        this.openFiles.delete(fd);
                        return ES_SUCCESS;
                    }
                    return EBADF;
                },
                fd_read: (fd, iovs_ptr, iovs_len, nread_ptr) => {
                    const file = this.openFiles.get(fd);
                    if (!file)
                        return EBADF;
                    if (!this.memory)
                        return ENOSYS;
                    const view = new DataView(this.memory.buffer);
                    let totalRead = 0;
                    for (let i = 0; i < iovs_len; i++) {
                        const ptr = iovs_ptr + i * 8;
                        const buf_ptr = view.getUint32(ptr, true);
                        const buf_len = view.getUint32(ptr + 4, true);
                        const remaining = file.content.byteLength - file.pos;
                        const toRead = Math.min(buf_len, remaining);
                        if (toRead > 0) {
                            const src = file.content.subarray(file.pos, file.pos + toRead);
                            const dst = new Uint8Array(this.memory.buffer, buf_ptr, toRead);
                            dst.set(src);
                            file.pos += toRead;
                            totalRead += toRead;
                        }
                    }
                    view.setUint32(nread_ptr, totalRead, true);
                    return ES_SUCCESS;
                },
                fd_seek: (fd, offset, whence, new_offset_ptr) => {
                    const file = this.openFiles.get(fd);
                    if (!file)
                        return EBADF;
                    const off = Number(offset);
                    if (whence === 0)
                        file.pos = off;
                    else if (whence === 1)
                        file.pos += off;
                    else if (whence === 2)
                        file.pos = file.content.byteLength + off;
                    if (file.pos < 0)
                        file.pos = 0;
                    if (file.pos > file.content.byteLength) {
                        file.pos = file.content.byteLength;
                    }
                    if (this.memory) {
                        const view = new DataView(this.memory.buffer);
                        view.setBigUint64(new_offset_ptr, BigInt(file.pos), true);
                    }
                    return ES_SUCCESS;
                },
                fd_fdstat_get: (fd, stat_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const view = new DataView(this.memory.buffer);
                    if (fd === 1 || fd === 2) {
                        view.setUint8(stat_ptr, 2);
                        view.setUint16(stat_ptr + 2, 0, true);
                        view.setBigUint64(stat_ptr + 8, 64n, true);
                        view.setBigUint64(stat_ptr + 16, 64n, true);
                        return ES_SUCCESS;
                    }
                    if (fd === 3) {
                        view.setUint8(stat_ptr, 3);
                        view.setUint16(stat_ptr + 2, 0, true);
                        view.setBigUint64(stat_ptr + 8, 0xffffffffn, true);
                        view.setBigUint64(stat_ptr + 16, 0xffffffffn, true);
                        return ES_SUCCESS;
                    }
                    if (this.openFiles.has(fd)) {
                        view.setUint8(stat_ptr, 4);
                        view.setUint16(stat_ptr + 2, 0, true);
                        view.setBigUint64(stat_ptr + 8, 0xffffffffn, true);
                        view.setBigUint64(stat_ptr + 16, 0xffffffffn, true);
                        return ES_SUCCESS;
                    }
                    return EBADF;
                },
                clock_time_get: () => ES_SUCCESS,
                clock_res_get: () => ES_SUCCESS,
                sched_yield: () => ES_SUCCESS,
                random_get: () => ES_SUCCESS,
                args_sizes_get: (argc_ptr, argv_len_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const view = new DataView(this.memory.buffer);
                    view.setUint32(argc_ptr, 0, true);
                    view.setUint32(argv_len_ptr, 0, true);
                    return ES_SUCCESS;
                },
                args_get: () => ES_SUCCESS,
                environ_sizes_get: (envc_ptr, env_len_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const view = new DataView(this.memory.buffer);
                    view.setUint32(envc_ptr, 1, true);
                    view.setUint32(env_len_ptr, 8, true);
                    return ES_SUCCESS;
                },
                environ_get: (env_ptr, env_buf_ptr) => {
                    if (!this.memory)
                        return ENOSYS;
                    const view = new DataView(this.memory.buffer);
                    const env = "PATH=.\0";
                    const bytes = new TextEncoder().encode(env);
                    new Uint8Array(this.memory.buffer, env_buf_ptr, bytes.length).set(bytes);
                    view.setUint32(env_ptr, env_buf_ptr, true);
                    return ES_SUCCESS;
                },
                fd_prestat_get: (fd, prestat_ptr) => {
                    if (fd === 3) {
                        if (!this.memory)
                            return ENOSYS;
                        const view = new DataView(this.memory.buffer);
                        view.setUint8(prestat_ptr, 0);
                        view.setUint32(prestat_ptr + 4, 1, true);
                        return ES_SUCCESS;
                    }
                    return EBADF;
                },
                fd_prestat_dir_name: (fd, path_ptr, path_len) => {
                    if (fd === 3) {
                        if (!this.memory)
                            return ENOSYS;
                        const bytes = new TextEncoder().encode(".");
                        new Uint8Array(this.memory.buffer, path_ptr, Math.min(path_len, bytes.length)).set(bytes);
                        return ES_SUCCESS;
                    }
                    return EBADF;
                },
                fd_advise: () => ENOSYS,
                fd_allocate: () => ENOSYS,
                fd_datasync: () => ENOSYS,
                fd_fdstat_set_flags: () => ENOSYS,
                fd_fdstat_set_rights: () => ENOSYS,
                fd_filestat_get: () => ENOSYS,
                fd_filestat_set_size: () => ENOSYS,
                fd_filestat_set_times: () => ENOSYS,
                fd_pread: () => ENOSYS,
                fd_pwrite: () => ENOSYS,
                fd_readdir: () => ENOSYS,
                fd_renumber: () => ENOSYS,
                fd_sync: () => ENOSYS,
                fd_tell: () => ENOSYS,
                path_create_directory: () => ENOSYS,
                path_filestat_set_times: () => ENOSYS,
                path_link: () => ENOSYS,
                path_readlink: () => ENOSYS,
                path_remove_directory: () => ENOSYS,
                path_rename: () => ENOSYS,
                path_symlink: () => ENOSYS,
                path_unlink_file: () => ENOSYS,
                poll_oneoff: () => ENOSYS,
                sock_accept: () => ENOSYS,
                sock_recv: () => ENOSYS,
                sock_send: () => ENOSYS,
                sock_shutdown: () => ENOSYS,
            },
        };
    }
    /**
     * Mounts a virtual file.
     * @param path The path to mount the file at (e.g. "ephe/seas_18.se1").
     * @param content The content of the file as a Uint8Array.
     */
    mount(path, content) {
        this.virtualFiles.set(path, content);
    }
    /**
     * Sets the WebAssembly memory instance.
     * This is required for syscalls to access WASM memory.
     * @param memory The WebAssembly.Memory instance.
     */
    setMemory(memory) {
        this.memory = memory;
    }
}
