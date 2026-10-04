import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import type { ComposerSegment } from './composerCommandTokens.ts';
import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';

/** Prepare user transcript text then split into composer-parity chip/text segments. */
export const prepareUserMessageSegments = (
  text: string,
  availableCommands: readonly AvailableCommand[],
): readonly ComposerSegment[] => splitComposerCommandSegments(prepareChatMarkdownText(text), availableCommands);
