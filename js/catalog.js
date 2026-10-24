// Which cut-out pieces each layer may use.
// Names are "<sheet>/rRR_cCC" from art/pieces (made by tools/cut_sheets.py).
// Merged or messy cuts are left out on purpose.

const range = (sheet, row, from, to) => {
  const out = [];
  for (let c = from; c <= to; c++) out.push(`${sheet}/r${String(row).padStart(2, '0')}_c${String(c).padStart(2, '0')}`);
  return out;
};
const rows = (sheet, spec) => spec.flatMap(([row, from, to]) => range(sheet, row, from, to));

export const CATALOG = {
  farMountains: rows('09_far_mountains', [[0, 0, 0], [1, 0, 1], [2, 0, 0], [3, 0, 2], [4, 0, 1]]),
  nearMountains: [
    ...rows('08_near_mountains', [[0, 0, 1], [1, 0, 2], [2, 0, 1], [3, 0, 2], [4, 0, 1]]),
    ...rows('12_mountain_variations', [[0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1], [4, 1, 1]]),
  ],
  clouds: rows('04_clouds', [[0, 0, 4], [1, 0, 17]]),
  distantTrees: rows('07_distant_trees', [[0, 0, 13], [1, 0, 13], [2, 0, 14]]),
  distantBushes: rows('11_distant_bushes', [[0, 0, 6], [1, 0, 6], [2, 0, 4], [3, 0, 4], [4, 0, 5]]),
  midTrees: [
    ...rows('02_acacia_trees', [[1, 0, 3], [2, 0, 4]]),
    ...rows('03_baobab_trees', [[1, 0, 1], [2, 0, 4]]),
    ...rows('24_trees_c', [[0, 0, 1], [1, 0, 1]]),
  ],
  // two trees growing together (cut as one piece)
  treePairs: ['02_acacia_trees/r00_c01', '03_baobab_trees/r00_c00', '03_baobab_trees/r01_c02'],
  // big sharp pictures from the second art set (art/pieces/layers_props)
  termiteMounds: ['layers_props/13_rock_terracotta_mound'],
  rocks: [...rows('01_rocks_and_bushes', [[1, 0, 10], [3, 0, 0], [3, 2, 2], [3, 5, 5], [3, 10, 14]]), 'layers_props/13_rock_boulder'],
  bushes: rows('01_rocks_and_bushes', [[2, 0, 8], [3, 1, 1], [3, 3, 4], [3, 6, 9], [3, 15, 16]]),
  grassPatches: rows('05_grass_and_bush_patches', [[1, 1, 3], [2, 0, 10], [3, 0, 8], [4, 2, 2]]),
  grassStrips: rows('05_grass_and_bush_patches', [[0, 0, 1], [1, 0, 0], [4, 0, 1]]),
  grassMounds: rows('06_grass_only', [[3, 0, 3], [4, 0, 7], [5, 0, 8]]),
  greyRocks: rows('34_grey_rocks', [[0, 0, 2], [1, 0, 2], [2, 0, 2], [3, 0, 4], [4, 0, 4]]),
  lakes: rows('33_lake', [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]),
  reeds: rows('33_lake', [[4, 0, 5]]),
  suns: rows('32_sun', [[0, 0, 1], [1, 0, 0]]),
  huts: ['10_huts_and_fences/r00_c00', '10_huts_and_fences/r00_c02', '10_huts_and_fences/r00_c06'],
  fences: ['10_huts_and_fences/r00_c01', '10_huts_and_fences/r00_c03', '10_huts_and_fences/r00_c05'],
  // r01_c00 left out: a loose fence row was cut in with it and floated above the huts
  hutGroups: ['10_huts_and_fences/r01_c01', '10_huts_and_fences/r01_c02'],
  bigTrees: [
    ...rows('22_trees_a', [[0, 0, 1], [1, 0, 1]]),
    ...rows('23_trees_b', [[0, 0, 1]]),
    ...rows('25_trees_d', [[0, 0, 1], [1, 0, 1]]),
    '02_acacia_trees/r00_c00',
    '03_baobab_trees/r00_c01',
    ...rows('24_trees_c', [[0, 0, 1], [1, 0, 1]]),
    'layers_props/10_tree_baobab', 'layers_props/11_tree_acacia_big', 'layers_props/12_tree_acacia_small',
  ],
};

// The drawn walking / grazing animals are gone: 3D models take their place (models3d.js). Birds stay drawn.
export const BIRD = { frames: range('31_bird_flap', 0, 0, 7) };   // birds fly with their own lane

export function allPieceNames() {
  const names = new Set();
  Object.values(CATALOG).forEach((list) => list.forEach((n) => names.add(n)));
  BIRD.frames.forEach((n) => names.add(n));
  return [...names];
}
