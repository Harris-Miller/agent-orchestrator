import {
  ANTIGRAVITY_ACP_SPAWN_NAME,
  ANTIGRAVITY_PROVIDER_ID,
  AO_HOME_DIRNAME,
  PROVIDER_CURRENT_FILENAME,
  PROVIDERS_DIRNAME,
} from '@lib/ao-home';
import {
  bytesToArrayBuffer,
  decodeIpcMessage,
  encodeIpcMessage,
  getIpcTransferList,
  unknownBytesToUint8Array,
} from '@lib/context-services-vscode-webview/protocol';
import { openableImageExtension } from '@lib/context-services';
import type { IpcMessage, StdioMode } from '@lib/context-services-vscode-webview/protocol';
import * as vscode from 'vscode';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir as osHomedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { fileWorkspaceFolderPaths } from './fileWorkspaceFolderPaths';
import { resolveAntigravitySpawn } from './antigravitySpawn';
import { isProviderCurrentJsonPath } from './providerStatePath';
import type { ProcessTracker } from './processTracker';

export { fileWorkspaceFolderPaths };

const post = (webview: vscode.Webview, message: IpcMessage, transfer?: ArrayBuffer[]): void => {
  const encoded = encodeIpcMessage(message);
  const transferList = transfer ?? getIpcTransferList(message);
  if (transferList !== undefined && transferList.length > 0) {
    const webviewWithTransfer = webview as vscode.Webview & {
      postMessage: (message: unknown, transfer?: ArrayBuffer[]) => PromiseLike<boolean>;
    };
    webviewWithTransfer.postMessage(encoded, transferList).then(
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

/** Push current Workspace folder paths to the webview (unsolicited). */
export const postWorkspaceFoldersChanged = (
  webview: vscode.Webview,
  folders: null | readonly vscode.WorkspaceFolder[] | undefined,
): void => {
  post(webview, {
    _tag: 'WorkspaceFoldersChanged',
    paths: [...fileWorkspaceFolderPaths(folders)],
  });
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
      | 'AppExit'
      | 'BundledResolve'
      | 'FileDialogPickFiles'
      | 'FsAtomicReplaceFileString'
      | 'FsCopyFile'
      | 'FsExists'
      | 'FsMakeDirectory'
      | 'FsMakeTempDirectory'
      | 'FsReadFile'
      | 'FsReadFileString'
      | 'FsRemove'
      | 'FsStat'
      | 'FsWriteFile'
      | 'FsWriteFileString'
      | 'HttpFetch'
      | 'Kill'
      | 'OpenUrl'
      | 'OpenFile'
      | 'OpenImageData'
      | 'OsSnapshot'
      | 'Spawn'
      | 'StdinChunk'
      | 'StdinEnd'
      | 'WindowFocus'
      | 'WorkspaceFolders';
  }
>;

const EXTENSION_INBOUND_TAGS: ReadonlySet<ExtensionInbound['_tag']> = new Set([
  'AppExit',
  'BundledResolve',
  'FileDialogPickFiles',
  'FsAtomicReplaceFileString',
  'FsCopyFile',
  'FsExists',
  'FsMakeDirectory',
  'FsMakeTempDirectory',
  'FsReadFile',
  'FsReadFileString',
  'FsRemove',
  'FsStat',
  'FsWriteFile',
  'FsWriteFileString',
  'HttpFetch',
  'Kill',
  'OpenUrl',
  'OpenFile',
  'OpenImageData',
  'OsSnapshot',
  'Spawn',
  'StdinChunk',
  'StdinEnd',
  'WindowFocus',
  'WorkspaceFolders',
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
  readonly workspaceFolders?: null | readonly vscode.WorkspaceFolder[];
}): Promise<void> => {
  const { context, raw, tracker, webview, webviewId, workspaceFolders } = args;
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
      case 'AppExit': {
        await vscode.commands.executeCommand('workbench.action.closeSidebar');
        post(webview, { _tag: 'AppExitResult', id: message.id });
        return;
      }
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
      case 'FileDialogPickFiles': {
        const filters =
          message.filters === undefined
            ? undefined
            : Object.fromEntries(message.filters.map(filter => [filter.name, [...filter.extensions]]));
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: message.multiple === true,
          filters,
          openLabel: 'Attach',
        });
        post(webview, {
          _tag: 'FileDialogPickFilesResult',
          id: message.id,
          paths: uris === undefined ? [] : uris.map(uri => uri.fsPath),
        });
        return;
      }
      case 'FsAtomicReplaceFileString': {
        if (!isProviderCurrentJsonPath(osHomedir(), message.path)) {
          throw new Error(`Atomic replace refused for path outside provider state: ${message.path}`);
        }
        const temp = `${message.path}.${String(process.pid)}.${Date.now().toString(36)}.tmp`;
        try {
          await mkdir(dirname(message.path), { recursive: true });
          await writeFile(temp, message.content, 'utf8');
          await rename(temp, message.path);
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
        post(webview, { _tag: 'FsAtomicReplaceFileStringResult', id: message.id });
        return;
      }
      case 'FsCopyFile': {
        await copyFile(message.fromPath, message.toPath);
        post(webview, { _tag: 'FsCopyFileResult', id: message.id });
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
      case 'FsReadFile': {
        const buffer = await readFile(message.path);
        const bytes = bytesToArrayBuffer(new Uint8Array(buffer));
        post(webview, { _tag: 'FsReadFileResult', bytes, id: message.id }, [bytes]);
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
      case 'FsStat': {
        const info = await stat(message.path);
        const type = info.isDirectory()
          ? ('Directory' as const)
          : info.isFile()
            ? ('File' as const)
            : info.isSymbolicLink()
              ? ('SymbolicLink' as const)
              : ('Unknown' as const);
        post(webview, {
          _tag: 'FsStatResult',
          atime: Number.isFinite(info.atimeMs) ? info.atimeMs : undefined,
          birthtime: Number.isFinite(info.birthtimeMs) ? info.birthtimeMs : undefined,
          id: message.id,
          mtime: Number.isFinite(info.mtimeMs) ? info.mtimeMs : undefined,
          size: info.size,
          type,
        });
        return;
      }
      case 'FsWriteFile': {
        await writeFile(message.path, unknownBytesToUint8Array(message.bytes));
        post(webview, { _tag: 'FsWriteFileResult', id: message.id });
        return;
      }
      case 'FsWriteFileString': {
        await writeFile(message.path, message.content, 'utf8');
        post(webview, { _tag: 'FsWriteFileStringResult', id: message.id });
        return;
      }
      case 'HttpFetch': {
        const init: Parameters<typeof fetch>[1] = {
          headers: message.headers,
          method: message.method,
        };
        if (message.body !== undefined) {
          init.body = Buffer.from(unknownBytesToUint8Array(message.body));
        }
        const res = await fetch(message.url, init);
        const bodyBytes = new Uint8Array(await res.arrayBuffer());
        const body = bodyBytes.byteLength > 0 ? bytesToArrayBuffer(bodyBytes) : undefined;
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        post(webview, {
          _tag: 'HttpFetchResult',
          body,
          headers,
          id: message.id,
          status: res.status,
          statusText: res.statusText,
        });
        return;
      }
      case 'Kill': {
        tracker.kill(webviewId, message.handleId);
        post(webview, { _tag: 'KillResult', id: message.id });
        return;
      }
      case 'WindowFocus': {
        post(webview, { _tag: 'WindowFocusResult', focused: vscode.window.state.focused, id: message.id });
        return;
      }
      case 'OpenUrl': {
        const opened = await vscode.env.openExternal(vscode.Uri.parse(message.url));
        if (!opened) {
          throw new Error(`openExternal declined: ${message.url}`);
        }
        post(webview, { _tag: 'OpenUrlResult', id: message.id });
        return;
      }
      case 'OpenFile': {
        const uri = vscode.Uri.file(message.path);
        const fileStat = await vscode.workspace.fs.stat(uri);
        await vscode.commands.executeCommand(
          fileStat.type === vscode.FileType.Directory ? 'revealInExplorer' : 'vscode.open',
          uri,
        );
        post(webview, { _tag: 'OpenFileResult', id: message.id });
        return;
      }
      case 'OpenImageData': {
        const ext = openableImageExtension[message.mimeType];
        const bytes = Buffer.from(message.base64, 'base64');
        const dir = join(tmpdir(), 'agent-orchestrator-images');
        await mkdir(dir, { recursive: true });
        const file = join(dir, `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${ext}`);
        await writeFile(file, bytes);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
        post(webview, { _tag: 'OpenImageDataResult', id: message.id });
        return;
      }
      case 'OsSnapshot': {
        post(webview, {
          _tag: 'OsSnapshotResult',
          arch: process.arch,
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
        const env = { ...(opts.extendEnv === false ? {} : stringEnv()), ...opts.env };
        // The logical Antigravity name maps to the active runtime's recorded command + args from current.json
        // (re-read on every spawn); the webview never supplies an executable path for it.
        const resolved =
          message.command === ANTIGRAVITY_ACP_SPAWN_NAME
            ? resolveAntigravitySpawn(
                osHomedir(),
                await readFile(
                  join(
                    osHomedir(),
                    AO_HOME_DIRNAME,
                    PROVIDERS_DIRNAME,
                    ANTIGRAVITY_PROVIDER_ID,
                    PROVIDER_CURRENT_FILENAME,
                  ),
                  'utf8',
                ),
              )
            : { args: message.args, command: message.command };
        const child = spawn(resolved.command, [...resolved.args], {
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
      case 'WorkspaceFolders': {
        post(webview, {
          _tag: 'WorkspaceFoldersResult',
          id: message.id,
          paths: [...fileWorkspaceFolderPaths(workspaceFolders)],
        });
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
