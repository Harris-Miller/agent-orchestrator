import { isSettingsCategoryId, SettingsCategoryContent } from '@lib/ui';
import Alert from '@mui/material/Alert';
import { createFileRoute, redirect, useParams } from '@tanstack/react-router';
import type { FC } from 'react';

const SettingsCategoryRoute: FC = () => {
  const { category } = useParams({ from: '/settings/$category' });
  if (!isSettingsCategoryId(category)) {
    return <Alert severity="warning">Unknown settings category.</Alert>;
  }
  return <SettingsCategoryContent category={category} />;
};

export const Route = createFileRoute('/settings/$category')({
  beforeLoad: ({ params }) => {
    if (!isSettingsCategoryId(params.category)) {
      // TanStack Router control-flow: redirect is thrown, not an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect()
      throw redirect({ params: { category: 'general' }, to: '/settings/$category' });
    }
  },
  component: SettingsCategoryRoute,
});
