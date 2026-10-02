import type { FXPlugin } from '../core/types';
import { eqPlugin } from './EQ';
import { saturationPlugin } from './Saturation';
import { tapePlugin } from './Tape';
import { delayPlugin } from './Delay';
import { stereoPlugin } from './Stereo';
import { reverbPlugin } from './Reverb';
import { shimmerPlugin } from './Shimmer';
import { vinylPlugin } from './Vinyl';
import { compressorPlugin, limiterPlugin } from './Dynamics';

/** All built-in FX plugins. */
export function builtinFXPlugins(): FXPlugin[] {
  return [
    eqPlugin,
    saturationPlugin,
    tapePlugin,
    delayPlugin,
    stereoPlugin,
    reverbPlugin,
    shimmerPlugin,
    vinylPlugin,
    compressorPlugin,
    limiterPlugin,
  ];
}
