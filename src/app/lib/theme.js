// Colours shared by the staff pages, for light and dark mode. Each page
// spreads these and adds or changes only what is its own:
//
//   function T(dark) { return { ...baseTheme(dark), dropzone: … }; }
//
// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
export function baseTheme(dark) {
  return {
    pageBg:               dark ? "bg-[#111815]"        : "bg-slate-200",
    cardBg:               dark ? "bg-[#1b2420]/50"     : "bg-slate-100/90",
    cardBorder:           dark ? "border-slate-800/60"  : "border-slate-300",
    textPrimary:          dark ? "text-white"           : "text-slate-900",
    textSub:              dark ? "text-slate-500"       : "text-slate-600",
    textMuted:            dark ? "text-slate-600"       : "text-slate-500",
    divider:              dark ? "border-slate-800/40"  : "border-slate-300",
    iconBtn:              dark ? "bg-[#1b2420] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    inputBg:              dark ? "bg-[#1b2420]"        : "bg-slate-50",
    inputBorder:          dark ? "border-slate-800"     : "border-slate-400",
    emptyIcon:            dark ? "text-slate-700"       : "text-slate-400",
    inputText:            dark ? "text-slate-200"       : "text-slate-800",
    rowHover:             dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-100/60",
    innerCard:            dark ? "bg-slate-900/50"      : "bg-slate-200",
    modalBg:              dark ? "bg-[#1b2420]"        : "bg-slate-50",
    modalBorder:          dark ? "border-slate-700"     : "border-slate-300",
    cancelBtn:            dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-300 hover:bg-slate-400 text-slate-900",
    dashed:               dark ? "border-slate-800"     : "border-slate-400",
    tabBar:               dark ? "bg-[#1b2420]/60 border-slate-800" : "bg-slate-100/90 border-slate-300",
    tabInactive:          dark ? "text-slate-500 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
    filterInactive:       dark ? "bg-[#1b2420] border-slate-800 text-slate-500 hover:text-slate-200" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    tableHeadBg:          dark ? "bg-slate-900/50"      : "bg-slate-200",
    hoverRow:             dark ? "hover:bg-slate-800/20" : "hover:bg-slate-200",
    deepCard:             dark ? "bg-slate-900/60"      : "bg-slate-200",
    innerBorder:          dark ? "border-slate-800/40"  : "border-slate-300",
    uploadBorder:         uploadZone(dark),
    uploadBorderDisabled: dark ? "border-slate-700 text-slate-600" : "border-slate-400 text-slate-500",
    menuBg:               dark ? "bg-[#1b2420] border-slate-700" : "bg-slate-50 border-slate-300",
    menuHover:            dark ? "hover:bg-slate-800"    : "hover:bg-slate-200",
  };
}

// Every "add a file" control (Training handouts, Assistant documents, Bible
// verses PDF, member import, receipts, sign-in sheet photos): tinted in the
// brand green with a strong outline so it stands out from the form around
// it, and a ring when reached with Tab (the file input inside is sr-only,
// not hidden, so the keyboard can reach it).
export function uploadZone(dark) {
  return dark
    ? "border-blue-400/70 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 hover:border-blue-300 focus-within:ring-2 focus-within:ring-blue-400/60"
    : "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/40";
}
