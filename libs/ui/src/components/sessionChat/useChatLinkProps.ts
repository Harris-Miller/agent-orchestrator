import { useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/reactivity';
import type { KeyboardEvent, MouseEvent } from 'react';

import { openFileSupportedAtom } from '../../atoms/boundHarnessAtoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { classifyChatLinkHref, openChatLink } from '../../host/openChatLink.ts';

export type ChatLinkProps = {
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly role: 'link';
  readonly tabIndex: 0;
};

/** Click/Enter props that run `open` without navigating the webview; clicks that end a text selection are ignored. */
export const chatLinkHandlers = (open: () => void): ChatLinkProps => {
  const handle = (event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
    if ('key' in event && event.key !== 'Enter') return;
    event.preventDefault();
    if ('button' in event && window.getSelection()?.isCollapsed === false) return;
    open();
  };
  return { onClick: handle, onKeyDown: handle, role: 'link', tabIndex: 0 };
};

/** Click/keyboard props for a clickable Chat link, or `undefined` when the href is inert. Never navigates the webview. */
export const useChatLinkProps = (href: string): ChatLinkProps | undefined => {
  const supported = useAtomValue(openFileSupportedAtom);
  const { sessionCwd } = useSelectedSessionFsListing();
  const link = classifyChatLinkHref(
    href,
    AsyncResult.getOrElse(supported, () => false),
    sessionCwd,
  );
  if (link.kind === 'inert') return undefined;
  return chatLinkHandlers(() => {
    hostRunPromise(openChatLink(link)).catch(() => undefined);
  });
};
