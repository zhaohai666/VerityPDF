import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
  divider?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ open, position, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClickOutside]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  // Calculate position to keep menu within viewport
  const menuWidth = 200;
  const menuHeight = 200; // Approximate
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 10);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        backgroundColor: 'white',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '180px',
      }}
    >
      {items.map((item) => {
        if (item.children && item.children.length > 0) {
          // Submenu
          return (
            <div key={item.key} style={{ position: 'relative', margin: '4px 0' }}>
              <button
                className="context-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  // Toggle submenu (simplified - in reality you'd need state for this)
                  if (!item.disabled && item.onClick) {
                    item.onClick();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.4 : 1,
                  color: item.danger ? '#ff4d4f' : 'inherit',
                  fontSize: '14px',
                }}
              >
                {item.label}
                <span style={{ float: 'right', fontSize: '12px', opacity: 0.5 }}>▶</span>
              </button>
            </div>
          );
        }

        return (
          <div key={item.key} style={{ margin: '4px 0' }}>
            {item.divider ? (
              <div className="context-menu-divider" />
            ) : (
              <button
                className="context-menu-item"
                onClick={() => {
                  if (!item.disabled && item.onClick) {
                    item.onClick();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.4 : 1,
                  color: item.danger ? '#ff4d4f' : 'inherit',
                  fontSize: '14px',
                }}
              >
                {item.label}
              </button>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
};