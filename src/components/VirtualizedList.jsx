
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { throttleInput } from '../utils/performanceUtils';

const VirtualizedList = ({ 
  items, 
  renderItem, 
  itemHeight = 200, 
  containerHeight = 400,
  overscan = 2,
  maxHeight
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const finalHeight = maxHeight || containerHeight;

  const throttledSetScrollTop = useMemo(
    () => throttleInput((scrollTop) => setScrollTop(scrollTop), 16),
    []
  );

  const visibleRange = useMemo(() => {
    const viewportStart = scrollTop;
    const viewportEnd = scrollTop + finalHeight;

    const startIndex = Math.max(0, Math.floor(viewportStart / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil(viewportEnd / itemHeight) + overscan
    );

    return { startIndex, endIndex };
  }, [scrollTop, finalHeight, itemHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    const { startIndex, endIndex } = visibleRange;

    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      virtualIndex: startIndex + index,
      style: {
        position: 'absolute',
        top: (startIndex + index) * itemHeight,
        width: '100%',
        height: itemHeight,
        transform: 'translateZ(0)' // Force GPU acceleration
      }
    }));
  }, [items, visibleRange, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e) => {
    throttledSetScrollTop(e.target.scrollTop);
  }, [throttledSetScrollTop]);

  return (
    <div
      ref={containerRef}
      style={{ 
        height: finalHeight, 
        overflow: 'auto',
        willChange: 'scroll-position'
      }}
      onScroll={handleScroll}
      className="relative"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ item, virtualIndex, style }) => (
          <div key={item.id || virtualIndex} style={style}>
            {renderItem({ item, index: virtualIndex })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VirtualizedList;
