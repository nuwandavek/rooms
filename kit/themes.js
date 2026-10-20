import almanac from './themes/almanac.json' with {type:'json'};
import drafting from './themes/drafting.json' with {type:'json'};
import riso from './themes/riso.json' with {type:'json'};

// UI tokens come from Artifactbin. Material and lighting values are Home3D's
// interpretation of those palettes, not specifications of a real home.
const tokens = spec => Object.fromEntries(spec.tokens.map(t => [t.name, t.light]));
const a = tokens(almanac), d = tokens(drafting), r = tokens(riso);
export const themes = {
  riso: {
    spec:riso,
    ui:{paper:r.paper,sheet:r.sheet,ink:r.key,muted:r['key-2'],line:r.line,
      accent:r.blue,selected:r['blue-soft'],onAccent:r['on-blue'],pink:r.pink,yellow:r.yellow},
    materials:{wall:r.sheet,slab:'#c8bfa9',floor:'#e9dfc6',wet:'#cfe6f5',
      balcony:'#edcddd',selected:'#f5e790',frame:r.key,door:'#c7aa80',
      glass:'#acd2e6',ground:r.paper,duct:'#b2b8cb'},
    light:{sky:'#fff8e9',bounce:'#b0a8a1',sun:'#fff1db',fill:'#dcecff',
      ambient:2.5,intensity:3,exposure:1.05,position:[-8,18,10]},
  },
  almanac: {
    spec: almanac,
    ui: { paper:a.paper, sheet:a.card, ink:a.ink, muted:a['ink-muted'], line:a.line,
      accent:a.accent, selected:a['accent-soft'], onAccent:a['on-accent'] },
    materials: { wall:a.card, slab:'#c9baa3', floor:'#e4d4bc', wet:'#c8d1bf',
      balcony:'#d6c8ad', selected:'#dbc1a6', frame:a.ink, door:'#bda07a',
      glass:'#c1d5cf', ground:a.paper, duct:'#aeb69c' },
    light: { sky:'#fff7e8', bounce:'#a6a58b', sun:'#fff0d8', fill:'#e8f0f5',
      ambient:2.4, intensity:3.1, exposure:1.05, position:[-8,18,10] },
  },
  drafting: {
    spec: drafting,
    ui: { paper:d.vellum, sheet:d['vellum-raised'], ink:d.ink, muted:d['ink-muted'], line:d.grid,
      accent:d.cobalt, selected:d['cobalt-soft'], onAccent:d['on-cobalt'] },
    materials: { wall:d['vellum-raised'], slab:'#b9bdc3', floor:'#dce0e4', wet:'#c5d1de',
      balcony:'#d0d5da', selected:d['cobalt-soft'], frame:'#4a4f58', door:'#b5bdc5',
      glass:'#b8d1eb', ground:d.vellum, duct:'#a3adba' },
    light: { sky:'#f7f9ff', bounce:'#a6aebb', sun:'#ffffff', fill:'#dce8ff',
      ambient:2.8, intensity:2.5, exposure:1.05, position:[-6,20,8] },
  },
};

export function applyTheme(name = 'riso') {
  const theme = themes[name];
  if (!theme) throw new Error(`Unknown theme: ${name}`);
  document.documentElement.dataset.theme = name;
  for (const [key,value] of Object.entries(theme.ui))
    document.documentElement.style.setProperty(`--${key}`, value);
  for (const [key,value] of Object.entries(theme.spec.families))
    document.documentElement.style.setProperty(`--font-${key}`, value);
  return theme;
}
