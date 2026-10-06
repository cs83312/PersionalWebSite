// Bolt colors live in globals.css (--lightning-core / --lightning-glow) so they
// follow the site theme like every other color. The fallback is the dark
// palette, used if the variables are somehow missing.
export interface LightningColors {
  core: string;
  glow: string;
}

const FALLBACK: LightningColors = { core: '#fff7ee', glow: '#f6a965' };

export function readLightningColors(style: { getPropertyValue(name: string): string }): LightningColors {
  return {
    core: style.getPropertyValue('--lightning-core').trim() || FALLBACK.core,
    glow: style.getPropertyValue('--lightning-glow').trim() || FALLBACK.glow,
  };
}
