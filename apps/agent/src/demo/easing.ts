export type EasingFn = (t: number) => number;

export const easeOutCubic: EasingFn = (t) => 1 - (1 - t) ** 3;

export const easeInOutCubic: EasingFn = (t) => {
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  return 1 - (-2 * t + 2) ** 3 / 2;
};

export const easeOutQuint: EasingFn = (t) => 1 - (1 - t) ** 5;
