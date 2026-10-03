/**
 * Where the crew's files are served from, ending in a slash: the models, and beside them
 * the textures (tex/) and the rooms' pictures (pic/). The crew sets it from its `models`.
 */
export let assets = '/robot/';

export function setAssets(base: string) {
  assets = base;
}
