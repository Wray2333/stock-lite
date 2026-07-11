import type { Theme } from '../../types/market';

interface Props {
  theme: Theme;
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 14.6A7.4 7.4 0 0 1 9.4 3a8.8 8.8 0 1 0 11.6 11.6Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Zm0-3.2a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17.9a1 1 0 0 1 1 1V22a1 1 0 1 1-2 0v-1.1a1 1 0 0 1 1-1Zm10-8.9a1 1 0 0 1-1 1h-1.1a1 1 0 1 1 0-2H21a1 1 0 0 1 1 1ZM5.1 12H4a1 1 0 1 1 0-2h1.1a1 1 0 1 1 0 2Zm13.3-7.8a1 1 0 0 1 0 1.4l-.8.8a1 1 0 1 1-1.4-1.4l.8-.8a1 1 0 0 1 1.4 0ZM7.8 16.2a1 1 0 0 1 0 1.4l-.8.8A1 1 0 0 1 5.6 17l.8-.8a1 1 0 0 1 1.4 0Zm10.6 2.2a1 1 0 0 1-1.4 0l-.8-.8a1 1 0 0 1 1.4-1.4l.8.8a1 1 0 0 1 0 1.4ZM7.8 6.4a1 1 0 0 1-1.4 0l-.8-.8A1 1 0 0 1 7 4.2l.8.8a1 1 0 0 1 0 1.4Z" />
        </svg>
      )}
    </button>
  );
}
