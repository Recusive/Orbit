import type React from 'react';

/** Rounded square clip-path used for skill and marketplace avatars. */
export const OCTAGON_CLIP = 'inset(0 round 22%)';

/** Neutral face transform used for hover focus. */
export const REST_FLAT = 'rotateX(0deg) rotateY(0deg) translateZ(12px)';

/** Slightly tilted rest transform used when the generated face is initially flat. */
export const REST_TILT = 'rotateX(-15deg) rotateY(15deg) translateZ(12px)';

/**
 * Animate a Facehash avatar between rest and hover transforms.
 *
 * Uses the parent element hover events so the full row/tile can trigger
 * the effect, not only the avatar element itself.
 */
export const setFaceHover = (e: React.MouseEvent, hovered: boolean): void => {
  const face = e.currentTarget.querySelector('[data-facehash-face]');
  if (face instanceof HTMLElement) {
    const isFlatFace = face.dataset['flatFace'] === 'true';

    if (face.dataset['flatFace'] === undefined) {
      if (face.style.transform === REST_FLAT) {
        face.dataset['flatFace'] = 'true';
        face.style.transform = REST_TILT;
      } else {
        face.dataset['flatFace'] = 'false';
      }
    }

    if (hovered) {
      face.dataset['savedTransform'] = face.style.transform;
      face.style.transform = REST_FLAT;
    } else if (face.dataset['savedTransform']) {
      face.style.transform = isFlatFace ? REST_TILT : face.dataset['savedTransform'];
    }
  }
};
