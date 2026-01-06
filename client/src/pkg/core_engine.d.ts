/* tslint:disable */
/* eslint-disable */

export class CryptoEngine {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  derive_secret(other_public_hex: string): string;
  get_secret_checksum(): string;
  get_public_key_as_hex(): string;
  static new(): CryptoEngine;
  decrypt(ciphertext_b64: string): string;
  encrypt(plaintext: string): string;
}

export class TerminalSystem {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  execute_command(input: string): string;
  static new(): TerminalSystem;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_terminalsystem_free: (a: number, b: number) => void;
  readonly terminalsystem_execute_command: (a: number, b: number, c: number) => [number, number];
  readonly terminalsystem_new: () => number;
  readonly __wbg_cryptoengine_free: (a: number, b: number) => void;
  readonly cryptoengine_decrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly cryptoengine_derive_secret: (a: number, b: number, c: number) => [number, number, number, number];
  readonly cryptoengine_encrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly cryptoengine_get_public_key_as_hex: (a: number) => [number, number];
  readonly cryptoengine_get_secret_checksum: (a: number) => [number, number];
  readonly cryptoengine_new: () => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
