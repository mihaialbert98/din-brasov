/**
 * Newsletter send engine — shared low-level batching/throttle/guard used by both
 * the weekly digest and one-off custom campaigns. Server-only.
 *
 * Resend free tier: 100 emails/day, 3000/month. We batch with a small delay and
 * cap a single run at DAILY_CAP, returning `skipped` so a later run can continue.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import type { NewsletterSubscriber } from "@/lib/db/schema";
import { composeDigest } from "@/lib/newsletter-digest";
import {
  sendNewsletterDigest,
  sendCustomCampaign,
  type CampaignContent,
} from "@/lib/email";

const DAILY_CAP = 100; // Resend free tier
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1100; // gentle pacing between batches

export interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[]; // who was sent (or would be, on dry run)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function activeSubscribers(): Promise<NewsletterSubscriber[]> {
  return db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "active"));
}

/** Recently sent (within 6 days) — digest double-send guard. */
function sentRecently(sub: NewsletterSubscriber): boolean {
  if (!sub.lastSentAt) return false;
  return Date.now() - new Date(sub.lastSentAt).getTime() < 6 * 24 * 60 * 60 * 1000;
}

export type CampaignAudience = "news" | "events" | "places" | "all";

function matchesAudience(sub: NewsletterSubscriber, audience: CampaignAudience): boolean {
  switch (audience) {
    case "news":
      return sub.wantsNews;
    case "events":
      return sub.wantsEvents;
    case "places":
      return sub.wantsPlaces;
    case "all":
      return true;
  }
}

/**
 * Weekly digest. Each subscriber gets only the sections they opted into AND that
 * have content this week; subscribers with no non-empty opted-in section are
 * skipped (no empty emails). Recently-sent subscribers are skipped.
 */
export async function sendWeeklyDigest({
  since,
  dryRun = false,
}: { since?: Date; dryRun?: boolean } = {}): Promise<SendResult> {
  const digest = await composeDigest({ since });
  const hasNews = digest.news.items.length > 0;
  const hasEvents = digest.events.items.length > 0;
  const hasPlaces = digest.places.items.length > 0;

  const subs = await activeSubscribers();

  // Determine each subscriber's effective (opted-in AND non-empty) sections.
  const targets = subs
    .map((sub) => {
      const sections = {
        news: sub.wantsNews && hasNews,
        events: sub.wantsEvents && hasEvents,
        places: sub.wantsPlaces && hasPlaces,
      };
      return { sub, sections, any: sections.news || sections.events || sections.places };
    })
    .filter((t) => t.any && !sentRecently(t.sub));

  const result: SendResult = {
    sent: 0,
    skipped: subs.length - targets.length,
    failed: 0,
    recipients: [],
  };

  if (dryRun) {
    result.recipients = targets.map((t) => t.sub.email);
    return result;
  }

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (result.sent >= DAILY_CAP) {
      result.skipped += targets.length - i;
      break;
    }
    const batch = targets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (t) => {
        try {
          await sendNewsletterDigest(
            t.sub.email,
            t.sub.verificationToken ?? "",
            digest,
            t.sections
          );
          await db
            .update(newsletterSubscribers)
            .set({ lastSentAt: new Date() })
            .where(eq(newsletterSubscribers.id, t.sub.id));
          result.sent++;
          result.recipients.push(t.sub.email);
        } catch {
          result.failed++;
        }
      })
    );
    if (i + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
  }

  return result;
}

/**
 * One-off custom campaign to a chosen audience. No lastSentAt guard (campaigns
 * are deliberate one-offs; the dry-run + confirm dialog is the safety).
 */
export async function sendCampaign({
  content,
  audience,
  dryRun = false,
}: {
  content: CampaignContent;
  audience: CampaignAudience;
  dryRun?: boolean;
}): Promise<SendResult> {
  const subs = await activeSubscribers();
  const targets = subs.filter((s) => matchesAudience(s, audience));

  const result: SendResult = {
    sent: 0,
    skipped: subs.length - targets.length,
    failed: 0,
    recipients: [],
  };

  if (dryRun) {
    result.recipients = targets.map((s) => s.email);
    return result;
  }

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (result.sent >= DAILY_CAP) {
      result.skipped += targets.length - i;
      break;
    }
    const batch = targets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (s) => {
        try {
          await sendCustomCampaign(s.email, s.verificationToken ?? "", content);
          result.sent++;
          result.recipients.push(s.email);
        } catch {
          result.failed++;
        }
      })
    );
    if (i + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
  }

  return result;
}
