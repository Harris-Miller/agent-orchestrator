/**
 * Pinned Google Antigravity ACP server release (darwin/linux only).
 * Hashes/URLs from t3code antigravityRelease 1.4.1.
 */
import { ANTIGRAVITY_ACP_EXECUTABLE_NAME, ANTIGRAVITY_ACP_HARNESS_NAME, ANTIGRAVITY_ACP_VERSION } from '@lib/ao-home';

export type AntigravityReleaseAsset = {
  readonly archiveBytes: number;
  readonly executable: { readonly bytes: number; readonly name: string };
  readonly harness: { readonly bytes: number; readonly name: string };
  readonly sha256: string;
  readonly url: string;
  readonly version: string;
};

const releaseAssets = new Map<string, AntigravityReleaseAsset>([
  [
    'darwin-arm64',
    {
      archiveBytes: 112_737_434,
      executable: { bytes: 280_996_576, name: ANTIGRAVITY_ACP_EXECUTABLE_NAME },
      harness: { bytes: 120_246_928, name: ANTIGRAVITY_ACP_HARNESS_NAME },
      sha256: 'f9bdd68291ae78c38d2141e63bc86b84e6cc7b9f60f71652c68435a7943deb17',
      url: 'https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.4.1-darwin-arm64.zip',
      version: ANTIGRAVITY_ACP_VERSION,
    },
  ],
  [
    'darwin-x64',
    {
      archiveBytes: 118_349_036,
      executable: { bytes: 285_186_624, name: ANTIGRAVITY_ACP_EXECUTABLE_NAME },
      harness: { bytes: 124_910_048, name: ANTIGRAVITY_ACP_HARNESS_NAME },
      sha256: '27e31f096874704f14167b07ef9e84cc77134615ee41d024f7b1c957add85307',
      url: 'https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.4.1-darwin-x86_64.zip',
      version: ANTIGRAVITY_ACP_VERSION,
    },
  ],
  [
    'linux-arm64',
    {
      archiveBytes: 321_922_507,
      executable: { bytes: 933_416_796, name: ANTIGRAVITY_ACP_EXECUTABLE_NAME },
      harness: { bytes: 124_895_000, name: ANTIGRAVITY_ACP_HARNESS_NAME },
      sha256: '609336a1c97545487e3ddd55dbd153dc0f40f4e6534486cc1c5f4c0ebb85c2da',
      url: 'https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.1-linux-arm64.zip',
      version: ANTIGRAVITY_ACP_VERSION,
    },
  ],
  [
    'linux-x64',
    {
      archiveBytes: 336_170_339,
      executable: { bytes: 930_826_753, name: ANTIGRAVITY_ACP_EXECUTABLE_NAME },
      harness: { bytes: 131_187_512, name: ANTIGRAVITY_ACP_HARNESS_NAME },
      sha256: '2e37012ceb2a5c7fc7309b6e6596234fb637ee3c62a5199f65d4cbe777871384',
      url: 'https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.1-linux-x86_64.zip',
      version: ANTIGRAVITY_ACP_VERSION,
    },
  ],
]);

export const resolveAntigravityReleaseAsset = (platform: string, arch: string): AntigravityReleaseAsset | undefined =>
  releaseAssets.get(`${platform}-${arch}`);
