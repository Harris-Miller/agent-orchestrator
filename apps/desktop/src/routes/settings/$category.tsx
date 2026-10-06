import { isSettingsCategoryId, SettingsCategoryContent } from '@lib/ui';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/$category')({
  beforeLoad: ({ params }) => {
    if (!isSettingsCategoryId(params.category)) {
      // TanStack Router control-flow: redirect is thrown, not an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect()
      throw redirect({ params: { category: 'general' }, to: '/settings/$category' });
    }
    return { categoryId: params.category };
  },
  component: function SettingsCategoryRoute() {
    const { categoryId } = Route.useRouteContext();
    return <SettingsCategoryContent category={categoryId} />;
  },
});
