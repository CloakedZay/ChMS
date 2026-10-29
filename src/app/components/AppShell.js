'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStoredValue } from '@/app/lib/useStoredValue';
import { supabase } from '@/app/lib/supabase';
import { avatarUrl } from '@/app/lib/avatar';
import {
  LogOut, Menu, PanelLeftClose, PanelLeftOpen, ChevronRight,
  ChevronDown, Sun, Moon, X,
} from 'lucide-react';

// The shared frame for the staff dashboard and the member portal: a deep-green
// sidebar (grouped navigation, gold marker on the active page), a sticky top bar
// (menu button, breadcrumbs, user menu) and the page content.
//
// Colors here use fixed hex classes on purpose: the .member-light rules in
// globals.css remap the slate / white utility classes used by the member pages,
// and the sidebar should stay green in both themes.
//
//   groups  — [{ label, links: [{ href, icon, label }] }] (already filtered by access)
//   menuLinks — extra items in the user menu: [{ href, icon, label }]

export default function AppShell({
  dark, portalLabel, subLabel, homeHref, groups, user, roleLabel,
  onSignOut, menuLinks = [], themeToggle, children,
}) {
  const pathname = usePathname();
  // The drawer and the user menu belong to the page they were opened on,
  // so they close by themselves when the page changes.
  const [drawerOn, setDrawerOn] = useState(null);     // phone / tablet drawer
  const [menuOn, setMenuOn] = useState(null);
  const drawer = drawerOn === pathname;
  const userMenu = menuOn === pathname;
  const setDrawer = (open) => setDrawerOn(open ? pathname : null);
  const setUserMenu = (open) => setMenuOn((v) => ((typeof open === 'function' ? open(v === pathname) : open) ? pathname : null));
  // Desktop icon-only rail, remembered in this browser.
  const [sidebar, setSidebar] = useStoredValue('faithsync-sidebar', 'open');
  const collapsed = sidebar === 'collapsed';
  const menuRef = useRef(null);

  useEffect(() => {
    if (!userMenu) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOn(null); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOn(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [userMenu]);

  function toggleCollapsed() {
    setSidebar(collapsed ? 'open' : 'collapsed');
  }

  const allLinks = groups.flatMap((g) => g.links);
  const current = allLinks.find((l) => l.href === pathname);
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '··';
  // Profile photo (db/097), refreshed when it's changed on My Profile.
  const [avatar, setAvatar] = useState(null);
  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from('profiles').select('avatar_path').eq('id', user.id).single()
      .then(({ data }) => setAvatar(avatarUrl(data?.avatar_path)));
    load();
    window.addEventListener('faithsync-avatar', load);
    return () => window.removeEventListener('faithsync-avatar', load);
  }, [user]);

  // On desktop the labels hide when collapsed; in the phone drawer they always show.
  const label = collapsed ? 'lg:hidden' : '';

  const sidebarBg = dark ? 'bg-[#0c1311]' : 'bg-[#173f35]';
  const topBg = dark ? 'bg-[#111815]/85 border-white/10' : 'bg-[#f8f7f2]/85 border-[#e5e3d8]';
  const topText = dark ? 'text-[#e9ece9]' : 'text-[#173f35]';
  const topMuted = dark ? 'text-[#858b87]' : 'text-[#858b87]';
  const iconBtn = dark
    ? 'border-white/10 text-[#b6bab6] hover:bg-white/5'
    : 'border-[#d9d6c8] text-[#4c534f] hover:bg-white';

  return (
    <div className={`min-h-screen ${dark ? 'bg-[#111815]' : 'bg-[#f8f7f2]'}`}>

      {/* Keyboard users jump past the menu; hidden until it gets focus (first Tab). */}
      <a href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[#173f35] focus:text-white focus:text-sm focus:font-bold focus:shadow-lg">
        Skip to main content
      </a>

      {/* Drawer backdrop (phones / tablets) */}
      {drawer && (
        <div
          className="fixed inset-0 z-30 bg-[#0c1311]/50 lg:hidden"
          onClick={() => setDrawer(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'} ${sidebarBg}
          flex flex-col transition-all duration-200
          ${drawer ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} lg:translate-x-0`}
        aria-label="Main navigation"
      >
        <div className={`h-16 shrink-0 px-5 ${collapsed ? 'lg:px-0 lg:justify-center' : ''} flex items-center justify-between border-b border-[#f4f2ea]/10`}>
          <Link href={homeHref} className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="God's Grace Christian Fellowship Global Ministries Inc. logo" className="w-9 h-9 rounded-full shrink-0" />
            <span className={`min-w-0 leading-tight ${label}`}>
              <span className="block text-[15px] font-bold tracking-tight text-[#f4f2ea]">FaithSync</span>
              <span className="block text-[11px] text-[#f4f2ea]/55 truncate">{portalLabel}</span>
            </span>
          </Link>
          <button
            onClick={() => setDrawer(false)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#f4f2ea]/70 hover:bg-[#f4f2ea]/10"
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <nav aria-label="Main menu" className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className={`px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f4f2ea]/40 ${label}`}>
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.links.map(({ href, icon: Icon, label: text, badge }) => {
                  const active = pathname === href;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        title={text}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-medium ${collapsed ? 'lg:justify-center' : ''}
                          ${active
                            ? 'bg-[#f4f2ea]/10 text-[#f4f2ea]'
                            : 'text-[#f4f2ea]/65 hover:text-[#f4f2ea] hover:bg-[#f4f2ea]/5'}`}
                      >
                        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#c5a66a]" />}
                        <Icon size={18} strokeWidth={1.75} className={`shrink-0 ${active ? 'text-[#c5a66a]' : ''}`} />
                        <span className={`truncate ${label}`}>{text}</span>
                        {badge > 0 && (
                          <>
                            <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-[#c5a66a] text-[#173f35] text-[11px] font-bold items-center justify-center flex ${label}`}>
                              {badge > 9 ? '9+' : badge}
                            </span>
                            {collapsed && <span className="hidden lg:block absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#c5a66a]" />}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 p-3 border-t border-[#f4f2ea]/10">
          <button
            onClick={toggleCollapsed}
            className={`hidden lg:flex w-full items-center gap-3 h-10 px-3 rounded-xl text-sm font-medium text-[#f4f2ea]/65 hover:text-[#f4f2ea] hover:bg-[#f4f2ea]/5 ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className={`transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-64'} min-w-0`}>

        {/* Top bar */}
        <header className={`sticky top-0 z-20 h-16 border-b backdrop-blur ${topBg} flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setDrawer(true)}
              className={`lg:hidden w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBtn}`}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <Link href={homeHref} className={`${topMuted} hover:underline hidden sm:inline`}>{portalLabel}</Link>
              {current && pathname !== homeHref && (
                <>
                  <ChevronRight size={14} className={`${topMuted} hidden sm:inline shrink-0`} strokeWidth={1.75} />
                  <span className={`font-semibold truncate ${topText}`}>{current.label}</span>
                </>
              )}
              {(!current || pathname === homeHref) && (
                <span className={`font-semibold truncate ${topText}`}>{current?.label || portalLabel}</span>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {themeToggle && (
              <button
                onClick={themeToggle}
                className={`w-9 h-9 rounded-full border flex items-center justify-center ${iconBtn}`}
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
              </button>
            )}

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenu}
                className={`flex items-center gap-2.5 h-10 pl-1.5 pr-2.5 rounded-full border ${iconBtn}`}
              >
                {avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                  : (
                    <span className="w-7 h-7 rounded-full bg-[#173f35] text-[#c5a66a] text-[11px] font-bold flex items-center justify-center">
                      {initials}
                    </span>
                  )}
                <span className="hidden sm:block text-left leading-tight max-w-[10rem]">
                  <span className={`block text-xs font-semibold truncate ${topText}`}>{roleLabel}</span>
                  <span className={`block text-[10px] truncate ${topMuted}`}>{subLabel}</span>
                </span>
                <ChevronDown size={14} strokeWidth={1.75} className={`hidden sm:block ${topMuted}`} />
              </button>

              {userMenu && (
                <div
                  role="menu"
                  className={`absolute right-0 mt-2 w-64 rounded-2xl border shadow-xl p-1.5 z-50 ${dark ? 'bg-[#1b2420] border-white/10' : 'bg-white border-[#e5e3d8]'}`}
                >
                  <div className={`px-3 py-3 mb-1 border-b ${dark ? 'border-white/10' : 'border-[#efede4]'}`}>
                    <p className={`text-sm font-semibold ${topText}`}>{roleLabel}</p>
                    <p className={`text-xs truncate ${topMuted}`}>{user?.email || 'Loading...'}</p>
                  </div>
                  {menuLinks.map(({ href, icon: Icon, label: text }) => (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      className={`flex items-center gap-3 h-10 px-3 rounded-xl text-sm ${dark ? 'text-[#e9ece9] hover:bg-white/5' : 'text-[#252a28] hover:bg-[#f8f7f2]'}`}
                    >
                      <Icon size={16} strokeWidth={1.75} className="text-[#858b87]" /> {text}
                    </Link>
                  ))}
                  <button
                    role="menuitem"
                    onClick={onSignOut}
                    className={`w-full flex items-center gap-3 h-10 px-3 rounded-xl text-sm text-[#b03c3c] ${dark ? 'hover:bg-white/5' : 'hover:bg-[#fbeeee]'}`}
                  >
                    <LogOut size={16} strokeWidth={1.75} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none">{children}</main>
      </div>
    </div>
  );
}
