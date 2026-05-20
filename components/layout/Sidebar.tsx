'use client';

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { MapIcon } from "../icons/MapIcon";
import { GraphIcon } from "../icons/GraphIcon";
import { DataSourcesIcon } from "../icons/DataSourcesIcon";
import { InfoIcon } from "../icons/InfoIcon";
import { startRouteTransition } from "@/components/loading/routeTransition";

type NavLink = { href: string; label: string };

type Props = {
  navLinks: NavLink[];
  statusText: string;
  collapsed: boolean;
  onSetCollapsed: (next: boolean) => void;
};

export function Sidebar({ navLinks, statusText, collapsed, onSetCollapsed }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const hoverDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const clearHoverDelay = useCallback(() => {
    if (!hoverDelayTimerRef.current) return;
    clearTimeout(hoverDelayTimerRef.current);
    hoverDelayTimerRef.current = null;
  }, []);

  const scheduleCollapseState = useCallback(
    (next: boolean, delayMs = 100) => {
      clearHoverDelay();
      hoverDelayTimerRef.current = setTimeout(() => {
        onSetCollapsed(next);
      }, delayMs);
    },
    [clearHoverDelay, onSetCollapsed],
  );

  const supportsDesktopHover = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  useEffect(() => () => clearHoverDelay(), [clearHoverDelay]);

  const iconByHref: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    "/": MapIcon,
    "/graph": GraphIcon,
    "/data-sources": DataSourcesIcon,
    "/about": InfoIcon,
  };

  const content = (
    <aside
      ref={rootRef}
      className={`relative flex h-full flex-col border-r border-blue-900 bg-blue-950 shadow-sm transition-all duration-200 ${
        collapsed ? "w-20" : "w-64"
      } motion-reduce:transition-none`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || !supportsDesktopHover()) return;
        scheduleCollapseState(false, 100);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || !supportsDesktopHover()) return;
        scheduleCollapseState(true, 120);
      }}
      onFocusCapture={() => {
        scheduleCollapseState(false, 0);
      }}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (nextFocused && rootRef.current?.contains(nextFocused)) return;
        scheduleCollapseState(true, 120);
      }}
    >
      <div className={`flex h-full flex-col ${collapsed ? "items-center pt-5" : "items-stretch pt-4"}`}>
        {/* Logo row */}
        {collapsed ? (
          <button
            type="button"
            aria-label="StateStats home"
            onClick={() => {
              if (pathname !== "/") startRouteTransition();
              router.push("/");
            }}
            className="mb-4 flex h-10 w-14 items-center justify-center rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
          >
            <Image
              src="/statestats_logo.png"
              alt="StateStats logo"
              width={48}
              height={48}
              className="h-14 w-14"
              priority
            />
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 pb-4">
            <button
              type="button"
              aria-label="StateStats home"
              onClick={() => {
                if (pathname !== "/") startRouteTransition();
                router.push("/");
              }}
              className="flex h-10 w-[3.35rem] shrink-0 items-center justify-center overflow-hidden rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
            >
              <span className="relative block h-9 w-[3.35rem] overflow-hidden" aria-hidden>
                <Image
                  src="/statestats_logo.png"
                  alt="StateStats logo"
                  fill
                  sizes="54px"
                  className="object-cover object-center"
                  priority
                />
              </span>
            </button>
            <div className="min-w-0 flex items-center">
              <Link
                href="/"
                onClick={() => {
                  if (pathname !== "/") startRouteTransition();
                }}
                className="cursor-pointer truncate text-lg font-semibold tracking-tight text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
              >
                StateStats
              </Link>
            </div>
          </div>
        )}

        {/* Nav list */}
        <nav className={`${collapsed ? "mt-2 flex-1" : "flex-1 px-2 py-2"} text-sm font-medium text-blue-100`}>
          <ul className={collapsed ? "flex flex-col items-center gap-2" : "space-y-1"}>
            {navLinks.map((link) => {
              const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              const IconComp = iconByHref[link.href] ?? MapIcon;
              if (collapsed) {
                return (
                  <li key={link.href}>
                  <Link
                      href={link.href}
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${
                        active
                          ? "bg-blue-800 text-white"
                          : "text-blue-200 hover:bg-blue-900 hover:text-white"
                      }`}
                      aria-current={active ? "page" : undefined}
                      title={link.label}
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center">
                        <IconComp
                          className={`h-9 w-9 shrink-0 ${
                            active
                              ? "text-white"
                              : "text-blue-200 group-hover:text-white"
                          }`}
                        />
                      </span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={link.href}>
                  <Link
                  href={link.href}
                  className={`group flex min-w-0 items-center gap-3 overflow-hidden rounded-lg px-3 py-3 transition ${
                    active
                      ? "bg-blue-800 text-white"
                      : "text-blue-100 hover:bg-blue-900 hover:text-white"
                  } justify-start`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center">
                    <IconComp
                      className={`h-9 w-9 shrink-0 ${
                        active ? "text-white" : "text-blue-200 group-hover:text-white"
                      }`}
                    />
                  </span>
                  <span className="min-w-0 truncate text-base">{link.label}</span>
                </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Live data badge */}
        <div className={`${collapsed ? "mb-4 mt-auto" : "px-3 pb-4"}`}>
          <div className="rounded-lg border border-blue-700 bg-blue-900/70 px-3 py-2 text-xs text-white shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[color:var(--ss-green)]" aria-hidden />
              {!collapsed && <span className="font-semibold">Live data</span>}
            </div>
            {!collapsed && <p className="mt-1 leading-snug">{statusText}</p>}
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="relative hidden h-full md:block">{content}</div>
    </>
  );
}
