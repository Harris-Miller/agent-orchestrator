import { isSettingsCategoryId, SettingsCategoryContent, SettingsShell } from '@lib/ui';
import { useNavigate, useParams } from '@tanstack/react-router';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { category } = useParams({ from: '/settings/$category' });
  if (!isSettingsCategoryId(category)) return null;
  return (
    <SettingsShell
      category={category}
      onBack={() => {
        navigate({ to: '/' }).catch(() => undefined);
      }}
      onSelectCategory={selectedCategory => {
        navigate({ to: '/settings/$category', params: { category: selectedCategory } }).catch(() => undefined);
      }}
    >
      <SettingsCategoryContent category={category} />
    </SettingsShell>
  );
};
