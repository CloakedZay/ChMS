// One color per user level / church role, used everywhere a level is shown
// (Users, Members, Messages), so a person's level reads at a glance:
//
//   Admin  brick red    Pastor    gold      Leader  forest green
//   Finance teal        Secretary plum      Member  stone gray
//   Volunteer terracotta
//
// Fixed hex classes on purpose — the theme remaps the named Tailwind colors
// (blue → green, violet → gold…), which would make several levels look alike.
// (Full literal class strings below so Tailwind's scanner can find them.)

const LEVELS = {
  admin: {
    light: 'bg-[#b03c3c]/10 text-[#9c2f2f] border-[#b03c3c]/25',
    dark:  'bg-[#e07a7a]/15 text-[#f0a0a0] border-[#e07a7a]/30',
    dot:   'bg-[#b03c3c]',
  },
  pastor: {
    light: 'bg-[#c5a66a]/20 text-[#7a6234] border-[#c5a66a]/50',
    dark:  'bg-[#c5a66a]/15 text-[#dcc88f] border-[#c5a66a]/35',
    dot:   'bg-[#c5a66a]',
  },
  leader: {
    light: 'bg-[#173f35]/10 text-[#173f35] border-[#173f35]/25',
    dark:  'bg-[#6aa183]/15 text-[#8fcaa8] border-[#6aa183]/35',
    dot:   'bg-[#2f6b57]',
  },
  finance: {
    light: 'bg-[#2b7a78]/10 text-[#1f5f5d] border-[#2b7a78]/30',
    dark:  'bg-[#5fb8b3]/15 text-[#8fd6d1] border-[#5fb8b3]/35',
    dot:   'bg-[#2b7a78]',
  },
  secretary: {
    light: 'bg-[#7a5c8f]/10 text-[#62467a] border-[#7a5c8f]/30',
    dark:  'bg-[#b79bd0]/15 text-[#cdb7e0] border-[#b79bd0]/35',
    dot:   'bg-[#7a5c8f]',
  },
  member: {
    light: 'bg-[#858b87]/12 text-[#4c534f] border-[#858b87]/30',
    dark:  'bg-[#b6bab6]/10 text-[#b6bab6] border-[#b6bab6]/25',
    dot:   'bg-[#858b87]',
  },
  volunteer: {
    light: 'bg-[#b9703a]/10 text-[#8f5326] border-[#b9703a]/30',
    dark:  'bg-[#e0a070]/15 text-[#ecb98f] border-[#e0a070]/35',
    dot:   'bg-[#b9703a]',
  },
};

const key = (level) => (LEVELS[String(level || '').toLowerCase()] ? String(level).toLowerCase() : 'member');

// Classes for a pill: background, text and border for the current theme.
export function levelBadge(level, dark) {
  return LEVELS[key(level)][dark ? 'dark' : 'light'];
}

// Class for a small solid dot in the level's color.
export function levelDot(level) {
  return LEVELS[key(level)].dot;
}
