import {
  ANTIGRAVITY_ACP_SPAWN_NAME,
  ANTIGRAVITY_PROVIDER_ID,
  HOA_HOME_DIRNAME,
  PROVIDER_CURRENT_FILENAME,
  PROVIDERS_DIRNAME,
} from '@lib/hoa-home';
import {
  bytesToArrayBuffer,
  postIpcMessage,
  unknownBytesToUint8Array,
} from '@lib/context-services-vscode-webview/protocol';
import { openableImageExtension } from '@lib/context-services';
import type { HostIpcFulfillment, IpcPort, StdioMode } from '@lib/context-services-vscode-webview/protocol';
import * as vscode from 'vscode';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir as osHomedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { assertAbsolutePath, samePath, sliceTextLines } from './editorFilePaths';
import { fileWorkspaceFilePath, fileWorkspaceFolderPaths } from './fileWorkspaceFolderPaths';
import { resolveAntigravitySpawn } from './antigravitySpawn';
import { isProviderCurrentJsonPath } from './providerStatePath';
import type { ProcessTracker } from './processTracker';

export { fileWorkspaceFolderPaths };

/** The Workspace folder paths plus the saved workspace file path (omitted when there is none). */
const workspaceFoldersPayload = (
  folders: null | readonly vscode.WorkspaceFolder[] | undefined,
  workspaceFile: undefined | vscode.Uri,
) => {
  const paths = [...fileWorkspaceFolderPaths(folders)];
  const file = fileWorkspaceFilePath(workspaceFile);
  return file === undefined ? { paths } : { paths, workspaceFile: file };
};

/** Push current Workspace folder paths and workspace file to the webview (unsolicited). */
export const postWorkspaceFoldersChanged = (
  port: IpcPort,
  folders: null | readonly vscode.WorkspaceFolder[] | undefined,
  workspaceFile: undefined | vscode.Uri,
): void => {
  postIpcMessage(port, { _tag: 'WorkspaceFoldersChanged', ...workspaceFoldersPayload(folders, workspaceFile) });
};

const findOpenDocument = (path: string) =>
  vscode.workspace.textDocuments.find(doc => doc.uri.scheme === 'file' && samePath(doc.uri.fsPath, path));

/** Fixed-message error for an fs failure: the original message embeds the absolute path (Private data). */
const pathFreeFsError = (error: unknown, fallback: string): Error => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'ENOENT') {
    return new Error('File not found');
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new Error('Permission denied');
  }
  return new Error(fallback);
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

/**
 * `OTEL_*` as of activation, once `.env.development` is loaded. VS Code's bundled Copilot extension deletes
 * `OTEL_EXPORTER_OTLP_ENDPOINT` from the shared extension host's `process.env` shortly after startup, so the webview
 * would not see the endpoint and dev OTLP export would silently stay off. The snapshot falls back to these values.
 */
let startupOtelEnv: Readonly<Record<string, string>> = {};

export const captureStartupOtelEnv = (): void => {
  startupOtelEnv = Object.fromEntries(Object.entries(stringEnv()).filter(([key]) => key.startsWith('OTEL_')));
};

const toNodeStdio = (mode: StdioMode | undefined): 'ignore' | 'inherit' | 'pipe' =>
  mode === 'inherit' || mode === 'ignore' ? mode : 'pipe';

/**
 * **Host IPC fulfillment** for one webview: a handler per Host IPC request and webview push
 * (served by `serveHostIpc`, which owns decoding, Result/`Error` replies and ignoring the rest).
 */
export const makeHostIpcFulfillment = (deps: {
  readonly asAbsolutePath: (relativePath: string) => string;
  /** Extension Development mode: warns when the webview's env has no OTLP endpoint (export would silently stay off). */
  readonly isExtensionDevelopment: boolean;
  /** Webview port, for Spawn's stdout/stderr/exit pushes. */
  readonly port: IpcPort;
  readonly tracker: ProcessTracker;
  readonly webviewId: string;
  /** Read per WorkspaceFolders request. */
  readonly workspaceFolders: () => null | readonly vscode.WorkspaceFolder[] | undefined;
  /** Read per WorkspaceFolders request: the saved workspace's file, `undefined` when untitled or none. */
  readonly workspaceFile: () => undefined | vscode.Uri;
}): HostIpcFulfillment => {
  const { asAbsolutePath, isExtensionDevelopment, port, tracker, webviewId, workspaceFile, workspaceFolders } = deps;
  return {
    AppExit: async () => {
      await vscode.commands.executeCommand('workbench.action.closeSidebar');
      return {};
    },
    BundledResolve: async message => {
      const absolute = asAbsolutePath(message.resourcePath);
      try {
        await access(absolute, fsConstants.F_OK);
      } catch {
        throw new Error('Bundled resource missing');
      }
      return { path: absolute };
    },
    EditorReadTextFile: async message => {
      assertAbsolutePath(message.path);
      const open = findOpenDocument(message.path);
      const text =
        open === undefined
          ? await readFile(message.path, 'utf8').catch((error: unknown) => {
              throw pathFreeFsError(error, 'File read failed');
            })
          : open.getText();
      return { content: sliceTextLines(text, message.line, message.limit) };
    },
    EditorWriteTextFile: async message => {
      assertAbsolutePath(message.path);
      const open = findOpenDocument(message.path);
      if (open === undefined) {
        try {
          await mkdir(dirname(message.path), { recursive: true });
          await writeFile(message.path, message.content, 'utf8');
        } catch (error) {
          throw pathFreeFsError(error, 'File write failed');
        }
        return {};
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(open.uri, new vscode.Range(0, 0, open.lineCount, 0), message.content);
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error('Editor rejected the edit');
      }
      if (!(await open.save())) {
        throw new Error('Document save failed');
      }
      return {};
    },
    FileDialogPickFiles: async message => {
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
      return { paths: uris === undefined ? [] : uris.map(uri => uri.fsPath) };
    },
    FsAtomicReplaceFileString: async message => {
      if (!isProviderCurrentJsonPath(osHomedir(), message.path)) {
        throw new Error('Atomic replace refused for path outside provider state');
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
      return {};
    },
    FsCopyFile: async message => {
      await copyFile(message.fromPath, message.toPath);
      return {};
    },
    FsExists: async message => {
      try {
        await access(message.path, fsConstants.F_OK);
        return { exists: true };
      } catch {
        return { exists: false };
      }
    },
    FsMakeDirectory: async message => {
      await mkdir(message.path, { recursive: message.options?.recursive === true });
      return {};
    },
    FsMakeTempDirectory: async message => {
      const base = message.options?.directory ?? tmpdir();
      const prefix = message.options?.prefix ?? 'ao-';
      return { path: await mkdtemp(join(base, prefix)) };
    },
    FsReadFile: async message => {
      const buffer = await readFile(message.path);
      return { bytes: bytesToArrayBuffer(new Uint8Array(buffer)) };
    },
    FsReadFileString: async message => ({ content: await readFile(message.path, 'utf8') }),
    FsRemove: async message => {
      await rm(message.path, { force: true, recursive: message.options?.recursive === true });
      return {};
    },
    FsStat: async message => {
      const info = await stat(message.path);
      const type = info.isDirectory()
        ? ('Directory' as const)
        : info.isFile()
          ? ('File' as const)
          : info.isSymbolicLink()
            ? ('SymbolicLink' as const)
            : ('Unknown' as const);
      return {
        atime: Number.isFinite(info.atimeMs) ? info.atimeMs : undefined,
        birthtime: Number.isFinite(info.birthtimeMs) ? info.birthtimeMs : undefined,
        mtime: Number.isFinite(info.mtimeMs) ? info.mtimeMs : undefined,
        size: info.size,
        type,
      };
    },
    FsWriteFile: async message => {
      await writeFile(message.path, unknownBytesToUint8Array(message.bytes));
      return {};
    },
    FsWriteFileString: async message => {
      await writeFile(message.path, message.content, 'utf8');
      return {};
    },
    HttpFetch: async message => {
      const init: Parameters<typeof fetch>[1] = {
        headers: message.headers,
        method: message.method,
      };
      if (message.body !== undefined) {
        init.body = Buffer.from(unknownBytesToUint8Array(message.body));
      }
      const res = await fetch(message.url, init);
      const bodyBytes = new Uint8Array(await res.arrayBuffer());
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        body: bodyBytes.byteLength > 0 ? bytesToArrayBuffer(bodyBytes) : undefined,
        headers,
        status: res.status,
        statusText: res.statusText,
      };
    },
    Kill: message => {
      tracker.kill(webviewId, message.handleId);
      return Promise.resolve({});
    },
    OpenFile: async message => {
      const uri = vscode.Uri.file(message.path);
      // The stat error names the path (Private data); keep it out of the message that reaches telemetry.
      const fileStat = await vscode.workspace.fs.stat(uri).then(undefined, () => {
        throw new Error('OpenFile target is not accessible');
      });
      if (fileStat.type === vscode.FileType.Directory) {
        await vscode.commands.executeCommand('revealInExplorer', uri);
      } else if (message.line === undefined) {
        await vscode.commands.executeCommand('vscode.open', uri);
      } else {
        const line = Math.max(1, message.line) - 1;
        // Jumping is best effort: if it fails, open the file without the line.
        await vscode.commands
          .executeCommand('vscode.open', uri, { selection: new vscode.Range(line, 0, line, 0) })
          .then(undefined, () => vscode.commands.executeCommand('vscode.open', uri));
      }
      return {};
    },
    OpenImageData: async message => {
      const ext = openableImageExtension[message.mimeType];
      const bytes = Buffer.from(message.base64, 'base64');
      const dir = join(tmpdir(), 'hoa-images');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${ext}`);
      await writeFile(file, bytes);
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
      return {};
    },
    OpenUrl: async message => {
      const opened = await vscode.env.openExternal(vscode.Uri.parse(message.url));
      if (!opened) {
        throw new Error('openExternal declined');
      }
      return {};
    },
    OsSnapshot: () => {
      const env: Record<string, string> = {
        ...startupOtelEnv,
        ...stringEnv(),
        // Host markers for the webview's hub client (not passed to spawned children): which Host this is, and the
        // remote kind of a Remote SSH / WSL / container / Codespaces window, whose agents cannot reach a local hub.
        HOA_HOST: 'vscode',
        ...(vscode.env.remoteName === undefined ? {} : { HOA_VSCODE_REMOTE_NAME: vscode.env.remoteName }),
      };
      if (isExtensionDevelopment && env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) {
        console.warn(
          '[hoa] OTEL_EXPORTER_OTLP_ENDPOINT is missing from the webview env: OTLP export is off in Extension Development. See docs/observability-debugging.md.',
        );
      }
      return Promise.resolve({
        arch: process.arch,
        cwd: process.cwd(),
        env,
        homedir: osHomedir(),
        platform: process.platform,
      });
    },
    Spawn: async message => {
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
                  HOA_HOME_DIRNAME,
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

      // Child I/O arrives on later macrotasks, so the SpawnResult reply is posted before any of these pushes.
      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          postIpcMessage(port, { _tag: 'StdoutChunk', bytes: bytesToArrayBuffer(new Uint8Array(chunk)), handleId });
        });
        child.stdout.on('end', () => {
          postIpcMessage(port, { _tag: 'StdoutEnd', handleId });
        });
      }
      if (child.stderr && opts.stderr !== 'inherit') {
        child.stderr.on('data', (chunk: Buffer) => {
          postIpcMessage(port, { _tag: 'StderrChunk', bytes: bytesToArrayBuffer(new Uint8Array(chunk)), handleId });
        });
        child.stderr.on('end', () => {
          postIpcMessage(port, { _tag: 'StderrEnd', handleId });
        });
      }
      child.on('exit', (code, signal) => {
        tracker.unregister(webviewId, handleId);
        postIpcMessage(port, {
          _tag: 'Exit',
          code: code ?? (signal !== null ? 1 : 0),
          handleId,
        });
      });
      return { handleId, pid: child.pid ?? -1 };
    },
    StdinChunk: message => {
      tracker
        .get(webviewId, message.handleId)
        ?.child.stdin?.write(Buffer.from(unknownBytesToUint8Array(message.bytes)));
    },
    StdinEnd: message => {
      tracker.get(webviewId, message.handleId)?.child.stdin?.end();
    },
    WindowFocus: () => Promise.resolve({ focused: vscode.window.state.focused }),
    WorkspaceFolders: () => Promise.resolve(workspaceFoldersPayload(workspaceFolders(), workspaceFile())),
  };
};
