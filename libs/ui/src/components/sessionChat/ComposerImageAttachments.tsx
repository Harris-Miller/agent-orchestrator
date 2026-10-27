/** Horizontal thumbnail strip for composer image attachments (hover-X remove; no lightbox). */
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import { X } from 'lucide-react';
import type { FC } from 'react';

import type { ComposerImageAttachment } from '../../host/composerImageAttachment.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

const THUMB_PX = 56;

export const ComposerImageAttachments: FC<{
  readonly attachments: readonly ComposerImageAttachment[];
  readonly disabled?: boolean;
  readonly onRemove: (id: string) => void;
}> = ({ attachments, disabled = false, onRemove }) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, pb: 0.5 }}>
      {attachments.map(attachment => (
        <Box
          key={attachment.id}
          sx={{
            '&:hover .composer-image-remove': { opacity: 1 },
            borderRadius: 1,
            flexShrink: 0,
            height: THUMB_PX,
            overflow: 'hidden',
            position: 'relative',
            width: THUMB_PX,
          }}
        >
          <Box
            alt={attachment.name}
            component="img"
            src={attachment.previewDataUrl}
            sx={{
              display: 'block',
              height: '100%',
              objectFit: 'cover',
              width: '100%',
            }}
          />
          <IconButton
            aria-label={`Remove ${attachment.name}`}
            className="composer-image-remove"
            disabled={disabled}
            onClick={() => {
              onRemove(attachment.id);
            }}
            size="small"
            sx={{
              '&:hover': {
                bgcolor: theme => alpha(theme.palette.common.black, 0.88),
              },
              bgcolor: theme => alpha(theme.palette.common.black, 0.72),
              color: 'common.white',
              height: 22,
              opacity: 0,
              position: 'absolute',
              right: 2,
              top: 2,
              transition: theme => theme.transitions.create('opacity'),
              width: 22,
            }}
          >
            <LucideMuiIcon icon={X} sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}
    </Stack>
  );
};
