/**
 * Where the crew's files are served from, ending in a slash: the models, and beside them
 * the textures (tex/) and the rooms' pictures (pic/). The crew sets it from its `models`.
 */
export let assets = '/robot/';

export function setAssets(base: string) {
  assets = base;
}

/** Where a file named in a registry is: a name under the models folder ('mole.glb',
 * 'pic/library.webp'), or a whole address ('https://…', '/…'), left as it is. */
export function assetUrl(file: string) {
  return /^([a-z][a-z\d+.-]*:|\/)/i.test(file) ? file : assets + file;
}
