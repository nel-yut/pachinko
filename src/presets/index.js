import { sampleSt } from './sample-st.js';
import { eva15 } from './eva15.js';
export const PRESETS = [sampleSt, eva15];
export const getPreset = (id) => PRESETS.find((p) => p.id === id);
