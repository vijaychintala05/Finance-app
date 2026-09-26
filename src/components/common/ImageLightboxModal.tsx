import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Download, FileImage, Maximize2, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title: string;
  byteSize?: number;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  byteSize,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Reset transforms whenever opening or image changes
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, imageUrl]);

  // Keyboard navigation: Escape closes, +, -, 0, r
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setScale((prev) => Math.min(3, +(prev + 0.25).toFixed(2)));
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setScale((prev) => Math.max(0.5, +(prev - 0.25).toFixed(2)));
      } else if (event.key === '0') {
        event.preventDefault();
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        setRotation((prev) => (prev + 90) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = () => setScale((prev) => Math.min(3, +(prev + 0.25).toFixed(2)));
  const handleZoomOut = () => setScale((prev) => Math.max(0.5, +(prev - 0.25).toFixed(2)));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const downloadLink = document.createElement('a');
    downloadLink.href = imageUrl;
    downloadLink.download = title || 'receipt-image';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [imageUrl, title]);

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      setScale((prev) => Math.min(3, +(prev + 0.15).toFixed(2)));
    } else {
      setScale((prev) => Math.max(0.5, +(prev - 0.15).toFixed(2)));
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      handleReset();
    }
  };

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt Preview: ${title}`}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/90 backdrop-blur-md select-none animate-in fade-in duration-150"
      onMouseUp={handleMouseUp}
    >
      {/* Top Header / Action Toolbar */}
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white" title={title}>
              {title}
            </p>
            {byteSize !== undefined && byteSize > 0 && (
              <p className="text-[11px] text-slate-400">
                {(byteSize / 1024).toFixed(0)} KB • JPG/PNG/WebP
              </p>
            )}
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 text-xs font-mono font-medium text-slate-200 hover:text-white cursor-pointer"
              title="Reset zoom (0)"
              aria-label="Reset zoom to 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Rotate control */}
          <button
            type="button"
            onClick={handleRotate}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            title="Rotate 90° clockwise (R)"
            aria-label="Rotate image"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          {/* Reset / Fit control */}
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            title="Fit to view (0)"
            aria-label="Fit to view"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 cursor-pointer"
            title="Download image"
            aria-label="Download image"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer ml-1"
            title="Close (Esc)"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Preview Canvas */}
      <div
        className={`relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8 ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          className="relative max-h-full max-w-full flex items-center justify-center select-none"
        >
          <img
            src={imageUrl}
            alt={title}
            draggable={false}
            className="max-h-[82vh] max-w-[90vw] rounded-md object-contain shadow-2xl ring-1 ring-white/10"
          />
        </div>

        {/* Subtle Hint Bar at Bottom */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-900/75 px-4 py-1.5 text-[11px] text-slate-300 backdrop-blur-md">
          Scroll to zoom • Double-click to toggle fit • Drag to pan when zoomed
        </div>
      </div>
    </div>
  );
};
