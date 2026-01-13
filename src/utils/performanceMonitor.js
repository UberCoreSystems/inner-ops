/**
 * Performance Monitoring Utility
 * Tracks component renders and identifies performance bottlenecks
 */

import logger from './logger';

class PerformanceMonitor {
  constructor() {
    this.renderCounts = new Map();
    this.renderTimes = new Map();
    this.isEnabled = import.meta.env.DEV;
  }

  /**
   * Track component render
   * Usage: useEffect(() => { performanceMonitor.trackRender('ComponentName'); }, []);
   */
  trackRender(componentName) {
    if (!this.isEnabled) return;

    const count = this.renderCounts.get(componentName) || 0;
    this.renderCounts.set(componentName, count + 1);

    if (count > 10) {
      logger.warn(`⚠️ ${componentName} has rendered ${count + 1} times - consider memoization`);
    }
  }

  /**
   * Track component render time
   */
  startMeasure(componentName) {
    if (!this.isEnabled) return;
    this.renderTimes.set(componentName, performance.now());
  }

  endMeasure(componentName) {
    if (!this.isEnabled) return;

    const startTime = this.renderTimes.get(componentName);
    if (startTime) {
      const duration = performance.now() - startTime;
      if (duration > 16) {
        // Longer than one frame (60fps)
        logger.warn(`⚠️ ${componentName} took ${duration.toFixed(2)}ms to render (>16ms frame budget)`);
      }
      this.renderTimes.delete(componentName);
    }
  }

  /**
   * Get render statistics
   */
  getStats() {
    if (!this.isEnabled) return null;

    const stats = {};
    this.renderCounts.forEach((count, name) => {
      stats[name] = count;
    });
    return stats;
  }

  /**
   * Print performance report
   */
  printReport() {
    if (!this.isEnabled) return;

    logger.log('📊 Performance Report:');
    const stats = this.getStats();
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    
    sorted.forEach(([name, count]) => {
      const emoji = count > 20 ? '🔴' : count > 10 ? '🟡' : '🟢';
      logger.log(`${emoji} ${name}: ${count} renders`);
    });
  }

  /**
   * Reset all tracking
   */
  reset() {
    this.renderCounts.clear();
    this.renderTimes.clear();
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Add to window for debugging
if (typeof window !== 'undefined') {
  window.performanceMonitor = performanceMonitor;
}

export default performanceMonitor;

/**
 * React Hook for tracking renders
 * Usage: useRenderTracking('ComponentName');
 */
export function useRenderTracking(componentName) {
  if (import.meta.env.DEV) {
    performanceMonitor.trackRender(componentName);
  }
}

/**
 * HOC for tracking component renders
 */
export function withRenderTracking(Component, componentName) {
  return React.memo(function TrackedComponent(props) {
    useRenderTracking(componentName || Component.displayName || Component.name);
    return <Component {...props} />;
  });
}
