import toast from 'react-hot-toast';

/**
 * Oura-themed toast notification system
 * Provides consistent, styled feedback throughout the app
 */

// Base styles matching Oura theme
const baseStyle = {
  background: '#0a0a0a',
  color: '#ffffff',
  border: '1px solid #1a1a1a',
  borderRadius: '16px',
  padding: '16px 20px',
  fontSize: '14px',
  fontWeight: '500',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
};

// Custom toast configurations
export const ouraToast = {
  // Success - Cyan glow
  success: (message, options = {}) => {
    return toast.success(message, {
      style: {
        ...baseStyle,
        borderColor: '#00d4aa30',
      },
      iconTheme: {
        primary: '#00d4aa',
        secondary: '#0a0a0a',
      },
      ...options,
    });
  },

  // Error - Red glow
  error: (message, options = {}) => {
    return toast.error(message, {
      style: {
        ...baseStyle,
        borderColor: '#ef444430',
      },
      iconTheme: {
        primary: '#ef4444',
        secondary: '#0a0a0a',
      },
      duration: 4000,
      ...options,
    });
  },

  // Loading - Purple glow
  loading: (message, options = {}) => {
    return toast.loading(message, {
      style: {
        ...baseStyle,
        borderColor: '#a855f730',
      },
      ...options,
    });
  },

  // Info/Neutral - Blue glow
  info: (message, options = {}) => {
    return toast(message, {
      style: {
        ...baseStyle,
        borderColor: '#4da6ff30',
      },
      icon: '💡',
      ...options,
    });
  },

  // Warning - Amber glow
  warning: (message, options = {}) => {
    return toast(message, {
      style: {
        ...baseStyle,
        borderColor: '#f59e0b30',
      },
      icon: '⚠️',
      duration: 4000,
      ...options,
    });
  },

  // Promise-based toast for async operations
  promise: (promise, messages, options = {}) => {
    return toast.promise(
      promise,
      {
        loading: messages.loading || 'Loading...',
        success: messages.success || 'Success!',
        error: messages.error || 'Something went wrong',
      },
      {
        style: baseStyle,
        success: {
          style: {
            ...baseStyle,
            borderColor: '#00d4aa30',
          },
          iconTheme: {
            primary: '#00d4aa',
            secondary: '#0a0a0a',
          },
        },
        error: {
          style: {
            ...baseStyle,
            borderColor: '#ef444430',
          },
          iconTheme: {
            primary: '#ef4444',
            secondary: '#0a0a0a',
          },
        },
        loading: {
          style: {
            ...baseStyle,
            borderColor: '#a855f730',
          },
        },
        ...options,
      }
    );
  },

  // Dismiss specific or all toasts
  dismiss: (toastId) => toast.dismiss(toastId),
  dismissAll: () => toast.dismiss(),
};

// Toaster configuration for App.jsx
export const toasterConfig = {
  position: 'bottom-right',
  gutter: 12,
  containerStyle: {
    bottom: 80, // Above the emergency button
  },
  toastOptions: {
    duration: 3000,
    style: baseStyle,
  },
};

export default ouraToast;
