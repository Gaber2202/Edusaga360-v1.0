import { logError } from './ErrorLogger';

// Track consecutive errors to prevent infinite loops
const errorTracker = {
  count: 0,
  lastErrorTime: null,
  resetWindow: 5000, // 5 second reset window
};

export function resetErrorTracker() {
  errorTracker.count = 0;
  errorTracker.lastErrorTime = null;
}

export async function handleApiError(error, context = {}) {
  const now = Date.now();
  
  // Reset counter if outside reset window
  if (errorTracker.lastErrorTime && now - errorTracker.lastErrorTime > errorTracker.resetWindow) {
    errorTracker.count = 0;
  }
  
  errorTracker.count++;
  errorTracker.lastErrorTime = now;
  
  // Log to system error if count is reasonable
  if (errorTracker.count <= 10) {
    await logError({
      page: context.page || window.location.pathname,
      module: context.module || 'api',
      action: context.action || 'api_call',
      error,
      severity: error.status >= 500 ? 'high' : 'medium'
    });
  }
  
  const status = error?.status || error?.response?.status;
  
  // Handle auth errors
  if (status === 401 || status === 403) {
    // Don't redirect - just show session expired message
    sessionStorage.setItem('session_expired', 'true');
    sessionStorage.setItem('session_expired_time', new Date().toISOString());
    return {
      isSessionExpired: true,
      message: 'Session expired. Please log in again.',
      messageAr: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.'
    };
  }
  
  // Handle server errors with safe retry
  if (status >= 500) {
    return {
      isServerError: true,
      message: 'Server error. Please try again later.',
      messageAr: 'خطأ في الخادم. يرجى المحاولة لاحقاً.',
      status
    };
  }
  
  // Handle network errors
  if (!status || error.message === 'Network Error') {
    return {
      isNetworkError: true,
      message: 'Network connection error. Please check your connection.',
      messageAr: 'خطأ في الاتصال. يرجى التحقق من اتصالك بالإنترنت.'
    };
  }
  
  // Generic error
  return {
    isGenericError: true,
    message: error?.message || 'An error occurred',
    messageAr: 'حدث خطأ ما'
  };
}

export function shouldShowErrorBoundary() {
  // If too many errors in short time, show error boundary
  return errorTracker.count > 15;
}

export function getErrorSummary() {
  return {
    totalErrors: errorTracker.count,
    lastErrorTime: errorTracker.lastErrorTime,
    isInErrorLoop: errorTracker.count > 10
  };
}