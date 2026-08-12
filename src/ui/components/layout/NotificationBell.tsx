"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/src/lib/dates";
import { LAYER } from "@/src/ui/lib/layers";

const NOTIFICATION_PAGE_SIZE = 15;

/**
 * The platform's one in-app voice.
 *
 * Before this the only way Sonae could reach anybody was email, so a task
 * assigned or a run that failed had nowhere to land inside the product.
 *
 * The count is absent at zero rather than shown as a grey nought — the same
 * rule the approvals badge in the sidebar already follows, because a badge
 * that is always there stops being read.
 *
 * Deliberately not built on `SonaeModal`: that component has no focus trap,
 * no Escape handler and no dialog role. This panel handles its own Escape
 * and outside-press, and is labelled.
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const tTasks = useTranslations("tasks");
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unread = useQuery(api.notifications.countMineUnread, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.listMine,
    isOpen ? {} : "skip",
    { initialNumItems: NOTIFICATION_PAGE_SIZE },
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllMineRead);

  useEffect(() => {
    if (!isOpen) return;

    function handlePressOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePressOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePressOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const count = unread?.count ?? 0;
  const countLabel = unread?.atLimit ? `${count}+` : `${count}`;

  const handleOpenItem = async (notificationId: Id<"notifications">, alreadyRead: boolean) => {
    setIsOpen(false);
    if (alreadyRead) return;
    try {
      await markRead({ notificationId });
    } catch {
      // A failed read-mark is not worth an error state in the header; the
      // item simply stays unread and the next press tries again.
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={count > 0 ? t("waiting", { count: countLabel }) : t("open")}
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {/* Absent at zero on purpose. */}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-semibold leading-4 text-center">
            {countLabel}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="menu"
            aria-label={t("title")}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 top-full mt-3 w-[340px] max-h-[420px] overflow-y-auto scrollbar-hide bg-card border border-border-dim rounded-[14px] shadow-2xl ${LAYER.HEADER} flex flex-col`}
          >
            <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border-dim">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                {t("title")}
              </span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead({})}
                  className="text-[11px] text-secondary hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  {t("markAllRead")}
                </button>
              )}
            </div>

            {results.length === 0 && status !== "LoadingFirstPage" ? (
              <p className="px-4 py-6 text-[13px] text-muted text-center">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col">
                {results.map((notification) => {
                  const isUnread = !notification.readAt;
                  const body = (
                    <>
                      <span className="flex items-start gap-2">
                        {/* A dot, not a colour pair: unread is a presence, not
                            a good-or-bad signal. */}
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUnread ? "bg-brand" : "bg-transparent"}`}
                        />
                        <span className="flex flex-col gap-0.5 min-w-0">
                          <span className={`text-[13px] leading-snug ${isUnread ? "text-foreground" : "text-secondary"}`}>
                            {notification.title}
                          </span>
                          {notification.body && (
                            <span className="text-[12px] text-muted line-clamp-2">{notification.body}</span>
                          )}
                          <span className="text-[10px] text-muted/70">
                            {formatDateTime(notification.createdAt, { locale: [] })}
                          </span>
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={notification._id} className="border-b border-border-dim last:border-b-0">
                      {notification.href ? (
                        <Link
                          href={notification.href}
                          role="menuitem"
                          onClick={() => handleOpenItem(notification._id, Boolean(notification.readAt))}
                          className="block px-4 py-3 hover:bg-foreground/[0.03] transition-colors"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleOpenItem(notification._id, Boolean(notification.readAt))}
                          className="block w-full text-left px-4 py-3 hover:bg-foreground/[0.03] transition-colors"
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {status === "CanLoadMore" && (
              <button
                type="button"
                onClick={() => loadMore(NOTIFICATION_PAGE_SIZE)}
                className="px-4 py-2.5 text-[12px] text-muted hover:text-foreground transition-colors"
              >
                {tTasks("showMore")}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
