import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import type { SnackbarProps } from '@mui/material/Snackbar';
import type { AlertProps } from '@mui/material/Alert';
import { X } from 'lucide-react';
import type { FC, ReactNode } from 'react';

/**
 * The one app toast: top-center, opaque (filled), always dismissible. Every notification goes through this so
 * placement, opacity and the dismiss control stay uniform.
 */
// Alert omits its own close button when `action` is set, so dismiss is rendered alongside the action.
export const Toast: FC<{
  readonly action?: ReactNode;
  readonly autoHideDuration?: number;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly severity: AlertProps['severity'];
  readonly slotProps?: SnackbarProps['slotProps'];
}> = ({ action, autoHideDuration, children, onClose, open, severity, slotProps }) => (
  <Snackbar
    anchorOrigin={{ horizontal: 'center', vertical: 'top' }}
    autoHideDuration={autoHideDuration}
    // Ignore click-away so a stray click does not dismiss the toast; timeout and the close button still do.
    onClose={(_event, reason) => {
      if (reason !== 'clickaway') {
        onClose();
      }
    }}
    open={open}
    slotProps={slotProps}
  >
    <Alert
      action={
        <>
          {action}
          <IconButton aria-label="Dismiss" color="inherit" onClick={onClose} size="small">
            <X size={16} />
          </IconButton>
        </>
      }
      severity={severity}
      variant="filled"
    >
      {children}
    </Alert>
  </Snackbar>
);
