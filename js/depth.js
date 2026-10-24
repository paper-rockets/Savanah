// One rule for distance, used by everything that stands on the ground.
//
// The ground is flat and seen from a fixed height, so how far below the
// horizon a thing stands on screen ("d") tells how near it is:
//   - its size grows in step with d (twice as far down = twice as big)
//   - its sliding speed grows in step with d (that is what makes the parallax)
//   - far things fade towards the sky colour
// Because size and speed come from the same number, a zebra and a tree
// standing at the same spot always match in size and move together.

export const HORIZON = -110;          // screen height of the horizon line
export const FRONT_D = 250;           // d of the very bottom of the screen: moves at full speed
export const UNITS_PER_METRE_PER_D = 0.36;   // a 1 m tall thing at d = 100 is 36 units tall

export const depthOf = (y) => Math.max(0.5, HORIZON - y);
export const yAt = (d) => HORIZON - d;
export const unitsPerMetre = (y) => depthOf(y) * UNITS_PER_METRE_PER_D;
export const speedShare = (y) => depthOf(y) / FRONT_D;
// pale near the horizon, fading off quickly so herds in the middle distance keep their colours
export const hazeAt = (y) => 0.42 * Math.max(0, 1 - depthOf(y) / 130) ** 2;

// how flat a round shadow on the ground looks (height / width)
export const shadowSquash = (y) => 0.05 + 0.22 * Math.min(1, depthOf(y) / FRONT_D);

// draw order: further away first; flat ground marks and shadows under everything standing
export const LAYER = { sun: 500, clouds: 1000, farHills: 2000, nearHills: 3000, ground: 4000, groundMarks: 4500, shadows: 5000, standing: 6000, birds: 20000 };
export const standingOrder = (y) => LAYER.standing + Math.round(depthOf(y) * 20);
