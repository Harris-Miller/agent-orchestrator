import ListItem from '@mui/material/ListItem';
import type { FC } from 'react';

import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentRow } from './SubagentRow.tsx';

/** A subagent Chat item in the parent transcript. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => (
  <ListItem sx={{ display: 'block', py: 0.25 }}>
    <SubagentRow childId={item.subagentSessionId} />
  </ListItem>
);
