import { toast } from './ui/toast.tsx';

/** Client-error snackbar replacement shared by both hosts. */
export const showClientErrorToast = (description: string): void => {
  toast.add({ description, timeout: 6000, title: 'Error', type: 'error' });
};
