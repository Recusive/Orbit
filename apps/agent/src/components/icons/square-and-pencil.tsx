/**
 * SquareAndPencil — SF Symbol "square.and.pencil"
 * A rounded square with a diagonal pencil overlapping the top-right corner.
 * Used as the "compose / new" action icon.
 *
 * Uses the actual SF Symbol rasterised as a PNG mask so the result is
 * pixel-identical to the native macOS icon. `background-color: currentcolor`
 * lets it inherit the parent text color for automatic light/dark theming.
 */
import { forwardRef } from 'react';

import type { CSSProperties, HTMLAttributes } from 'react';

/* ---------- base64 mask (46 × 48 px source) ---------- */
const MASK_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAwCAYAAABuZUjcAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAAC6gAwAEAAAAAQAAADAAAAAA52jk4QAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAA0dJREFUaAXtmEuIz1EUx2eG5DGR8ZammTyKlJSNlCTlXVYeG0ORQsmCkmyEhYVXFhYzO0WR12LIIxKNxSzE7BTNlCSyoGa8Bp9vzanzvzPzm9+T1O/Ut3vO/Z1z7vd/fmfu796pqiqlrEBZgbICZQXKCuRfgXGkvAgegXngv5BaWLaB3314zVgDKqTfRMXTf2NUs6xg0oAyxgwbh5sScxyG3xRQB6RnkW6C3wKNEnFZAe6A1eAhWADOgi8glSwj6hb4DOwVZh2vk8sKpzd/GfwCTUAyCZwAqbpCVT0PspIM41XVEUCitmgB5vMTfTPIJMeItoR5jY/JOdqxUiuEuVvd8wFV/0cQOjQy8Qr4Xu7CvgE0qjJJ5T0B18D3vkC1wqE+3YYnKCuB9b7Nxx6P4+krcQnbXm/sJBGOIuzzS28HYyNiYj16ipclVqVGxYqK57TX5bY1XjI3IV54tJfIWtLmaNdET7fjrd3DcmtUS04FJktMSTP+IMiSH06TYICYjcz1urzK3wnqgckelNNmpBmNtMYDaRIEMeuw9Ufp877Dnu38mtD1NrQFpxa/QFbiy2HRA3zOj9jzHbs16Nqp5DMk8RoXWJS6mMT66o50C+gLvAp0uLlz6H7rdY/6q0UTX8iSt4E/JGl/XgvagRf7/Pu5QfUiiescfRfobG3yDWUD0EcmkxRFfCas7oGJjp36d1PfvJtOpxZBfAZU7oPpjpJ2iq3gppvLpOZNfDJsHoCGgNUubB0ZcpO8iV+B2ZyA3X7s5mAus5kn8UWwWRowOoJ9JpjLxcyT+L6A0UlsnecLkUR7ZwQD3UN1DpGox0+BVhlFSV7EdaNpARfAi6LI+rx5EX9D0t0+cdF6nj1eNNeK/CXxinKkM6qThEVVXAcikzzvm5YzHP0aX8OHoR1F/JNznuv0IlQdxvyBzK894HpRxDtcxHp07dVFyQ4S+1bxayde8yAR/qr1DLs+cZahA7bgotawtaSPHyrM/8rQV//j6AT+9qLLbhvoAjpfZ5FagnVDmhUk0YFsZzCX2NxGhFXib4wqSF1iloME6Nf3gKKJP2eNxkE4pJ6eRuRRoDb5AHpB1h/STQ614lWgPo99w8e3lLICcSvwB/6KGv1XVjiUAAAAAElFTkSuQmCC';

/** Source PNG aspect ratio: 46 wide × 48 tall */
const ASPECT = 46 / 48;

interface SquareAndPencilProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const SquareAndPencil = forwardRef<HTMLDivElement, SquareAndPencilProps>(
  ({ size = 16, className, style, ...props }, ref) => {
    const height = size;
    const width = size * ASPECT;

    const maskStyle: CSSProperties = {
      width,
      height,
      backgroundColor: 'currentcolor',
      maskImage: `url("${MASK_SRC}")`,
      maskSize: '100% 100%',
      maskRepeat: 'no-repeat',
      WebkitMaskImage: `url("${MASK_SRC}")`,
      WebkitMaskSize: '100% 100%',
      WebkitMaskRepeat: 'no-repeat',
      flexShrink: 0,
      ...style,
    };

    return <div ref={ref} aria-hidden="true" className={className} style={maskStyle} {...props} />;
  }
);

SquareAndPencil.displayName = 'SquareAndPencil';

export { SquareAndPencil };
