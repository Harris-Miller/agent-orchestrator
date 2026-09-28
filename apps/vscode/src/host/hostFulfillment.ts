import {
  bytesToArrayBuffer,
  decodeIpcMessage,
  encodeIpcMessage,
  unknownBytesToUint8Array,
} from '@lib/context-services-vscode-webview/protocol';
import type { IpcMessage, StdioMode } from '@lib/context-services-vscode-webview/protocol';
import type * as vscode from 'vscode';

import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir as osHomedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProcessTracker } from './processTracker';

const post = (webview: vscode.Webview, message: IpcMessage, transfer?: ArrayBuffer[]): void => {
  const encoded = encodeIpcMessage(message);
  if (transfer !== undefined && transfer.length > 0) {
    const webviewWithTransfer = webview as vscode.Webview & {
      postMessage: (message: unknown, transfer?: ArrayBuffer[]) => PromiseLike<boolean>;
    };
    webviewWithTransfer.postMessage(encoded, transfer).then(
      () => undefined,
      () => undefined,
    );
    return;
  }
  webview.postMessage(encoded).then(
    () => undefined,
    () => undefined,
  );
};

const postError = (webview: vscode.Webview, id: string, error: unknown): void => {
  post(webview, {
    _tag: 'Error',
    id,
    message: error instanceof Error ? error.message : String(error),
  });
};

const stringEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
};

const toNodeStdio = (mode: StdioMode | undefined): 'ignore' | 'inherit' | 'pipe' =>
  mode === 'inherit' || mode === 'ignore' ? mode : 'pipe';

type ExtensionInbound = Extract<
  IpcMessage,
  {
    readonly _tag:
      | 'BundledResolve'
      | 'FsExists'
      | 'FsMakeDirectory'
      | 'FsMakeTempDirectory'
      | 'FsReadFileString'
      | 'FsRemove'
      | 'FsWriteFileString'
      | 'Kill'
      | 'OsSnapshot'
      | 'Spawn'
      | 'StdinChunk'
      | 'StdinEnd';
  }
>;

const EXTENSION_INBOUND_TAGS: ReadonlySet<ExtensionInbound['_tag']> = new Set([
  'BundledResolve',
  'FsExists',
  'FsMakeDirectory',
  'FsMakeTempDirectory',
  'FsReadFileString',
  'FsRemove',
  'FsWriteFileString',
  'Kill',
  'OsSnapshot',
  'Spawn',
  'StdinChunk',
  'StdinEnd',
]);

const isExtensionInbound = (message: IpcMessage): message is ExtensionInbound =>
  EXTENSION_INBOUND_TAGS.has(message._tag as ExtensionInbound['_tag']);

/**
 * Handle one inbound webview IPC message on the extension host.
 */
export const handleHostIpcMessage = async (args: {
  readonly context: Pick<vscode.ExtensionContext, 'asAbsolutePath'>;
  readonly raw: unknown;
  readonly tracker: ProcessTracker;
  readonly webview: vscode.Webview;
  readonly webviewId: string;
}): Promise<void> => {
  const { context, raw, tracker, webview, webviewId } = args;
  let message: IpcMessage;
  try {
    message = decodeIpcMessage(raw);
  } catch {
    return;
  }
  if (!isExtensionInbound(message)) {
    return;
  }

  try {
    switch (message._tag) {
      case 'BundledResolve': {
        const absolute = context.asAbsolutePath(message.resourcePath);
        try {
          await access(absolute, fsConstants.F_OK);
        } catch {
          throw new Error(`Bundled resource missing: ${message.resourcePath} (${absolute})`);
        }
        post(webview, { _tag: 'BundledResolveResult', id: message.id, path: absolute });
        return;
      }
      case 'FsExists': {
        try {
          await access(message.path, fsConstants.F_OK);
          post(webview, { _tag: 'FsExistsResult', exists: true, id: message.id });
        } catch {
          post(webview, { _tag: 'FsExistsResult', exists: false, id: message.id });
        }
        return;
      }
      case 'FsMakeDirectory': {
        await mkdir(message.path, { recursive: message.options?.recursive === true });
        post(webview, { _tag: 'FsMakeDirectoryResult', id: message.id });
        return;
      }
      case 'FsMakeTempDirectory': {
        const base = message.options?.directory ?? tmpdir();
        const prefix = message.options?.prefix ?? 'ao-';
        const path = await mkdtemp(join(base, prefix));
        post(webview, { _tag: 'FsMakeTempDirectoryResult', id: message.id, path });
        return;
      }
      case 'FsReadFileString': {
        const content = await readFile(message.path, 'utf8');
        post(webview, { _tag: 'FsReadFileStringResult', content, id: message.id });
        return;
      }
      case 'FsRemove': {
        await rm(message.path, { force: true, recursive: message.options?.recursive === true });
        post(webview, { _tag: 'FsRemoveResult', id: message.id });
        return;
      }
      case 'FsWriteFileString': {
        await writeFile(message.path, message.content, 'utf8');
        post(webview, { _tag: 'FsWriteFileStringResult', id: message.id });
        return;
      }
      case 'Kill': {
        tracker.kill(webviewId, message.handleId);
        post(webview, { _tag: 'KillResult', id: message.id });
        return;
      }
      case 'OsSnapshot': {
        post(webview, {
          _tag: 'OsSnapshotResult',
          cwd: process.cwd(),
          env: stringEnv(),
          homedir: osHomedir(),
          id: message.id,
          platform: process.platform,
        });
        return;
      }
      case 'Spawn': {
        const handleId = tracker.allocateHandleId();
        const opts = message.options ?? {};
        const env = { ...(opts.extendEnv === false ? {} : stringEnv()), ...(opts.env ?? {}) };
        const child = spawn(message.command, [...message.args], {
          cwd: opts.cwd,
          env,
          stdio: [toNodeStdio(opts.stdin), toNodeStdio(opts.stdout), toNodeStdio(opts.stderr)],
        });
        tracker.register(webviewId, handleId, child);
        post(webview, {
          _tag: 'SpawnResult',
          handleId,
          id: message.id,
          pid: child.pid ?? -1,
        });

        if (child.stdout) {
          child.stdout.on('data', (chunk: Buffer) => {
            const bytes = bytesToArrayBuffer(new Uint8Array(chunk));
            post(webview, { _tag: 'StdoutChunk', bytes, handleId }, [bytes]);
          });
          child.stdout.on('end', () => {
            post(webview, { _tag: 'StdoutEnd', handleId });
          });
        }
        if (child.stderr && opts.stderr !== 'inherit') {
          child.stderr.on('data', (chunk: Buffer) => {
            const bytes = bytesToArrayBuffer(new Uint8Array(chunk));
            post(webview, { _tag: 'StderrChunk', bytes, handleId }, [bytes]);
          });
          child.stderr.on('end', () => {
            post(webview, { _tag: 'StderrEnd', handleId });
          });
        }
        child.on('exit', (code, signal) => {
          tracker.unregister(webviewId, handleId);
          post(webview, {
            _tag: 'Exit',
            code: code ?? (signal !== null ? 1 : 0),
            handleId,
          });
        });
        return;
      }
      case 'StdinChunk': {
        const tracked = tracker.get(webviewId, message.handleId);
        tracked?.child.stdin?.write(Buffer.from(unknownBytesToUint8Array(message.bytes)));
        return;
      }
      case 'StdinEnd': {
        const tracked = tracker.get(webviewId, message.handleId);
        tracked?.child.stdin?.end();
      }
    }
  } catch (error) {
    if ('id' in message) {
      postError(webview, message.id, error);
    }
  }
};
