import { DIWALI_CAMPAIGN, isCampaignActive } from "@/lib/config/campaign";
import { DiwaliAnnouncementBar } from "./DiwaliAnnouncementBar";

/**
 * Server-rendered gate for the temporary campaign. Keeping the date check on
 * the server means expired promotions never reach the HTML; the client bar
 * also schedules a hide timer so long-lived/static pages expire promptly too.
 */
export function DiwaliAnnouncement() {
  if (!isCampaignActive()) return null;
  return <DiwaliAnnouncementBar campaign={DIWALI_CAMPAIGN} />;
}
