'use client';

import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Encryption keys: symmetric keys a WASI module seals data with and never sees.
 *
 * Sourced from the out-layer/outlayer repo: `wasi-examples/CONNECTOR_MANIFEST.md`
 * (section `encryption_keys`), `worker/wit/deps/encryption-keys.wit`,
 * `worker/wit/deps/storage.wit`, `keystore-worker/src/encryption_keys.rs` and
 * `wasi-examples/signing-key-probe/`. Where this page and those files disagree,
 * those files are the original. The sealed-notes module builds for wasm32-wasip2
 * against those two WIT files with wit-bindgen 0.36.
 */

const REPO = 'https://github.com/out-layer/outlayer';
const PROBE_TREE = `${REPO}/tree/main/wasi-examples/signing-key-probe`;
const PROBE_ENCRYPTION = `${REPO}/blob/main/wasi-examples/signing-key-probe/src/encryption.rs`;
const PROBE_README = `${REPO}/blob/main/wasi-examples/signing-key-probe/README.md`;
const MANIFEST_DOC = `${REPO}/blob/main/wasi-examples/CONNECTOR_MANIFEST.md`;
const WIT_FILE = `${REPO}/blob/main/worker/wit/deps/encryption-keys.wit`;
const STORAGE_WIT = `${REPO}/blob/main/worker/wit/deps/storage.wit`;

const MANIFEST_EXAMPLE = `"encryption_keys": [
  {"path": "records"},
  {"path": "inbox", "caller": "predecessor"},
  {"path": "vault-data", "vault": "vault.alice.near"}
]`;

const DERIVATION = `bind "project": HMAC-SHA256(master, "encryption-key:v1:project:{project_uuid}:{caller}:{account_id}:{path}")
bind "wasm":    HMAC-SHA256(master, "encryption-key:v1:wasm:{wasm_sha256}:{caller}:{account_id}:{path}")

{caller} is "signer" or "predecessor"; {account_id} is that account of the run.`;

const WIT = `package outlayer:encryption-keys@0.1.0;

interface api {
    /// Seal plaintext under the declared key at path, bound to aad.
    /// 0x01 || nonce (24 bytes) || ciphertext || tag (16 bytes); at most 262144 bytes of plaintext and of aad.
    encrypt: func(path: string, vault: option<string>, plaintext: list<u8>, aad: list<u8>) -> result<list<u8>, string>;

    /// Open what encrypt sealed under the same path, vault and aad.
    /// Every failure to open is err("decryption failed").
    decrypt: func(path: string, vault: option<string>, ciphertext: list<u8>, aad: list<u8>) -> result<list<u8>, string>;

    /// HMAC-SHA256 of data (32 bytes) under a subkey of the declared key; deterministic.
    mac: func(path: string, vault: option<string>, data: list<u8>) -> result<list<u8>, string>;
}

world encryption-keys-host {
    import api;
}`;

const FORMAT = `0x01 ‖ nonce (24 bytes) ‖ ciphertext (as long as the plaintext) ‖ tag (16 bytes)`;

const MANIFEST_JSON = `{
  "encryption_keys": [
    {"path": "notes"}
  ]
}`;

const CARGO_TOML = `[package]
name = "sealed-notes"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "sealed-notes"
path = "src/main.rs"

[dependencies]
wit-bindgen = "0.36"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
hex = "0.4"

[profile.release]
opt-level = "z"
lto = true
strip = true`;

const WORLD_WIT = `package my:sealed-notes;

world guest {
    import outlayer:encryption-keys/api@0.1.0;
    import near:storage/api@0.1.0;
}`;

const MAIN_RS = `use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read, Write};

// Bindings for \`outlayer:encryption-keys\` and \`near:storage\`, generated from
// wit/world.wit and the two interfaces in wit/deps/.
mod host {
    wit_bindgen::generate!({
        world: "guest",
        path: "wit",
        generate_all, // the interfaces live in packages under wit/deps/
    });
}
use host::near::storage::api as storage;
use host::outlayer::encryption_keys::api as encryption_keys;

// The manifest, in the \`outlayer.manifest\` custom section: covered by the wasm's sha256.
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] =
    *include_bytes!("../manifest.json");

/// The declared encryption key. Declared without a vault, so every call passes \`None\`.
const KEY: &str = "notes";

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
enum Input {
    Put { name: String, text: String },
    Append { name: String, text: String },
    Get { name: String },
}

/// A storage function answers its error as a string, empty on success.
fn ok(error: String) -> Result<(), String> {
    if error.is_empty() { Ok(()) } else { Err(error) }
}

/// Where a note is stored: \`n/\` + hex of the MAC of its name. The storage
/// operator sees this key, never the name.
fn storage_key(name: &str) -> Result<String, String> {
    let tag = encryption_keys::mac(KEY, None, name.as_bytes())?;
    Ok(format!("n/{}", hex::encode(tag)))
}

/// Seal a note bound to its name: a ciphertext copied onto another note's key
/// fails to open instead of being read as that note.
fn seal(name: &str, text: &str) -> Result<Vec<u8>, String> {
    encryption_keys::encrypt(KEY, None, text.as_bytes(), name.as_bytes())
}

fn open(name: &str, sealed: &[u8]) -> Result<String, String> {
    let plain = encryption_keys::decrypt(KEY, None, sealed, name.as_bytes())?;
    String::from_utf8(plain).map_err(|_| "the note is not UTF-8".to_string())
}

/// The stored ciphertext, or \`None\`. A ciphertext is never empty, so an empty
/// value is no record.
fn load(key: &str) -> Result<Option<Vec<u8>>, String> {
    let (sealed, error) = storage::get_raw(key);
    ok(error)?;
    Ok((!sealed.is_empty()).then_some(sealed))
}

fn put(name: &str, text: &str) -> Result<(), String> {
    ok(storage::set_raw(&storage_key(name)?, &seal(name, text)?))
}

/// Read-modify-write under compare-and-swap. The swap compares the stored
/// ciphertext bytes: another run's write between our read and our swap
/// changes them, and this attempt starts over.
fn append(name: &str, text: &str) -> Result<(), String> {
    let key = storage_key(name)?;
    for _ in 0..5 {
        match load(&key)? {
            None => {
                let (inserted, error) = storage::set_if_absent_raw(&key, &seal(name, text)?);
                ok(error)?;
                if inserted {
                    return Ok(());
                }
            }
            Some(current) => {
                let updated = open(name, &current)? + text;
                let (swapped, _stored_now, error) =
                    storage::set_if_equals_raw(&key, &current, &seal(name, &updated)?);
                ok(error)?;
                if swapped {
                    return Ok(());
                }
            }
        }
    }
    Err("the note kept changing; try again".to_string())
}

/// A note is handed back only over HTTPS, to the payment key's owner. On chain
/// the output is public, and any contract the signer transacts with can start
/// a run under the signer's key.
fn get(name: &str) -> Result<Value, String> {
    if std::env::var("OUTLAYER_EXECUTION_TYPE").as_deref() != Ok("HTTPS") {
        return Err("notes are read over HTTPS only".to_string());
    }
    let text = match load(&storage_key(name)?)? {
        Some(sealed) => Some(open(name, &sealed)?),
        None => None,
    };
    Ok(json!({ "name": name, "text": text }))
}

fn run() -> Result<Value, String> {
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw).map_err(|e| e.to_string())?;
    match serde_json::from_str::<Input>(&raw).map_err(|e| e.to_string())? {
        Input::Put { name, text } => put(&name, &text).map(|()| json!({ "stored": name })),
        Input::Append { name, text } => append(&name, &text).map(|()| json!({ "stored": name })),
        Input::Get { name } => get(&name),
    }
}

fn main() {
    let answer = run().unwrap_or_else(|error| json!({ "error": error }));
    print!("{answer}");
    io::stdout().flush().expect("stdout");
}`;

const BUILD_CHECK = `cargo build --target wasm32-wasip2 --release
W=target/wasm32-wasip2/release/sealed-notes.wasm
wasm-tools component wit $W | grep -E 'import (outlayer:encryption-keys|near:storage)/api'   # both imports
wasm-tools print $W | grep -c 'outlayer.manifest'                                           # must be at least 1`;

const CALL = `outlayer upload target/wasm32-wasip2/release/sealed-notes.wasm   # prints the FastFS URL
outlayer deploy sealed-notes <fastfs_url>

curl -s -X POST "https://api.outlayer.ai/call/alice.near/sealed-notes" \\
  -H "Content-Type: application/json" -H "X-Payment-Key: $PAYMENT_KEY" \\
  -d '{"input": {"operation": "put", "name": "todo", "text": "buy milk"}}'
# "output": {"stored":"todo"}

curl -s -X POST "https://api.outlayer.ai/call/alice.near/sealed-notes" \\
  -H "Content-Type: application/json" -H "X-Payment-Key: $PAYMENT_KEY" \\
  -d '{"input": {"operation": "get", "name": "todo"}}'
# "output": {"name":"todo","text":"buy milk"}`;

function C({ children }: { children: React.ReactNode }) {
  return <code className="bg-card-muted px-1 rounded">{children}</code>;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mt-3 mb-4">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left align-top">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {rows.map((row, r) => (
            <tr key={r} className={r < rows.length - 1 ? 'border-b border-border' : undefined}>
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EncryptionKeysDocsPage() {
  useHashNavigation();

  return (
    <div className="prose max-w-none">
      <h2 className="text-3xl font-bold mb-6 text-accent-text">Encryption Keys</h2>

      <p className="text-foreground mb-6">
        Symmetric keys a WASI module seals data with, through the <C>outlayer:encryption-keys</C> host
        interface. Any project can declare them. They are derived and issued exactly like{' '}
        <Link href="/docs/signing-keys" className="text-accent-text underline">
          signing keys
        </Link>
        ; with the raw functions of{' '}
        <Link href="/docs/storage#raw-storage" className="text-accent-text underline">
          storage
        </Link>{' '}
        they make records that only the module can open.
      </p>

      <div className="space-y-8">
        <section id="overview">
          <AnchorHeading id="overview">What an encryption key is</AnchorHeading>
          <p className="text-foreground">
            <strong>A 256-bit key the module encrypts with that no one ever sees.</strong> The keystore derives
            it inside the TEE from its master, for this project (or this exact build) and this caller. The
            module names the key by <C>path</C>; the host encrypts, decrypts or authenticates and hands back
            the result, never the key.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The key is derived from what the run <em>is</em> — how its code is run, and its caller — never
              from anything the module says at runtime.
            </li>
            <li>
              It is derived in the same request that decrypts the run&apos;s secrets and any signing keys,
              and handed to the worker for that one run. It lives in that run&apos;s memory only — never in
              the environment, stdin or a log — and is dropped with it.
            </li>
            <li>
              Only a <C>wasm32-wasip2</C> component can use it. See{' '}
              <Link href="/docs/wasi#wasi-preview" className="text-accent-text underline">
                WASI Preview 1 vs Preview 2
              </Link>
              .
            </li>
            <li>Symmetric 256-bit keys are considered adequate against quantum attacks.</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4 mb-2">What it is for</h3>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              Keep records in storage that the storage&apos;s operator cannot read — see{' '}
              <a href="#sealed-storage" className="text-accent-text underline">Sealed storage</a>.
            </li>
            <li>
              Hand data out sealed — a token, a cursor, a state blob — that only a later run of the same
              project and caller can open.
            </li>
            <li>
              Name records by a keyed hash (<C>mac</C>) so that their names are hidden too.
            </li>
          </ul>
        </section>

        <section id="manifest">
          <AnchorHeading id="manifest">Declaring keys in the manifest</AnchorHeading>
          <p className="text-foreground">
            Keys are declared in <C>encryption_keys</C> of the project manifest — the{' '}
            <C>outlayer.manifest</C> custom section of the wasm, covered by its sha256:
          </p>
          <CodeBlock code={MANIFEST_EXAMPLE} language="json" filename="manifest.json" className="mt-3" />
          <Table
            head={['Field', 'Allowed', 'Meaning']}
            rows={[
              [
                <C key="f">path</C>,
                <span key="a"><C>[a-z0-9][a-z0-9_-]{'{0,31}'}</C>, unique in the list</span>,
                <span key="m">
                  The key&apos;s name <strong>and an input of its derivation</strong>. The same path gives the
                  same key for as long as its binding holds.{' '}
                  <strong>Renaming a path loses the key, and with it everything the key sealed.</strong> Pick
                  paths once.
                </span>,
              ],
              [
                <C key="f">bind</C>,
                <span key="a"><C>project</C> (default) | <C>wasm</C></span>,
                <span key="m">
                  As for a signing key — see{' '}
                  <a href="#binding" className="text-accent-text underline">Binding</a>.
                </span>,
              ],
              [
                <C key="f">caller</C>,
                <span key="a"><C>signer</C> (default) | <C>predecessor</C></span>,
                <span key="m">
                  As for a signing key — see{' '}
                  <Link href="/docs/signing-keys#caller" className="text-accent-text underline">
                    Signer or predecessor
                  </Link>
                  .
                </span>,
              ],
              [
                <C key="f">vault</C>,
                'a NEAR account id',
                <span key="m">
                  Optional, <C>bind: &quot;project&quot;</C> only: derive from that vault&apos;s master instead
                  of the default one. The vault must belong to the project&apos;s owner, as for a{' '}
                  <Link href="/docs/signing-keys#manifest" className="text-accent-text underline">
                    signing key
                  </Link>
                  .
                </span>,
              ],
            ]}
          />
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              <strong>No <C>type</C>.</strong> An encryption key is 32 bytes, and which algorithm uses them is
              the platform&apos;s choice. A declaration that names a <C>type</C> is refused as an unknown
              field.
            </li>
            <li>
              <strong>At most 3 encryption keys</strong>, counted apart from signing keys: a manifest may
              declare 3 of each. A key with an unknown field is refused, not read with the field dropped; a{' '}
              <C>bind</C> or <C>caller</C> value outside its list is refused the same way.
            </li>
            <li>
              <strong>A namespace of its own.</strong> An encryption key and a signing key declared at the
              same <C>path</C> are two unrelated secrets.
            </li>
          </ul>
        </section>

        <section id="binding">
          <AnchorHeading id="binding">Binding and caller</AnchorHeading>
          <p className="text-foreground">
            The rules are the signing keys&apos;, key for key —{' '}
            <Link href="/docs/signing-keys#binding" className="text-accent-text underline">
              Binding
            </Link>
            ,{' '}
            <Link href="/docs/signing-keys#caller" className="text-accent-text underline">
              Signer or predecessor
            </Link>
            , and what is trusted and checked. The keystore derives
          </p>
          <CodeBlock code={DERIVATION} language="text" className="mt-3" />
          <Table
            head={['bind', 'Issued only to', 'The key belongs to', 'A new version of the code']}
            rows={[
              [
                <span key="b"><C>project</C> (default)</span>,
                <span key="i">a run through a project whose version is a <C>WasmUrl</C> version</span>,
                "the project's on-chain uuid + the chosen caller",
                'opens what an earlier version sealed',
              ],
              [
                <C key="b">wasm</C>,
                'a direct run from a wasm URL, with no project',
                "the code's sha256 + the chosen caller",
                'has a new key, and cannot open what the old build sealed',
              ],
            ]}
          />
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              <strong>A GitHub-sourced run never gets keys.</strong> Publish the code as a wasm URL.
            </li>
            <li>
              One key whose <C>bind</C> or <C>caller</C> does not match how the code is run refuses the whole
              run before it starts.
            </li>
            <li>
              A <C>project</C> key belongs to the project&apos;s uuid, not its <C>owner/name</C> id: a project
              deleted and created again under the same name has new keys, and cannot open what the old one
              sealed.
            </li>
          </ul>
        </section>

        <section id="host-interface">
          <AnchorHeading id="host-interface">The host interface</AnchorHeading>
          <p className="text-foreground">
            <Ext href={WIT_FILE}>worker/wit/deps/encryption-keys.wit</Ext> — copy it into your crate as{' '}
            <C>wit/deps/encryption-keys.wit</C>:
          </p>
          <CodeBlock code={WIT} language="text" filename="wit/deps/encryption-keys.wit" className="mt-3" />
          <Table
            head={['Function', 'Answers']}
            rows={[
              [
                <C key="f">encrypt(path, vault, plaintext, aad)</C>,
                <span key="a">
                  <C>ok</C>: <C>plaintext</C> sealed under the key, bound to <C>aad</C> — see{' '}
                  <a href="#format" className="text-accent-text underline">Ciphertext format</a>.{' '}
                  <C>err</C>: the reason
                </span>,
              ],
              [
                <C key="f">decrypt(path, vault, ciphertext, aad)</C>,
                <span key="a">
                  <C>ok</C>: the plaintext of what <C>encrypt</C> sealed under the same <C>path</C>,{' '}
                  <C>vault</C> and <C>aad</C>. Any failure to open — an unknown format marker, a truncated or
                  tampered ciphertext, another key, another <C>aad</C> — is exactly{' '}
                  <C>err(&quot;decryption failed&quot;)</C>, and which of these it was is not said
                </span>,
              ],
              [
                <C key="f">mac(path, vault, data)</C>,
                <span key="a">
                  <C>ok</C>: HMAC-SHA256 of <C>data</C>, 32 bytes, under a subkey derived from the key for this
                  purpose alone — never the key <C>encrypt</C> uses. Deterministic: the same <C>data</C> under
                  the same key is the same tag in every run that holds the key
                </span>,
              ],
            ]}
          />
          <p className="text-foreground">
            <C>vault</C> names the key&apos;s declared vault exactly: <C>none</C> for a key declared without
            one, <C>some(&quot;&lt;vault&gt;&quot;)</C> for a key declared with that vault. Any other
            combination, an undeclared <C>path</C>, and an input over the limit are an <C>err</C> carrying the
            reason, never a trap. A module that imports the interface and declares no key gets an <C>err</C>{' '}
            for every path.
          </p>
          <p className="text-foreground mt-3">
            <strong>Limits:</strong> at most 262144 bytes (256 KiB) of plaintext, of <C>aad</C> and of{' '}
            <C>mac</C> data. A ciphertext may be longer by its 41 bytes of overhead, so everything{' '}
            <C>encrypt</C> returns opens again.
          </p>
        </section>

        <section id="format">
          <AnchorHeading id="format">Ciphertext format</AnchorHeading>
          <CodeBlock code={FORMAT} language="text" className="mt-3" />
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              41 bytes longer than the plaintext. The first byte is the <strong>format marker</strong>: it
              names the ciphertext&apos;s format, not a key version.
            </li>
            <li>
              Format <C>0x01</C> is XChaCha20-Poly1305 with a fresh random 24-byte nonce from the host&apos;s
              CSPRNG, so two calls on the same input never return the same bytes. The algorithm is the
              platform&apos;s choice: a later format would get another marker, over the same key.
            </li>
            <li>
              The key is never handed to the module or to anyone outside the keystore and the run, so a
              ciphertext opens only through <C>decrypt</C>, in a run that holds the same key.
            </li>
          </ul>
        </section>

        <section id="sealed-storage">
          <AnchorHeading id="sealed-storage">Sealed storage</AnchorHeading>
          <p className="text-foreground">
            The{' '}
            <Link href="/docs/storage#raw-storage" className="text-accent-text underline">
              raw storage functions
            </Link>{' '}
            — <C>set-raw</C>, <C>get-raw</C>, <C>set-if-absent-raw</C>, <C>set-if-equals-raw</C> — store bytes
            as given, in the run&apos;s{' '}
            <Link href="/docs/storage#whose-cell" className="text-accent-text underline">
              storage cell
            </Link>{' '}
            (per account, per project, like the encrypted functions), with no keystore on the path. The storage&apos;s operator can read a raw record&apos;s
            key name and bytes, so the module encrypts first. The recipe:
          </p>
          <Table
            head={['Part', 'What to use', 'Why']}
            rows={[
              [
                'the storage key',
                <span key="u">
                  <C>mac(path, vault, name)</C>, in hex
                </span>,
                'storage keys are visible to the operator; the same name always maps to the same tag, and the tag does not say which name it is',
              ],
              [
                'the value',
                <span key="u">
                  <C>encrypt(path, vault, value, aad = name)</C>
                </span>,
                "a ciphertext copied onto another record by whoever holds the storage fails to decrypt instead of being read as that record's data",
              ],
              [
                'reads and writes',
                <span key="u">
                  <C>set-raw</C>, <C>get-raw</C>, <C>set-if-absent-raw</C>, <C>set-if-equals-raw</C>
                </span>,
                'the value is already sealed: the bytes are stored as given',
              ],
              [
                'compare-and-swap',
                <span key="u">
                  <C>set-if-equals-raw(key, expected, new)</C>
                </span>,
                'compares the stored ciphertext bytes: pass the ciphertext you read, not a plaintext',
              ],
            ]}
          />
          <p className="text-foreground">
            A ciphertext is never empty, so an empty <C>get-raw</C> value means no record. The Rust SDK
            provides helpers for this pattern; the module below uses the host functions directly.
          </p>
          <p className="text-foreground">
            <strong>Pair the key&apos;s <C>caller</C> with <C>storage_account</C>.</strong> A module that seals
            records under a <C>caller: &quot;predecessor&quot;</C> key declares{' '}
            <C>&quot;storage_account&quot;: &quot;predecessor&quot;</C> in the manifest as well, so the key and the
            cell belong to the same account. With the default <C>signer</C> cell, records sealed for a relaying
            contract land in the cell of whichever account signed each transaction, and a call signed by another
            account finds none of them.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">A minimal Rust module: sealed notes</h3>
          <p className="text-foreground">
            Stores notes per caller under the key <C>notes</C>: <C>put</C> and <C>append</C> write, and{' '}
            <C>get</C> reads — over HTTPS only, where the caller is the payment key&apos;s owner (see{' '}
            <a href="#security" className="text-accent-text underline">Security rules</a>).
          </p>
          <CodeBlock code={MANIFEST_JSON} language="json" filename="manifest.json" className="mt-3" />
          <CodeBlock code={CARGO_TOML} language="toml" filename="Cargo.toml" className="mt-3" />
          <p className="text-foreground mt-3">
            The world imports both interfaces. Copy{' '}
            <Ext href={WIT_FILE}>encryption-keys.wit</Ext> and <Ext href={STORAGE_WIT}>storage.wit</Ext> into{' '}
            <C>wit/deps/</C>:
          </p>
          <CodeBlock code={WORLD_WIT} language="text" filename="wit/world.wit" className="mt-3" />
          <CodeBlock code={MAIN_RS} language="rust" filename="src/main.rs" className="mt-3" />
          <p className="text-foreground mt-3">Build, then check the imports and the manifest section:</p>
          <CodeBlock code={BUILD_CHECK} language="bash" className="mt-3" />
          <p className="text-foreground mt-3">
            Publish the wasm as a URL, deploy it as a project version (<C>bind: &quot;project&quot;</C>), and
            call the project:
          </p>
          <CodeBlock code={CALL} language="bash" className="mt-3" />
          <p className="text-foreground mt-3">
            The same caller calling any later version of the project reads the same notes.
          </p>
        </section>

        <section id="security">
          <AnchorHeading id="security">Security rules</AnchorHeading>
          <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
            <ul className="list-disc list-inside space-y-3 text-sm text-foreground">
              <li>
                <strong>Never hand back a plaintext to whoever asks.</strong> With{' '}
                <C>caller: &quot;signer&quot;</C>, any contract the signer transacts with can start a run under
                the signer&apos;s key with input of its own choosing. An on-chain answer is public besides. A
                module decides from what it has checked who may read what it opens.
              </li>
              <li>
                <strong>Always pass <C>aad</C>: the record&apos;s name.</strong> Without it, a ciphertext moved
                from one record to another still opens.
              </li>
              <li>
                <strong>Keep names out of raw storage keys.</strong> Use <C>mac</C> of the name; the operator
                sees every storage key and every raw value.
              </li>
              <li>
                <strong>Never rename a <C>path</C></strong> that has sealed data: the new path is a new key,
                and nothing sealed under the old one opens again.
              </li>
              <li>
                <strong>
                  With <C>bind: &quot;wasm&quot;</C>, a new build is a new key.
                </strong>{' '}
                Data sealed by one build does not survive an upgrade; use <C>project</C> for data that must.
              </li>
            </ul>
          </div>
        </section>

        <section id="refusals">
          <AnchorHeading id="refusals">Refusals</AnchorHeading>
          <p className="text-foreground">
            Refused before the code runs: every cause in the{' '}
            <Link href="/docs/signing-keys#refusals" className="text-accent-text underline">
              signing keys&apos; list
            </Link>{' '}
            except the <C>type</C> and <C>secp256k1</C> rows — an encryption key has no <C>type</C>, and a{' '}
            <C>type</C> member is itself refused as an unknown field:
          </p>
          <Table
            head={['Cause', 'What clears it']}
            rows={[
              [
                <span key="c">a <C>wasm32-wasip1</C> build declares keys</span>,
                <span key="f">build for <C>wasm32-wasip2</C></span>,
              ],
              [
                <span key="c">
                  more than 3 encryption keys, a bad <C>path</C> or one declared twice, an unknown field (
                  <C>type</C> included), a <C>bind</C> or <C>caller</C> outside its list
                </span>,
                <span key="f">fix <C>manifest.json</C>, publish a new version</span>,
              ],
              [
                'keys declared on a GitHub-sourced run, when the manifest reaches the worker',
                'publish the code as a wasm URL',
              ],
              [<span key="c">a <C>project</C> key on a run with no project</span>, 'run it through its project'],
              [
                <span key="c">a <C>wasm</C> key on a run through a project</span>,
                <span key="f">run the wasm URL directly, or declare the key <C>project</C></span>,
              ],
              [
                <span key="c">a <C>predecessor</C> key on a run that carries no predecessor</span>,
                <span key="f">call through a contract, or declare the key <C>signer</C></span>,
              ],
              [
                'a project run whose running code is not a WasmUrl version of that project, or whose project does not exist or is not owned by the account its id names',
                'deploy the wasm URL as a version of that project',
              ],
              [
                <span key="c">
                  <C>vault</C> on a <C>wasm</C> key; a vault not named directly under the project&apos;s
                  owner, not the owner&apos;s, or not available
                </span>,
                'fix the manifest, or the vault',
              ],
              ['a run with no caller account', 'call with a payment key, or on chain'],
            ]}
          />
          <p className="text-foreground">Inside a run, a call answers <C>err</C> for:</p>
          <ul className="list-disc list-inside space-y-1 text-foreground mt-2">
            <li>
              an undeclared <C>path</C>, or a <C>vault</C> argument that is not the key&apos;s declared vault;
            </li>
            <li>
              a plaintext, <C>aad</C> or <C>mac</C> data over 262144 bytes, or a ciphertext over 262144 + 41
              bytes;
            </li>
            <li>
              <C>decrypt</C>: any failure to open — always exactly <C>decryption failed</C>.
            </li>
          </ul>
        </section>

        <section id="example">
          <AnchorHeading id="example">Example: signing-key-probe</AnchorHeading>
          <p className="text-foreground">
            <Ext href={PROBE_TREE}>wasi-examples/signing-key-probe</Ext> has three encryption builds —{' '}
            <C>encryption</C> (project keys <C>alpha</C> and <C>beta</C>, beside a signing key <C>alpha</C>),{' '}
            <C>encryption-wasm</C> (a <C>wasm</C> key) and <C>encryption-vault</C> (a vault key) — with every
            host function and every refusal as an operation. Its <C>decrypt</C> hands back whatever it opens
            to whoever called: that is what a probe is for, and exactly what a production module must not do.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              <Ext href={PROBE_ENCRYPTION}>src/encryption.rs</Ext> — the encryption operations and attacks
            </li>
            <li>
              <Ext href={PROBE_README}>README.md</Ext> — builds, operations, attacks
            </li>
            <li>
              <Ext href={MANIFEST_DOC}>CONNECTOR_MANIFEST.md</Ext> — the full manifest reference, section{' '}
              <C>encryption_keys</C>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
