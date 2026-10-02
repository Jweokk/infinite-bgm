import type { InstrumentPlugin } from '../core/types';
import { electricPianoPlugin } from './ElectricPiano';
import { bassPlugin } from './BassSynth';
import { kickPlugin } from './KickSynth';
import { snarePlugin } from './SnareSynth';
import { hatPlugin } from './HatSynth';
import { bellPlugin, bowlPlugin } from './BellSynth';
import { dronePlugin } from './DroneSynth';
import { pluckPlugin } from './PluckSynth';
import { noiseTexturePlugin } from './NoiseTextureSynth';
import { superSawPlugin } from './SuperSaw';
import { feltPianoPlugin } from './FeltPiano';
import { chipSynthPlugin } from './ChipSynth';

/** All built-in instrument plugins. */
export function builtinInstrumentPlugins(): InstrumentPlugin[] {
  return [
    electricPianoPlugin,
    bassPlugin,
    kickPlugin,
    snarePlugin,
    hatPlugin,
    bellPlugin,
    bowlPlugin,
    dronePlugin,
    pluckPlugin,
    noiseTexturePlugin,
    superSawPlugin,
    feltPianoPlugin,
    chipSynthPlugin,
  ];
}
