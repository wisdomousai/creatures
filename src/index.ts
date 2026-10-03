/**
 * The crew as a package (@wisdomousai/creatures): what a page needs to bring them on, and
 * the names to call them and their things by. The playground (art/robot/playground) uses
 * nothing else, so what it does any page can.
 */
import { VERSION } from './version';

export { Crew, ROSTER, readFrame, type CrewOptions, type Fixture, type Member } from './crew';
export { Character, type Act, type Edge, type Frame, type Role, type Spec } from './character';
export { CARDS, PLAYGROUNDS, SECTIONS, inFamily, type Card, type Family } from './families';
export { LOOKS, type FlameStyle, type LookName } from './looks';
/** The set pieces there are, and which come out on each page (see Crew.page). */
export { SET, SET_PAGES } from './set';
/** The hangings there are, and which hang on each page. */
export { DECOR, PAGES } from './decor';
/** The games there are, and which are played on each page. */
export { GAMES } from './play';
export { VERSION };

/** The models (and their textures and pictures) of this version, served by jsDelivr from
 * npm: pass it as `models`, or copy the package's models/ folder and serve it yourself. */
export const MODELS = `https://cdn.jsdelivr.net/npm/@wisdomousai/creatures@${VERSION}/models/`;
