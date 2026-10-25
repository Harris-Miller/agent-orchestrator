import { cn } from 'cn';
import type { FC, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';

import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';

/** Look like a link; never emit a real <a href> (Tauri navigates absolute paths and breaks the shell). */
const MarkdownLink: FC<{ children?: ReactNode }> = ({ children }) => (
  <span className="text-primary underline">{children}</span>
);

const markdownComponents = { a: MarkdownLink } satisfies Components;

const markdownClass =
  'text-base text-foreground [&_blockquote]:mb-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_h1]:text-[1.47rem] [&_h2]:text-[1.29rem] [&_h3]:text-[1.18rem] [&_h4]:text-[1.18rem] [&_h5]:text-[1.18rem] [&_h6]:text-[1.18rem] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:leading-snug [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:leading-snug [&_h3]:mt-3 [&_h3]:mb-2 [&_h4]:mt-3 [&_h4]:mb-2 [&_h5]:mt-3 [&_h5]:mb-2 [&_h6]:mt-3 [&_h6]:mb-2 [&_:is(h1,h2,h3,h4,h5,h6):first-of-type]:mt-0 [&_hr]:my-3 [&_hr]:border-border [&_ol]:mb-2 [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:mb-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:mb-2 [&_ul]:pl-5';

export const ChatMarkdown: FC<{ className?: string; text: string }> = ({ className, text }) => (
  <div className={cn(markdownClass, className)}>
    <Markdown components={markdownComponents} skipHtml>
      {prepareChatMarkdownText(text)}
    </Markdown>
  </div>
);
